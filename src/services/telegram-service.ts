import { isActiveMember } from "@/domain/team";
import { creationNotice, type CreationNotice } from "./creation-notifications";
import { canSeeMeeting } from "@/domain/permissions";
import { uniqueEvents, calendarLabel } from "@/domain/calendars";
import { randomBytes } from "node:crypto";
import type { Member, Store } from "@/domain/model";
import { AppError } from "@/domain/validation";
import { dateKey, timeLabel } from "@/domain/time";
import {
  api,
  hash,
  required,
  publicOrigin,
  boundedBody,
  type ServiceContext,
} from "./runtime";
import { runAgent, decideAction } from "./agent-service";
import { transcribe } from "./transcription-service";
interface TelegramUpdate {
  update_id: number;
  message?: {
    message_id: number;
    chat: { id: number; type: string };
    from?: { id: number };
    text?: string;
    voice?: { file_id: string; file_size?: number; duration: number };
  };
  callback_query?: {
    id: string;
    from: { id: number };
    data?: string;
    message?: { chat: { id: number; type: string } };
  };
}
const endpoint = (ctx: ServiceContext, method: string) =>
  `https://api.telegram.org/bot${required(ctx.env, "TELEGRAM_BOT_TOKEN")}/${method}`;
async function telegram<T>(
  ctx: ServiceContext,
  method: string,
  body: unknown,
): Promise<T> {
  const result = await api<{ ok: boolean; result: T }>(
    ctx,
    "telegram",
    endpoint(ctx, method),
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    },
  );
  if (!result.ok) throw new AppError("Telegram rejected the request.", 502);
  return result.result;
}
export async function connectBot(ctx: ServiceContext) {
  const bot = await telegram<{ username: string }>(ctx, "getMe", {});
  await telegram(ctx, "setWebhook", {
    url: `${publicOrigin(ctx.env)}/api/webhooks/telegram`,
    secret_token: required(ctx.env, "TELEGRAM_WEBHOOK_SECRET"),
    allowed_updates: ["message", "callback_query"],
    drop_pending_updates: false,
  });
  await ctx.repo.transact((data) => {
    const current = data.externalConnections.find(
      (item) => item.id === "telegram",
    );
    const value = {
      id: "telegram",
      provider: "telegram" as const,
      label: bot.username,
      status: "connected" as const,
      lastError: undefined,
    };
    if (current) Object.assign(current, value);
    else data.externalConnections.push(value);
  });
  return bot.username;
}
export async function telegramLink(ctx: ServiceContext, me: Member) {
  const bot = await telegram<{ username: string }>(ctx, "getMe", {});
  const code = randomBytes(24).toString("hex");
  await ctx.repo.transact((data) => {
    data.telegramLinks = data.telegramLinks.filter(
      (item) => item.memberId !== me.id && item.expiresAt > ctx.now(),
    );
    data.telegramLinks.push({
      hash: hash(code),
      memberId: me.id,
      expiresAt: new Date(Date.parse(ctx.now()) + 600000).toISOString(),
    });
  });
  return `https://t.me/${bot.username}?start=${code}`;
}
async function send(
  ctx: ServiceContext,
  chatId: string,
  text: string,
  buttons?: unknown,
) {
  return telegram<{ message_id: number }>(ctx, "sendMessage", {
    chat_id: chatId,
    text: text.slice(0, 4000),
    link_preview_options: { is_disabled: true },
    ...(buttons ? { reply_markup: { inline_keyboard: buttons } } : {}),
  });
}
export async function applyTelegramUpdate(
  ctx: ServiceContext,
  update: TelegramUpdate,
) {
  const message = update.message,
    callback = update.callback_query,
    chat = message?.chat ?? callback?.message?.chat,
    userId = message?.from?.id ?? callback?.from.id;
  if (
    !chat ||
    chat.type !== "private" ||
    !userId ||
    String(chat.id) !== String(userId)
  )
    return;
  const start = message?.text?.match(/^\/start ([a-f0-9]{48})$/);
  if (start) {
    await ctx.repo.transact((data) => {
      const link = data.telegramLinks.find(
        (item) => item.hash === hash(start[1]) && item.expiresAt > ctx.now(),
      );
      if (!link) throw new AppError("Invalid link code.", 403);
      if (
        data.members.some(
          (member) =>
            member.telegramChatId === String(chat.id) &&
            member.id !== link.memberId,
        )
      )
        throw new AppError("This Telegram account is already linked.", 409);
      const member = data.members.find(
        (member) => member.id === link.memberId && isActiveMember(member),
      );
      if (!member) throw new AppError("This profile is no longer active.", 403);
      member.telegramChatId = String(chat.id);
      member.telegramUserId = String(userId);
      data.telegramLinks = data.telegramLinks.filter((item) => item !== link);
    });
    await sendOnce(
      ctx,
      `telegram-link:${update.update_id}`,
      String(chat.id),
      "Conta ligada ao Vouga OS.",
    );
    return;
  }
  const me = (await ctx.repo.read()).members.find(
    (member) =>
      member.telegramChatId === String(chat.id) &&
      member.telegramUserId === String(userId) &&
      isActiveMember(member),
  );
  if (!me) return;
  if (callback?.data) {
    const match = callback.data.match(/^(confirm|cancel):([a-f0-9-]{36})$/);
    if (!match) return;
    const result = await decideAction(
      ctx,
      me,
      match[2],
      match[1] === "confirm",
      "telegram",
    );
    await telegram(ctx, "answerCallbackQuery", {
      callback_query_id: callback.id,
      text: result.message,
    });
    await sendOnce(
      ctx,
      `telegram-response:${update.update_id}`,
      String(chat.id),
      result.message,
    );
    return;
  }
  let input = message?.text;
  if (message?.voice) {
    if (
      message.voice.duration > 600 ||
      (message.voice.file_size ?? 0) > 20 * 1024 * 1024
    )
      throw new AppError("Voice note superior a 10 minutos ou 20 MB.", 413);
    const file = await telegram<{ file_path: string }>(ctx, "getFile", {
      file_id: message.voice.file_id,
    });
    if (
      !/^[\w/-]+\.[\w]+$/.test(file.file_path) ||
      file.file_path.includes("..")
    )
      throw new AppError("Invalid Telegram file.");
    const response = await ctx.fetch(
      `https://api.telegram.org/file/bot${required(ctx.env, "TELEGRAM_BOT_TOKEN")}/${file.file_path}`,
      { signal: AbortSignal.timeout(25000) },
    );
    if (!response.ok) throw new AppError("Could not retrieve the audio.", 502);
    const bytes = await boundedBody(
      new Request("https://local.invalid", {
        method: "POST",
        body: response.body,
        duplex: "half",
      } as RequestInit),
      20 * 1024 * 1024,
    );
    input = await transcribe(
      ctx,
      new Blob([new Uint8Array(bytes)], { type: "audio/ogg" }),
    );
  }
  if (!input) return;
  const result = await runAgent(
    ctx,
    me,
    input,
    `telegram:${update.update_id}`,
    {},
    "telegram",
  );
  const buttons = result.pendingIds.map((id) => [
    { text: "Confirm", callback_data: `confirm:${id}` },
    { text: "Cancel", callback_data: `cancel:${id}` },
  ]);
  if (ctx.env.VOUGA_PUBLIC_URL)
    buttons.push([
      { text: "Open Vouga OS", url: publicOrigin(ctx.env) },
    ] as never);
  await sendOnce(
    ctx,
    `telegram-response:${update.update_id}`,
    String(chat.id),
    result.text,
    buttons,
  );
}
// Telegram has no idempotency key for sendMessage. Reserve before network I/O;
// uncertain sends are NOT automatically retried, preventing duplicate reminders.
export async function sendOnce(
  ctx: ServiceContext,
  key: string,
  chatId: string,
  text: string,
  buttons?: unknown,
  memberId = "",
) {
  const claimed = await ctx.repo.transact((data) => {
    if (data.notificationDeliveries.some((item) => item.key === key))
      return false;
    data.notificationDeliveries.push({
      key,
      memberId,
      state: "sending",
      createdAt: ctx.now(),
    });
    return true;
  });
  if (!claimed) return;
  try {
    await send(ctx, chatId, text, buttons);
    await ctx.repo.transact((data) => {
      const delivery = data.notificationDeliveries.find(
        (item) => item.key === key,
      )!;
      delivery.state = "sent";
      delivery.sentAt = ctx.now();
    });
  } catch (error) {
    await ctx.repo.transact((data) => {
      data.notificationDeliveries.find((item) => item.key === key)!.state =
        "uncertain";
    });
    throw error;
  }
}
export function meetingReminders(data: Store, now: string) {
  const today = dateKey(now);
  const localTime = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/Lisbon",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).format(new Date(now));
  const [hour, minute] = localTime.split(":").map(Number);
  const jobs: {
    key: string;
    memberId: string;
    chatId: string;
    text: string;
  }[] = [];
  for (const member of data.members) {
    if (!member.telegramChatId || !isActiveMember(member)) continue;
    const events = uniqueEvents(
      data.meetings
        .filter(
          (event) =>
            !event.cancelled &&
            canSeeMeeting(member, event) &&
            !event.allDay &&
            event.participantIds.includes(member.id),
        )
        .sort((a, b) => a.startsAt.localeCompare(b.startsAt)),
    );
    const todayEvents = events.filter(
      (event) => dateKey(event.startsAt) === today,
    );
    if (hour === 8 && minute < 15 && todayEvents.length)
      jobs.push({
        key: `daily:${member.id}:${today}`,
        memberId: member.id,
        chatId: member.telegramChatId,
        text: `Hoje\n${todayEvents.map((event) => `${timeLabel(event.startsAt)} · ${event.title}`).join("\n")}`,
      });
    for (const event of events) {
      const minutes = (Date.parse(event.startsAt) - Date.parse(now)) / 60000;
      if (minutes > 55 && minutes <= 60)
        jobs.push({
          key: `hour:${member.id}:${event.groupId ?? event.id}:${event.startsAt}`,
          memberId: member.id,
          chatId: member.telegramChatId,
          text: `${event.title} starts within 1 hour\n${timeLabel(event.startsAt)} · ${calendarLabel(event, data.members)}`,
        });
    }
  }
  return jobs;
}
export async function deliverReminders(ctx: ServiceContext) {
  if (!ctx.env.TELEGRAM_BOT_TOKEN) return;
  for (const job of meetingReminders(await ctx.repo.read(), ctx.now()))
    await sendOnce(ctx, job.key, job.chatId, job.text, undefined, job.memberId);
}

export async function deliverCreationNotice(
  ctx: ServiceContext,
  key: string,
  notice: CreationNotice,
) {
  const message = creationNotice(await ctx.repo.read(), notice);
  if (!message) return;
  await sendOnce(
    ctx,
    key,
    message.chatId,
    message.text,
    undefined,
    message.memberId,
  );
}
