import { afterEach, describe, it, expect, vi } from "vitest";
import { readFileSync } from "node:fs";
import * as auth from "@/application/auth";
import * as service from "@/services/intelligence-service";
import * as environment from "@/services/runtime";
import { GET, POST } from "@/app/api/intelligence/route";
import { folders } from "@/domain/intelligence";
import { localDateTime } from "@/domain/time";
import type { Member } from "@/domain/model";

function fixture(id: string, role: Member["role"]) {
  const read = vi.fn(async () => ({})),
    rpc = vi.fn(async () => null);
  vi.spyOn(environment, "runtime").mockReturnValue({
    repo: { read },
    env: { INTEGRATION_CRON_SECRET: "test-only-secret" },
  } as unknown as environment.ServiceContext);
  const session = vi
    .spyOn(auth, "requireMember")
    .mockResolvedValue({ id, role, name: id, email: id + "@example.org" });
  vi.spyOn(service, "intelligenceDb").mockReturnValue({
    rpc,
  } as unknown as ReturnType<typeof service.intelligenceDb>);
  const sync = vi.spyOn(service, "runIntelligence").mockResolvedValue([]);
  return { rpc, sync, session };
}
const req = (query = "", options?: RequestInit) =>
  new Request("https://os.example.org/api/intelligence" + query, options);
afterEach(() => vi.restoreAllMocks());
describe("Intelligence entry points", () => {
  it("restricts manual synchronization to the caller's folders", async () => {
    const { sync, session } = fixture("engineer-a", "engineer");
    expect((await POST(req("", { method: "POST" }))).status).toBe(200);
    expect(sync.mock.calls[0][1]).toEqual(["contacto"]);
    session.mockResolvedValue({
      id: "miguel",
      role: "admin",
      name: "Miguel",
      email: "x@example.org",
    });
    await POST(req("", { method: "POST" }));
    expect(sync.mock.calls[1][1]).toEqual(["office", "contacto"]);
  });
  it("requires the scheduler credential and uses both folders for scheduled sync", async () => {
    const { sync, session } = fixture("unused", "admin");
    expect((await POST(req("?scheduled=1", { method: "POST" }))).status).toBe(
      403,
    );
    await POST(
      req("?scheduled=1", {
        method: "POST",
        headers: { Authorization: "Bearer test-only-secret" },
      }),
    );
    expect(session).not.toHaveBeenCalled();
    expect(sync).toHaveBeenCalledTimes(1);
    expect(sync.mock.calls[0][1]).toEqual(["office", "contacto"]);
  });
  it("never returns a founder history to engineers or exposes an inaccessible detail", async () => {
    const { rpc } = fixture("engineer-a", "engineer");
    expect((await GET(req("?key=board_report"))).status).toBe(404);
    expect(rpc).not.toHaveBeenCalled();
    expect((await GET(req("?id=hidden"))).status).toBe(404);
    expect(rpc).toHaveBeenCalledWith("vouga_next_intelligence_read", {
      actor: "engineer-a",
      operation: "detail",
      args: { id: "hidden" },
    });
  });
  it("checks source custody on the backend for a direct report link", async () => {
    const { rpc } = fixture("new-engineer", "engineer");
    rpc.mockImplementation(
      async () =>
        ({
          id: "hidden",
          task_key: "board_report",
          folder_id: folders.office.id,
        }) as never,
    );
    expect((await GET(req("?id=hidden"))).status).toBe(404);
  });
  it("dispatches exactly seven local slots on winter, summer and both clock-change dates", () => {
    const sql = readFileSync(
      "supabase/operations/enable-intelligence-cron.sql",
      "utf8",
    );
    const cron = sql.match(/'([0-9,-]+ [0-9,-]+ \* \* \*)'/)![1];
    const field = (v: string) =>
      v.split(",").flatMap((range) => {
        const [lo, hi] = range.split("-").map(Number);
        return Array.from({ length: (hi ?? lo) - lo + 1 }, (_, i) => lo + i);
      });
    const [mins, hours] = cron.split(" ").map(field);
    const slots = [...sql.matchAll(/'(\d\d:\d\d)'/g)].map((m) => m[1]);
    for (const day of [
      "2026-02-10",
      "2026-03-29",
      "2026-08-12",
      "2026-10-25",
    ]) {
      const dispatch = hours
        .flatMap((hour) =>
          mins.map((min) =>
            localDateTime(
              day +
                "T" +
                String(hour).padStart(2, "0") +
                ":" +
                String(min).padStart(2, "0") +
                ":00Z",
            ).slice(11),
          ),
        )
        .filter((t) => slots.includes(t));
      expect(dispatch).toEqual([
        "07:45",
        "08:45",
        "09:45",
        "10:45",
        "12:00",
        "17:30",
        "20:00",
      ]);
    }
  });
});
