import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createSeed } from "@/persistence/seed";
import { SupabaseWorkspaceRepository } from "@/persistence/supabase/repository";
import { rowKey, type Collection } from "@/persistence/supabase/collections";
import type { Store } from "@/domain/model";
import { runIntegrationTick, processJobs } from "@/services/integration-worker";
import { telegramEnabled } from "@/services/features";
import { applyTelegramUpdate, deliverReminders, sendOnce, deliverCreationNotice } from "@/services/telegram-service";
import { queueCreationNotices } from "@/services/creation-notifications";
import * as runtimeModule from "@/services/runtime";
import { renewGoogleWatch } from "@/services/calendar-service";
import { seal, type ServiceContext } from "@/services/runtime";
const now = "2026-11-03T12:00:00.000Z";
const json = (value: unknown, status = 200) => new Response(JSON.stringify(value), { status });
function harness() {
  let data = createSeed("test-only-password", now);
  const reads: string[][] = [];
  const fetcher = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
    const body = JSON.parse(String(init?.body));
    if (String(url).endsWith("vouga_next_read_scoped")) {
      reads.push(body.p_collections);
      return json(Object.fromEntries(Object.entries(data).map(([key, value]) =>
        [key, Array.isArray(value) && !body.p_collections.includes(key) ? [] : value])));
    }
    if (String(url).endsWith("vouga_next_read")) { reads.push(["FULL"]); return json(data); }
    if (String(url).endsWith("vouga_next_commit")) {
      if (body.p_expected_revision !== data.revision) return json({ status: "conflict", revision: data.revision });
      for (const row of body.p_deletes) {
        const name = row.collection as Collection;
        (data[name] as unknown[]) = data[name].filter(item => rowKey(name, item as unknown as Record<string, unknown>) !== row.key);
      }
      for (const row of body.p_upserts) {
        const name = row.collection as Collection;
        const list = data[name] as unknown as Record<string, unknown>[];
        const index = list.findIndex(item => rowKey(name, item) === row.key);
        if (index >= 0) list[index] = row.data; else list.splice(row.position, 0, row.data);
      }
      data.revision++;
      return json({ status: "ok", revision: data.revision });
    }
    throw new Error(`Unexpected RPC ${url}`);
  });
  const repo = new SupabaseWorkspaceRepository({ url: "https://test.supabase.co", secret: "sb_secret_test", fetch: fetcher as typeof fetch });
  const ctx: ServiceContext = { repo, fetch: vi.fn(async () => json({})), now: () => now,
    env: { TELEGRAM_ENABLED: "false", TELEGRAM_BOT_TOKEN: "test", VOUGA_PUBLIC_URL: "https://os.example.com",
      INTEGRATION_ENCRYPTION_KEY: Buffer.alloc(32, 1).toString("base64"), GOOGLE_CLIENT_ID: "x", GOOGLE_CLIENT_SECRET: "y" } };
  return { get data() { return data; }, set data(value: Store) { data = value; }, reads, fetcher, repo, ctx };
}
beforeEach(() => vi.stubEnv("TELEGRAM_ENABLED", "false"));
afterEach(() => vi.unstubAllEnvs());
describe("CPU-safe infrastructure", () => {
  it("idle cron uses only queue/connection scopes, no full reads, commits or providers", async () => {
    const h = harness();
    await runIntegrationTick(h.ctx);
    expect(h.reads).toEqual([["externalConnections", "integrationJobs"], ["integrationJobs"], ["externalConnections"], ["externalConnections"]]);
    expect(h.fetcher).toHaveBeenCalledTimes(4);
    expect(h.ctx.fetch).not.toHaveBeenCalled();
  });
  it("CAS retries preserve changes to other collections", async () => {
    const h = harness();
    const a = h.repo.scoped!(["externalConnections"]), b = h.repo.scoped!(["integrationJobs"]);
    await Promise.all([
      a.transact(d => d.externalConnections.push({ id: "github", provider: "github", label: "GitHub", status: "connected" })),
      b.transact(d => d.integrationJobs.push({ id: "job", key: "job", kind: "github.event", payload: {}, state: "pending", attempts: 0, availableAt: now })),
    ]);
    expect(h.data.externalConnections).toHaveLength(1);
    expect(h.data.integrationJobs).toHaveLength(1);
    expect(h.data.tasks.length).toBeGreaterThan(0);
    expect(h.data.revision).toBe(3);
  });
  it("rejects mutations outside a declared scope before any commit", async () => {
    const h = harness();
    await expect(h.repo.scoped!(["integrationJobs"]).transact(d => { d.tasks.push(h.data.tasks[0]); })).rejects.toThrow("undeclared");
    expect(h.fetcher).toHaveBeenCalledTimes(1);
  });
  it("two workers reserve only one job; active Google lease is preserved", async () => {
    const h = harness();
    h.data.integrationJobs.push({ id: "push", key: "push", kind: "calendar.push", payload: { meetingId: "missing" }, state: "pending", attempts: 0, availableAt: now });
    await Promise.all([processJobs(h.ctx), processJobs(h.ctx)]);
    expect(h.data.integrationJobs[0]).toMatchObject({ attempts: 1, state: "done" });
  });
  it("failed Google jobs retain retry/backoff and external data", async () => {
    const h = harness();
    h.data.integrationJobs.push({ id: "pull", key: "pull", kind: "calendar.pull", payload: { calendarKey: "office" }, state: "pending", attempts: 0, availableAt: now });
    h.data.externalConnections.push({ id: "google:office", provider: "google", label: "Office", status: "connected", credentials: seal({ refreshToken: "refresh" }, h.ctx.env) });
    h.ctx.fetch = vi.fn(async () => json({}, 500));
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    await processJobs(h.ctx);
    expect(h.data.integrationJobs[0]).toMatchObject({ state: "pending", attempts: 1, availableAt: "2026-11-03T12:01:00.000Z" });
    error.mockRestore();
  });
  it("Google watch renewal has identical provider requests and persisted connections using scoped/full repositories", async () => {
    const results = [];
    for (const scoped of [false, true]) {
      const h = harness();
      h.data.externalConnections.push({ id: "google:office", provider: "google", label: "Office", status: "connected",
        credentials: seal({ refreshToken: "test-refresh" }, h.ctx.env) });
      h.ctx.fetch = vi.fn(async url => String(url).includes("oauth2") ? json({ access_token: "access" }) : json({ resourceId: "resource", expiration: String(Date.parse(now) + 6 * 86400000) }));
      await renewGoogleWatch({ ...h.ctx, repo: scoped ? h.repo.scoped!(["externalConnections"]) : h.repo }, "office");
      const calls = vi.mocked(h.ctx.fetch).mock.calls;
      expect(calls).toHaveLength(2);
      const watch = JSON.parse(String(calls[1][1]?.body));
      expect(watch).toMatchObject({ type: "web_hook", address: "https://os.example.com/api/webhooks/google" });
      results.push({ urls: calls.map(([url]) => String(url)), channel: h.data.externalConnections[0].channels?.map(({ expiresAt, resourceId }) => ({ expiresAt, resourceId })) });
      expect(h.data.tasks.length).toBeGreaterThan(0);
    }
    expect(results[0]).toEqual(results[1]);
  });
});
describe("Telegram suspended by default", () => {
  it("requires exact explicit opt-in", () => {
    expect(telegramEnabled({})).toBe(false);
    expect(telegramEnabled({ TELEGRAM_ENABLED: "false" })).toBe(false);
    expect(telegramEnabled({ TELEGRAM_ENABLED: "true" })).toBe(true);
  });
  it("all operational entrypoints stop before database or provider calls", async () => {
    const h = harness();
    await deliverReminders(h.ctx);
    await sendOnce(h.ctx, "key", "chat", "text");
    await applyTelegramUpdate(h.ctx, { update_id: 1 });
    await deliverCreationNotice(h.ctx, "key", { entityType: "task", entityId: "x", memberId: "miguel", actorId: "miguel" });
    expect(h.fetcher).not.toHaveBeenCalled();
    expect(h.ctx.fetch).not.toHaveBeenCalled();
    const before = structuredClone(h.data);
    h.data.tasks.push({ ...h.data.tasks[0], id: "new" });
    queueCreationNotices(h.data, before, h.data.members[0], now);
    expect(h.data.integrationJobs).toHaveLength(0);
  });
  it("preserves suspended jobs without replaying them when re-enabled", async () => {
    const h = harness();
    h.data.integrationJobs.push({ id: "old", key: "old", kind: "telegram.update", payload: { update_id: 1 }, state: "pending", attempts: 0, availableAt: now });
    await processJobs(h.ctx);
    expect(h.data.integrationJobs[0]).toMatchObject({ state: "failed", payload: { update_id: 1 }, attempts: 0 });
    h.ctx.env.TELEGRAM_ENABLED = "true";
    await processJobs(h.ctx);
    expect(h.ctx.fetch).not.toHaveBeenCalled();
  });
});

