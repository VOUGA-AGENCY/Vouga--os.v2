import { beforeEach, describe, expect, it, vi } from "vitest";
import { createSeed } from "@/persistence/seed";
import { executeCommand } from "@/application/commands";
import { executeAgentTool } from "@/services/agent-service";
import { queueCreationNotices } from "@/services/creation-notifications";
import { processJobs } from "@/services/integration-worker";
import type { ServiceContext } from "@/services/runtime";
import type { Store } from "@/domain/model";

const now = "2026-09-27T18:00:00.000Z";
const fixture = createSeed("notifications-test-only", now);
let data: Store;
let ctx: ServiceContext;
const notices = () =>
  data.integrationJobs.filter((job) => job.kind === "telegram.created");
const command = (action: string, values: Record<string, unknown>) =>
  executeCommand(data, data.members[0], { action, values }, now);
const link = (...ids: string[]) =>
  ids.forEach((id) => {
    data.members.find((m) => m.id === id)!.telegramChatId = `chat-${id}`;
  });
beforeEach(() => {
  data = structuredClone(fixture);
  ctx = {
    repo: {
      read: async () => structuredClone(data),
      transact: async (fn) => {
        const clone = structuredClone(data);
        const result = fn(clone);
        data = clone;
        return result;
      },
    },
    env: { TELEGRAM_BOT_TOKEN: "test-token" },
    now: () => now,
    fetch: vi.fn(
      async () =>
        new Response(JSON.stringify({ ok: true, result: { message_id: 1 } }), {
          status: 200,
        }),
    ) as typeof fetch,
  };
});

