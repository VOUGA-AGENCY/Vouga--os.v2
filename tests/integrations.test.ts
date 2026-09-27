import { beforeEach, describe, expect, it, vi } from "vitest";
import { createSeed } from "@/persistence/seed";
import { executeCommand } from "@/application/commands";
import { workspaceFor } from "@/projections/workspace";
import { seal, unseal, equal, type ServiceContext } from "@/services/runtime";
import {
  meetingReminders,
  sendOnce,
  applyTelegramUpdate,
} from "@/services/telegram-service";
import {
  executeAgentTool,
  decideAction,
  runAgent,
} from "@/services/agent-service";
import {
  applyGithubEvent,
  type GithubPayload,
} from "@/services/github-service";
import { enqueue } from "@/services/activity-service";
import { processJobs } from "@/services/integration-worker";
import { pullCalendar, pushCalendarEvent } from "@/services/calendar-service";
import type { Store } from "@/domain/model";
const now = "2026-09-26T07:00:00.000Z",
  fixture = createSeed("test-only-password", now);
let data: Store, ctx: ServiceContext;
beforeEach(() => {
  data = structuredClone(fixture);
  ctx = {
    repo: {
      read: async () => structuredClone(data),
      transact: async (fn) => {
        const clone = structuredClone(data);
        const result = fn(clone);
        clone.revision++;
        data = clone;
        return result;
      },
    },
    fetch: vi.fn() as unknown as typeof fetch,
    now: () => now,
    env: {
      INTEGRATION_ENCRYPTION_KEY: Buffer.alloc(32, 1).toString("base64"),
      TELEGRAM_BOT_TOKEN: "test-token",
      GITHUB_INSTALLATION_ID: "123",
      GROQ_API_KEY: "test-key",
      GOOGLE_CLIENT_ID: "test-id",
      GOOGLE_CLIENT_SECRET: "test-secret",
    },
  };
});
const response = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
function googleConnection() {
  data.externalConnections.push({
    id: "google:office",
    provider: "google",
    label: "Office",
    status: "connected",
    credentials: seal({ refreshToken: "test-refresh" }, ctx.env),
  });
}
describe("secrets and permissions", () => {
  it("encrypts authenticated credentials and never serializes them or chat IDs into workspace", () => {
    const encrypted = seal({ refreshToken: "hidden" }, ctx.env);
    expect(encrypted).not.toContain("hidden");
    expect(unseal(encrypted, ctx.env)).toEqual({ refreshToken: "hidden" });
    expect(() =>
      unseal(encrypted, {
        INTEGRATION_ENCRYPTION_KEY: Buffer.alloc(32, 2).toString("base64"),
      }),
    ).toThrow();
    data.externalConnections.push({
      id: "google:office",
      provider: "google",
      label: "Office",
      status: "connected",
      credentials: encrypted,
    });
    data.members[0].telegramChatId = "secret-chat";
    const view = JSON.stringify(workspaceFor(data, data.members[0], now));
    expect(view).not.toContain(encrypted);
    expect(view).not.toContain("secret-chat");
    expect(equal("abc", "ab")).toBe(false);
  });
  it("does not leak task activity from a private project", () => {
    executeCommand(
      data,
      data.members[0],
      {
        action: "task.save",
        values: { title: "Private", projectId: "discovery", ownerId: "afonso" },
      },
      now,
    );
    expect(workspaceFor(data, data.members[2], now).activity).toHaveLength(0);
    expect(workspaceFor(data, data.members[0], now).activity).toHaveLength(1);
  });
});
describe("operational calendars and queue", () => {
  it("defaults CRM to Contacto and projects to Office independently of people", () => {
    executeCommand(
      data,
      data.members[0],
      {
        action: "meeting.save",
        values: {
          title: "CRM",
          startsAt: "2026-09-26T10:00",
          endsAt: "2026-09-26T10:30",
          organizationId: "norte",
          participantIds: ["pedro"],
        },
      },
      now,
    );
    expect(data.meetings.at(-1)?.calendarKey).toBe("contacto");
    executeCommand(
      data,
      data.members[0],
      {
        action: "meeting.save",
        values: {
          title: "Project",
          startsAt: "2026-09-26T10:00",
          endsAt: "2026-09-26T10:30",
          projectId: "operations",
          participantIds: ["miguel"],
        },
      },
      now,
    );
    expect(data.meetings.at(-1)?.calendarKey).toBe("office");
    expect(data.integrationJobs).toHaveLength(2);
    expect(
      data.activity.filter((item) => item.entityType === "calendar"),
    ).toHaveLength(2);
  });
  it("deduplicates deliveries before execution", () => {
    enqueue(data, "one", "calendar.pull", { calendarKey: "office" }, now);
    enqueue(data, "one", "calendar.pull", { calendarKey: "office" }, now);
    expect(data.integrationJobs).toHaveLength(1);
  });
  it("imports the same Google event once and advances its sync token", async () => {
    googleConnection();
    vi.mocked(ctx.fetch).mockImplementation(async (url) =>
      String(url).includes("oauth2")
        ? response({ access_token: "x" })
        : response({
            items: [
              {
                id: "google-event",
                summary: "Imported",
                etag: "v1",
                start: { dateTime: "2026-09-26T10:00:00+01:00" },
                end: { dateTime: "2026-09-26T10:30:00+01:00" },
              },
            ],
            nextSyncToken: "next",
          }),
    );
    await pullCalendar(ctx, "office");
    await pullCalendar(ctx, "office");
    expect(
      data.meetings.filter((event) => event.googleEventId === "google-event"),
    ).toHaveLength(1);
    expect(
      data.activity.filter((event) => event.source === "google"),
    ).toHaveLength(1);
    expect(data.externalConnections[0].syncToken).toBe("next");
    expect(data.inbox).toHaveLength(1);
  });
  it("resets expired Google sync tokens after 410 without dropping local data", async () => {
    googleConnection();
    data.externalConnections[0].syncToken = "expired";
    vi.mocked(ctx.fetch).mockImplementation(async (url) =>
      String(url).includes("oauth2")
        ? response({ access_token: "x" })
        : String(url).includes("syncToken=expired")
          ? response({}, 410)
          : response({ items: [], nextSyncToken: "fresh" }),
    );
    await pullCalendar(ctx, "office");
    expect(data.externalConnections[0].syncToken).toBe("fresh");
    expect(data.meetings).toHaveLength(fixture.meetings.length);
  });
  it("uses stable Google IDs on a retry and stores external references", async () => {
    googleConnection();
    const event = data.meetings[0];
    event.calendarKey = "office";
    event.syncStatus = "pending";
    vi.mocked(ctx.fetch).mockImplementation(async (url, init) =>
      String(url).includes("oauth2")
        ? response({ access_token: "x" })
        : init?.method === "POST"
          ? response({}, 409)
          : response({
              id: "existing",
              etag: "v1",
              htmlLink: "https://calendar.google.com/calendar/event?eid=1",
              extendedProperties: { private: { vougaId: event.id } },
            }),
    );
    await pushCalendarEvent(ctx, event.id);
    expect(data.meetings[0].googleCalendarId).toBe("office@vouga-agency.pt");
    expect(data.meetings[0].googleEventId).toMatch(/^v[a-f0-9]{40}$/);
    expect(data.meetings[0].syncStatus).toBe("synced");
  });
  it("leaves a conflicting Google edit for intervention instead of overwriting it", async () => {
    googleConnection();
    Object.assign(data.meetings[0], {
      calendarKey: "office",
      syncStatus: "pending",
      googleEventId: "event",
      googleCalendarId: "office@vouga-agency.pt",
      googleEtag: "old",
    });
    vi.mocked(ctx.fetch).mockImplementation(async (url) =>
      String(url).includes("oauth2")
        ? response({ access_token: "x" })
        : response({}, 412),
    );
    await expect(pushCalendarEvent(ctx, data.meetings[0].id)).rejects.toThrow();
    expect(data.meetings[0].syncStatus).toBe("conflict");
    expect(data.inbox[0].body).toContain("Conflito");
  });
  it("does not process a live leased job twice", async () => {
    enqueue(data, "event", "calendar.pull", { calendarKey: "office" }, now);
    data.integrationJobs[0].state = "processing";
    data.integrationJobs[0].leaseUntil = "2026-09-26T07:05:00.000Z";
    await processJobs(ctx);
    expect(ctx.fetch).not.toHaveBeenCalled();
  });
});
describe("Agent domain tools", () => {
  it("executes explicit task creation and validates permissions inside the backend", async () => {
    await executeAgentTool(ctx, data.members[0], "createTask", {
      title: "Check OCR",
      ownerId: "afonso",
      projectId: "discovery",
    });
    expect(data.tasks.at(-1)?.title).toBe("Check OCR");
    expect(data.activity.at(-1)?.source).toBe("agent");
    await expect(
      executeAgentTool(ctx, data.members[2], "moveTask", {
        id: "visit",
        status: "done",
      }),
    ).rejects.toThrow("sem acesso");
    await expect(
      executeAgentTool(ctx, data.members[0], "createTask", {
        title: "x",
        ownerId: "miguel",
        sql: "DROP TABLE",
      }),
    ).rejects.toThrow("não permitido");
  });
  it("requires confirmation for cancellation, rechecks actor and handles repeat confirmation", async () => {
    const result = (await executeAgentTool(
      ctx,
      data.members[0],
      "cancelCalendarEvent",
      { id: "alignment" },
    )) as { pendingId: string };
    expect(data.meetings[0].cancelled).toBe(false);
    await expect(
      decideAction(ctx, data.members[1], result.pendingId, true),
    ).rejects.toThrow();
    await decideAction(ctx, data.members[0], result.pendingId, true);
    expect(data.meetings[0].cancelled).toBe(true);
    await decideAction(ctx, data.members[0], result.pendingId, true);
    expect(data.meetings[0].cancelled).toBe(true);
  });
  it("replays an Agent response without executing the same request again", async () => {
    vi.mocked(ctx.fetch).mockResolvedValue(
      response({
        choices: [{ message: { role: "assistant", content: "Tudo em dia." } }],
      }),
    );
    await runAgent(ctx, data.members[0], "Olá", "request-1");
    const result = await runAgent(ctx, data.members[0], "Olá", "request-1");
    expect(result.text).toBe("Tudo em dia.");
    expect(ctx.fetch).toHaveBeenCalledTimes(1);
  });
});
describe("Telegram timing, pairing and delivery", () => {
  it("produces one daily summary per participant in Lisbon, summer and winter", () => {
    data.members[0].telegramChatId = "1";
    data.members[1].telegramChatId = "2";
    data.meetings = data.meetings.slice(0, 2);
    data.meetings.forEach((event) => {
      event.participantIds = ["miguel"];
    });
    const jobs = meetingReminders(data, now);
    expect(jobs).toHaveLength(1);
    expect(jobs[0].text).toContain("10:00");
    expect(jobs[0].text).toContain("15:00");
    const winter = "2026-12-24T08:00:00.000Z";
    data.meetings[0].startsAt = "2026-12-24T10:00:00.000Z";
    data.meetings[1].startsAt = "2026-12-24T15:00:00.000Z";
    expect(meetingReminders(data, winter)).toHaveLength(1);
  });
  it("targets only assigned users one hour before and excludes cancelled events", () => {
    data.members[0].telegramChatId = "1";
    data.members[1].telegramChatId = "2";
    data.meetings = data.meetings.slice(0, 1);
    data.meetings[0].participantIds = ["afonso"];
    const jobs = meetingReminders(data, "2026-09-26T08:00:00.000Z");
    expect(jobs).toHaveLength(1);
    expect(jobs[0].memberId).toBe("afonso");
    data.meetings[0].cancelled = true;
    expect(meetingReminders(data, "2026-09-26T08:00:00.000Z")).toEqual([]);
  });
  it("never resends an ambiguous network delivery automatically", async () => {
    vi.mocked(ctx.fetch).mockRejectedValue(new Error("network"));
    await expect(sendOnce(ctx, "hour:one", "1", "Reminder")).rejects.toThrow();
    await sendOnce(ctx, "hour:one", "1", "Reminder");
    expect(ctx.fetch).toHaveBeenCalledTimes(1);
    expect(data.notificationDeliveries[0].state).toBe("uncertain");
  });
  it("ignores unlinked Telegram users and all group chats", async () => {
    await applyTelegramUpdate(ctx, {
      update_id: 1,
      message: {
        message_id: 1,
        chat: { id: 1, type: "private" },
        from: { id: 1 },
        text: "Delete everything",
      },
    });
    await applyTelegramUpdate(ctx, {
      update_id: 2,
      message: {
        message_id: 1,
        chat: { id: 1, type: "group" },
        from: { id: 1 },
        text: "hello",
      },
    });
    expect(ctx.fetch).not.toHaveBeenCalled();
    expect(data.tasks).toHaveLength(fixture.tasks.length);
  });
});
describe("GitHub activity", () => {
  it("combines GitHub activity with project history idempotently and updates PR status", async () => {
    data.projects[0].repositories = [
      { id: 456, fullName: "vouga/repo", url: "https://github.com/vouga/repo" },
    ];
    const payload: GithubPayload = {
      installation: { id: 123 },
      repository: {
        id: 456,
        full_name: "vouga/repo",
        html_url: "https://github.com/vouga/repo",
      },
      action: "opened",
      sender: { login: "miguel" },
      pull_request: {
        number: 43,
        title: "OCR",
        html_url: "https://github.com/vouga/repo/pull/43",
        state: "open",
        updated_at: now,
        user: { login: "miguel" },
        head: { ref: "feature/ocr" },
      },
    };
    await applyGithubEvent(ctx, "delivery-1", "pull_request", payload);
    await applyGithubEvent(ctx, "delivery-1", "pull_request", payload);
    expect(
      data.activity.filter((event) => event.source === "github"),
    ).toHaveLength(1);
    expect(
      data.pullRequests.filter((pr) => pr.repositoryId === 456),
    ).toHaveLength(1);
    payload.action = "closed";
    payload.pull_request!.merged = true;
    await applyGithubEvent(ctx, "delivery-2", "pull_request", payload);
    expect(data.pullRequests.find((pr) => pr.repositoryId === 456)?.state).toBe(
      "merged",
    );
    expect(data.activity.at(-1)?.type).toBe("github.pull_request_merged");
  });
});