it("recovers expired Google claims and keeps their payload for retry", async () => {
  const h = harness();
  h.data.integrationJobs.push({ id: "expired", key: "expired", kind: "calendar.push", payload: { meetingId: "missing" }, state: "processing", attempts: 1, availableAt: now, leaseToken: "old", leaseUntil: "2026-11-03T11:00:00.000Z" });
  await processJobs(h.ctx);
  expect(h.data.integrationJobs[0]).toMatchObject({ state: "done", attempts: 2 });
  expect(h.data.integrationJobs[0].leaseToken).not.toBe("old");
});
it("Google webhook validation and duplicate delivery behavior remain intact", async () => {
  const h = harness();
  h.data.externalConnections.push({ id: "google:office", provider: "google", label: "Office", status: "connected", channels: [{ id: "channel", token: "secret", resourceId: "resource", expiresAt: "2099-01-01T00:00:00Z" }] });
  const mock = vi.spyOn(runtimeModule, "runtime").mockReturnValue(h.ctx);
  try {
    const { POST } = await import("@/app/api/webhooks/google/route");
    const request = (token: string) => new Request("https://os.example.com/api/webhooks/google", { method: "POST", headers: { "X-Goog-Channel-Id": "channel", "X-Goog-Channel-Token": token, "X-Goog-Resource-Id": "resource", "X-Goog-Message-Number": "12" } });
    expect((await POST(request("wrong"))).status).toBe(403);
    expect((await POST(request("secret"))).status).toBe(204);
    expect((await POST(request("secret"))).status).toBe(204);
    expect(h.data.integrationJobs).toHaveLength(1);
    expect(h.data.integrationJobs[0]).toMatchObject({ kind: "calendar.pull", payload: { calendarKey: "office" } });
  } finally { mock.mockRestore(); }
});
it("suspended Telegram ingress acknowledges without reading or enqueueing anything", async () => {
  const h = harness();
  const mock = vi.spyOn(runtimeModule, "runtime").mockReturnValue(h.ctx);
  try {
    const { POST } = await import("@/app/api/webhooks/telegram/route");
    expect((await POST(new Request("https://os.example.com/api/webhooks/telegram", { method: "POST", body: "not parsed while suspended" }))).status).toBe(200);
    expect(h.fetcher).not.toHaveBeenCalled();
    expect(h.ctx.fetch).not.toHaveBeenCalled();
  } finally { mock.mockRestore(); }
});

