/** Offline benchmark. No env loading, network, database writes or notifications.
 * Usage: bun --conditions=react-server scripts/benchmark-cpu.ts /absolute/path/to/baseline
 * Baseline directory: repository.ts, collections.ts, worker.ts, activity.ts from the pre-change commit.
 */
import { createSeed } from "../src/persistence/seed";
import { SupabaseWorkspaceRepository } from "../src/persistence/supabase/repository";
import { runIntegrationTick } from "../src/services/integration-worker";
import { captureChanges } from "../src/services/activity-service";
import type { ServiceContext } from "../src/services/runtime";
import type { Store } from "../src/domain/model";
import { pathToFileURL } from "node:url";
const baseline = process.argv[2];
if (!baseline?.startsWith("/")) throw new Error("Pass the offline baseline directory (see docs/CPU-OPTIMIZATION.md)");
const legacyRepo = (await import(pathToFileURL(`${baseline}/repository.ts`).href)).SupabaseWorkspaceRepository;
const legacyTick = (await import(pathToFileURL(`${baseline}/worker.ts`).href)).runIntegrationTick;
const legacyCapture = (await import(pathToFileURL(`${baseline}/activity.ts`).href)).captureChanges;
process.env.TELEGRAM_ENABLED = "false";
const now = "2026-11-03T12:00:00.000Z";
const data = createSeed("benchmark-not-a-real-password", now);
data.meetings = Array.from({ length: 6747 }, (_, i) => ({ ...data.meetings[0], id: `event-${i}`, description: "x".repeat(550) }));
data.activity = Array.from({ length: 16101 }, (_, i) => ({ id: `activity-${i}`, source: "google" as const,
  type: "calendar.event_updated", actorId: "system", entityType: "calendar" as const, entityId: `event-${i % 6747}`,
  timestamp: now, summary: "x".repeat(200), metadata: { context: "x".repeat(150) } }));
data.integrationJobs = Array.from({ length: 629 }, (_, i) => ({ id: `job-${i}`, key: `key-${i}`, kind: "calendar.pull" as const,
  payload: {}, state: "done" as const, attempts: 1, availableAt: now }));
let bytes = 0, queries = 0;
const fakeFetch: typeof fetch = async (input, init) => {
  const name = String(input).split("/").at(-1);
  const body = JSON.parse(String(init?.body));
  let value: unknown;
  if (name === "vouga_next_revision") value = data.revision;
  else if (name === "vouga_next_read_scoped") value = Object.fromEntries(Object.entries(data).map(([key, value]) =>
    [key, Array.isArray(value) && !body.p_collections.includes(key) ? [] : value]));
  else throw new Error(`Benchmark blocks all other requests, including writes: ${name}`);
  const text = JSON.stringify(value);
  bytes += Buffer.byteLength(text); queries++;
  return new Response(text);
};
const options = { url: "https://offline.supabase.co", secret: "sb_secret_offline", fetch: fakeFetch };
function cached() { return { entry: { revision: data.revision, data, routesMissing: false, readAt: Date.now() } }; }
const before = new legacyRepo(options, cached());
const after = new SupabaseWorkspaceRepository(options, cached());
const ctx = (repo: ServiceContext["repo"]): ServiceContext => ({ repo, fetch: async () => { throw new Error("Provider blocked"); },
  now: () => now, env: { TELEGRAM_ENABLED: "false", VOUGA_PUBLIC_URL: "https://os.example.com" } });
async function measure(label: string, action: () => unknown) {
  await action();
  const values = [];
  for (let i = 0; i < 7; i++) {
    queries = 0; bytes = 0;
    const cpu = process.cpuUsage(), start = performance.now(), heap = process.memoryUsage().heapUsed;
    await action();
    const usage = process.cpuUsage(cpu);
    values.push({ cpuMs: (usage.user + usage.system) / 1000, wallMs: performance.now() - start,
      queries, bytes, heapDeltaMB: (process.memoryUsage().heapUsed - heap) / 1e6 });
  }
  values.sort((a,b) => a.cpuMs - b.cpuMs);
  console.log(JSON.stringify({ label, ...values[3] }));
}
console.log(JSON.stringify({ fixtureMB: Buffer.byteLength(JSON.stringify(data))/1e6, meetings: data.meetings.length, activity: data.activity.length,
  note: "Synthetic offline fixture; both cron versions have Telegram disabled; warm legacy cache; not Vercel measurements." }));
await measure("before idle cron", () => legacyTick(ctx(before)));
await measure("after idle cron", () => runIntegrationTick(ctx(after)));
const previous = structuredClone(data);
await measure("before activity no changes", () => legacyCapture(data, previous, data.members[0], "os", now));
await measure("after activity no changes", () => captureChanges(data, previous, data.members[0], "os", now));
const browser = structuredClone(data);
for (const key of ["activity", "integrationJobs", "externalConnections", "notificationDeliveries", "oauthStates", "telegramLinks", "agentReceipts", "captureReceipts"] as const) browser[key] = [];
const browserRepo = new legacyRepo(options, { browserEntry: { revision: data.revision, data: browser, routesMissing: false, readAt: Date.now() } });
await measure("before unchanged GET read phase", () => browserRepo.readForBrowser());
await measure("after unchanged GET read phase", () => after.scoped(["members", "accounts", "sessions"]).read());