describe("webhook ingress verification", () => {
  it("rejects a forged GitHub signature and enqueues valid redelivery only once", async () => {
    const runtimeModule = await import("@/services/runtime");
    const mocked = vi.spyOn(runtimeModule, "runtime").mockReturnValue(ctx);
    try {
      ctx.env.GITHUB_WEBHOOK_SECRET = "test-webhook-secret";
      const { POST } = await import("@/app/api/webhooks/github/route");
      const { createHmac } = await import("node:crypto");
      const body = JSON.stringify({
        installation: { id: 123 },
        repository: { id: 456 },
      });
      const signature = `sha256=${createHmac("sha256", ctx.env.GITHUB_WEBHOOK_SECRET).update(body).digest("hex")}`;
      const req = (sig: string) =>
        new Request("http://127.0.0.1:3100/api/webhooks/github", {
          method: "POST",
          headers: {
            "X-Hub-Signature-256": sig,
            "X-GitHub-Delivery": "one-delivery",
            "X-GitHub-Event": "push",
          },
          body,
        });
      expect((await POST(req("forged"))).status).toBe(403);
      expect((await POST(req(signature))).status).toBe(202);
      expect((await POST(req(signature))).status).toBe(202);
      expect(data.integrationJobs).toHaveLength(1);
    } finally {
      mocked.mockRestore();
    }
  });
  it("does not queue an unknown Telegram user even with a legitimate bot webhook", async () => {
    const runtimeModule = await import("@/services/runtime");
    const mocked = vi.spyOn(runtimeModule, "runtime").mockReturnValue(ctx);
    try {
      ctx.env.TELEGRAM_WEBHOOK_SECRET = "test-telegram-secret";
      const { POST } = await import("@/app/api/webhooks/telegram/route");
      const body = JSON.stringify({
        update_id: 999,
        message: {
          chat: { id: 999, type: "private" },
          from: { id: 999 },
          text: "Hello",
        },
      });
      const request = () =>
        new Request("http://127.0.0.1:3100/api/webhooks/telegram", {
          method: "POST",
          headers: {
            "X-Telegram-Bot-Api-Secret-Token": "test-telegram-secret",
          },
          body,
        });
      expect((await POST(request())).status).toBe(200);
      expect(data.integrationJobs).toHaveLength(0);
      data.members[0].telegramChatId = "999";
      data.members[0].telegramUserId = "999";
      expect((await POST(request())).status).toBe(200);
      expect(data.integrationJobs).toHaveLength(1);
    } finally {
      mocked.mockRestore();
    }
  });
});

it("does not restore a cancelled event when the Agent receives cancel twice",async()=>{data.meetings[0].cancelled=true;await expect(executeAgentTool(ctx,data.members[0],"cancelCalendarEvent",{id:data.meetings[0].id})).rejects.toThrow("já está cancelado");expect(data.meetings[0].cancelled).toBe(true);});