it.each(["office", "contacto"] as const)("preserves Google create/update/delete dispatch for %s", async calendar => {
  for (const method of ["POST", "PATCH", "DELETE"]) {
    const h = harness();
    h.data.externalConnections.push({ id: `google:${calendar}`, provider: "google", label: calendar, status: "connected", credentials: seal({ refreshToken: "refresh" }, h.ctx.env) });
    const event = h.data.meetings[0];
    Object.assign(event, { calendarKey: calendar, syncStatus: "pending", cancelled: method === "DELETE" });
    if (method !== "POST") Object.assign(event, { googleEventId: "existing", googleCalendarId: `${calendar}@vouga-agency.pt`, googleEtag: "etag-old" });
    h.data.integrationJobs.push({ id: "push", key: "push", kind: "calendar.push", payload: { meetingId: event.id }, state: "pending", attempts: 0, availableAt: now });
    h.ctx.fetch = vi.fn(async (url, init) => String(url).includes("oauth2") ? json({ access_token: "access" }) :
      init?.method === "DELETE" ? new Response(null, { status: 204 }) : json({ id: "external", etag: "new" }));
    await processJobs(h.ctx, 1);
    const call = vi.mocked(h.ctx.fetch).mock.calls.find(([url]) => String(url).includes("/events"))!;
    expect(call[1]?.method).toBe(method);
    expect(String(call[0])).toContain(encodeURIComponent(`${calendar}@vouga-agency.pt`));
    expect(String(call[0])).toContain("sendUpdates=all");
    if (method !== "POST") expect(new Headers(call[1]?.headers).get("If-Match")).toBe("etag-old");
    expect(h.data.meetings[0].syncStatus).toBe("synced");
    expect(h.data.integrationJobs[0].state).toBe("done");
  }
});
