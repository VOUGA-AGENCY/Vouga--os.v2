import { runtime, equal, required, hash } from "@/services/runtime";
import { enqueue } from "@/services/activity-service";
import { errorResponse, jsonBody } from "@/foundation/http";
import { AppError, record } from "@/domain/validation";
export async function POST(request: Request) {
  try {
    const ctx = runtime();
    if (
      !equal(
        required(ctx.env, "TELEGRAM_WEBHOOK_SECRET"),
        request.headers.get("X-Telegram-Bot-Api-Secret-Token") || "",
      )
    )
      throw new AppError("Webhook inválido.", 403);
    const body = record(await jsonBody(request));
    if (!Number.isSafeInteger(body.update_id))
      throw new AppError("Update inválido.");
    const message = record(body.message ?? {}),
      callback = record(body.callback_query ?? {}),
      callbackMessage = record(callback.message ?? {}),
      chat = record(message.chat ?? callbackMessage.chat ?? {}),
      from = record(message.from ?? callback.from ?? {});
    const data = await ctx.repo.read();
    const code =
      typeof message.text === "string"
        ? message.text.match(/^\/start ([a-f0-9]{48})$/)?.[1]
        : undefined;
    const allowed =
      data.members.some(
        (member) =>
          member.telegramChatId === String(chat.id) &&
          member.telegramUserId === String(from.id),
      ) ||
      !!(
        code &&
        data.telegramLinks.some(
          (link) => link.hash === hash(code) && link.expiresAt > ctx.now(),
        )
      );
    if (chat.type === "private" && chat.id === from.id && allowed)
      await ctx.repo.transact((data) =>
        enqueue(
          data,
          `telegram:${body.update_id}`,
          "telegram.update",
          body,
          ctx.now(),
        ),
      );
    return Response.json({ ok: true });
  } catch (error) {
    return errorResponse(error);
  }
}
