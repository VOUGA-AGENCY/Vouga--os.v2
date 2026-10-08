import { beforeEach, it, expect, vi } from "vitest";
import { createHash } from "node:crypto";
import { createSeed } from "@/persistence/seed";
import { applySnapshotPatch } from "@/projections/changes";
import { workspaceFor } from "@/projections/workspace";
const state = vi.hoisted(() => ({
  data: null as unknown as ReturnType<typeof createSeed>,
  reads: 0,
  writes: 0,
}));
vi.mock("@/persistence/store", () => ({
  repository: () => ({
    read: async () => {
      state.reads++;
      return structuredClone(state.data);
    },
    transact: async (fn: (data: typeof state.data) => unknown) => {
      state.writes++;
      const next = structuredClone(state.data);
      const result = fn(next);
      next.revision++;
      state.data = next;
      return result;
    },
  }),
}));
import { GET, POST } from "@/app/api/workspace/route";
const token = "a".repeat(64);
const headers = {
  host: "127.0.0.1:3001",
  origin: "http://127.0.0.1:3001",
  cookie: `vouga_local_session=${token}`,
};
beforeEach(() => {
  vi.stubEnv("VOUGA_LOCAL_MODE", "1");
  state.data = createSeed("test-password");
  state.reads = 0;
  state.writes = 0;
  state.data.sessions.push({
    hash: createHash("sha256").update(token).digest("hex"),
    memberId: "miguel",
    expiresAt: "2099-01-01",
  });
});
it("authenticates GET in one read and returns 304 only for that user's revision", async () => {
  const response = await GET(
    new Request("http://127.0.0.1:3001/api/workspace", { headers }),
  );
  expect(response.status).toBe(200);
  expect(state.reads).toBe(1);
  const unchanged = await GET(
    new Request("http://127.0.0.1:3001/api/workspace", {
      headers: { ...headers, "if-none-match": response.headers.get("etag")! },
    }),
  );
  expect(unchanged.status).toBe(304);
  expect(await unchanged.text()).toBe("");
  const other = await GET(
    new Request("http://127.0.0.1:3001/api/workspace", {
      headers: {
        ...headers,
        "if-none-match": `"afonso:${state.data.revision}"`,
      },
    }),
  );
  expect(other.status).toBe(200);
});
it("authenticates and projects a write atomically without rereads, using delta or fallback", async () => {
  const before = workspaceFor(
    structuredClone(state.data),
    state.data.members[0],
    new Date().toISOString(),
  );
  const request = (revision: number, version: number) =>
    new Request("http://127.0.0.1:3001/api/workspace", {
      method: "POST",
      headers: {
        ...headers,
        "content-type": "application/json",
        "x-workspace-revision": String(revision),
      },
      body: JSON.stringify({
        action: "task.save",
        values: { id: "proposal", version, title: "Changed title" },
      }),
    });
  const response = await POST(request(before.revision, 1));
  expect(response.status).toBe(200);
  expect(state.reads).toBe(0);
  expect(state.writes).toBe(1);
  const result = await response.json();
  expect(result.snapshot).toBeUndefined();
  expect(applySnapshotPatch(before, result.patch).tasks[0].title).toBe(
    "Changed title",
  );
  const fallback = await (await POST(request(-1, 2))).json();
  expect(fallback.snapshot.revision).toBe(state.data.revision);
  expect(JSON.stringify(fallback)).not.toContain("passwordHash");
});
it("rejects a removed identity before any write executes", async () => {
  state.data.members[0].archived = true;
  const response = await POST(
    new Request("http://127.0.0.1:3001/api/workspace", {
      method: "POST",
      headers: { ...headers, "content-type": "application/json" },
      body: JSON.stringify({
        action: "task.save",
        values: { title: "No access" },
      }),
    }),
  );
  expect(response.status).toBe(401);
  expect(state.data.tasks.some((task) => task.title === "No access")).toBe(
    false,
  );
});

it("rejects missing sessions without reading the database", async () => {
  const response = await GET(
    new Request("http://127.0.0.1:3001/api/workspace", {
      headers: { host: headers.host },
    }),
  );
  expect(response.status).toBe(401);
  expect(state.reads).toBe(0);
});