describe("creation notifications without AI", () => {
  it("notifies yourself for a private task once, without contacting any AI provider", async () => {
    link("miguel", "afonso");
    const before = structuredClone(data);
    command("task.save", {
      title: "Preparar proposta",
      ownerId: "miguel",
      visibility: "private",
      dueOn: "2026-09-28",
    });
    queueCreationNotices(data, before, data.members[0], now);
    expect(notices()).toHaveLength(1);
    await processJobs(ctx);
    // Even redelivery of the same leased job must not send a second message.
    data.integrationJobs[0].state = "pending";
    await processJobs(ctx);
    expect(ctx.fetch).toHaveBeenCalledTimes(1);
    const [url, options] = vi.mocked(ctx.fetch).mock.calls[0];
    expect(String(url)).toBe(
      "https://api.telegram.org/bottest-token/sendMessage",
    );
    const message = JSON.parse(String(options?.body));
    expect(message.chat_id).toBe("chat-miguel");
    expect(message.text).toContain("New task · Preparar proposta");
    expect(message.text).toContain("Deadline:");
    expect(data.notificationDeliveries[0].state).toBe("sent");
  });
  it("notifies only the assigned owner, including tasks created by the shared Agent tools", async () => {
    link("miguel", "afonso");
    await executeAgentTool(ctx, data.members[0], "createTask", {
      title: "Rever OCR",
      ownerId: "afonso",
    });
    expect(notices().map((job) => job.payload.memberId)).toEqual(["afonso"]);
    expect(ctx.fetch).not.toHaveBeenCalled();
    await processJobs(ctx);
    expect(ctx.fetch).toHaveBeenCalledTimes(1);
  });
  it("does not notify edits or backfill existing records", () => {
    link("miguel");
    const task = data.tasks.find((item) => item.ownerId === "miguel")!;
    command("task.save", { ...task, title: "Título atualizado" });
    expect(notices()).toHaveLength(0);
  });
  it("deduplicates multi-calendar events and respects engineer calendar access", () => {
    link("miguel", "vasco", "afonso");
    command("meeting.save", {
      title: "Reunião",
      startsAt: "2026-09-28T10:00",
      endsAt: "2026-09-28T11:00",
      calendarTargets: ["office", "contacto", "personal:miguel"],
      participantIds: ["miguel", "vasco"],
    });
    expect(
      notices()
        .map((job) => job.payload.memberId)
        .sort(),
    ).toEqual(["miguel", "vasco"]);
    command("meeting.save", {
      title: "Só Office",
      startsAt: "2026-09-28T12:00",
      endsAt: "2026-09-28T13:00",
      calendarTargets: ["office"],
      participantIds: ["miguel", "vasco"],
    });
    expect(
      notices().filter((job) => job.payload.memberId === "vasco"),
    ).toHaveLength(1);
  });
  it("does not treat adding calendars to an existing event as a new creation", () => {
    link("miguel");
    const event = data.meetings[0];
    command("meeting.save", {
      ...event,
      calendarTargets: ["office", "contacto"],
      participantIds: ["miguel"],
    });
    expect(notices()).toHaveLength(0);
  });
  it("suppresses queued messages if participation or access is removed before delivery", async () => {
    link("miguel");
    command("meeting.save", {
      title: "Pessoal",
      startsAt: "2026-09-28T10:00",
      endsAt: "2026-09-28T11:00",
      calendarTargets: ["personal:miguel"],
      participantIds: ["miguel"],
    });
    expect(notices()).toHaveLength(1);
    data.meetings.at(-1)!.cancelled = true;
    await processJobs(ctx);
    expect(ctx.fetch).not.toHaveBeenCalled();
    command("task.save", { title: "Atribuição", ownerId: "miguel" });
    data.tasks.at(-1)!.ownerId = "afonso";
    await processJobs(ctx);
    expect(ctx.fetch).not.toHaveBeenCalled();
  });
  it("includes all-day creation alerts, independently of timed meeting reminders", () => {
    link("miguel");
    command("meeting.save", {
      title: "Visita",
      startsAt: "2026-09-28T00:00",
      endsAt: "2026-09-29T00:00",
      allDay: true,
      calendarTargets: ["personal:miguel"],
      participantIds: ["miguel"],
    });
    expect(notices()).toHaveLength(1);
  });
  it("notifies project members once and only explicit note recipients", () => {
    link("miguel", "afonso", "vasco");
    command("project.save", {
      name: "Novo projeto",
      ownerId: "miguel",
      memberIds: ["miguel", "afonso"],
    });
    expect(
      notices()
        .map((job) => job.payload.memberId)
        .sort(),
    ).toEqual(["afonso", "miguel"]);
    command("note.save", {
      title: "Nota privada",
      body: "Contexto",
      visibility: "private",
    });
    expect(
      notices()
        .filter((job) => job.payload.entityType === "note")
        .map((job) => job.payload.memberId),
    ).toEqual(["miguel"]);
    command("note.save", {
      title: "Nota partilhada",
      body: "Contexto",
      visibility: "shared",
      recipientIds: ["afonso"],
    });
    expect(
      notices().filter((job) => job.payload.entityType === "note"),
    ).toHaveLength(3);
  });
  it("does not queue messages for unlinked or disabled accounts", () => {
    command("task.save", { title: "Sem Telegram", ownerId: "miguel" });
    link("miguel");
    data.accounts.find((a) => a.memberId === "miguel")!.disabled = true;
    command("task.save", { title: "Login desativado", ownerId: "miguel" });
    expect(notices()).toHaveLength(0);
  });
  it("drops queued notifications when an account is archived", async () => {
    link("miguel");
    command("task.save", { title: "Antes de arquivar", ownerId: "miguel" });
    data.members[0].archived = true;
    await processJobs(ctx);
    expect(ctx.fetch).not.toHaveBeenCalled();
  });
  it("does not retry an uncertain Telegram send and risk sending duplicates", async () => {
    link("miguel");
    command("task.save", { title: "Uma só mensagem", ownerId: "miguel" });
    vi.mocked(ctx.fetch).mockRejectedValue(new Error("network timeout"));
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      await processJobs(ctx);
      expect(data.notificationDeliveries[0].state).toBe("uncertain");
      data.integrationJobs[0].availableAt = now;
      await processJobs(ctx);
      expect(ctx.fetch).toHaveBeenCalledTimes(1);
    } finally {
      log.mockRestore();
    }
  });
});
