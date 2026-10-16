import { describe, expect, it, vi } from "vitest";
import {
  dailySummary,
  dailySummaryParts,
  busyDayPhrases,
  emptyDayPhrases,
} from "@/domain/daily-summary";
import { createSeed } from "@/persistence/seed";
import {
  meetingReminders,
  deliverReminders,
} from "@/services/telegram-service";
import type { ServiceContext } from "@/services/runtime";
import type { Meeting, Task } from "@/domain/model";
const now = "2026-10-16T07:00:00.000Z";
const seed = createSeed("isolated-test-password", now);
const base = {
  id: "test",
  version: 1,
  createdAt: now,
  updatedAt: now,
  createdBy: "miguel",
};
const task = (id: string, fields: Partial<Task> = {}): Task => ({
  ...base,
  id,
  title: id,
  body: "",
  status: "todo",
  ownerId: "miguel",
  dueOn: "2026-10-16",
  projectId: null,
  organizationId: null,
  ...fields,
});
const event = (id: string, fields: Partial<Meeting> = {}): Meeting => ({
  ...base,
  id,
  title: id,
  kind: "meeting",
  body: "",
  startsAt: "2026-10-16T11:00:00Z",
  endsAt: "2026-10-16T12:00:00Z",
  calendarOwnerId: "miguel",
  participantIds: ["miguel"],
  organizationId: null,
  projectId: null,
  cancelled: false,
  reminderMinutes: 10,
  calendarKey: "office",
  ...fields,
});
function fixture() {
  const data = structuredClone(seed);
  data.tasks = [];
  data.meetings = [];
  data.members.forEach((m) => delete m.telegramChatId);
  data.members[0].telegramChatId = "1";
  return data;
}
describe("personal daily Telegram templates", () => {
  it("contains exactly the supplied pools and selects both endpoints", () => {
    expect(busyDayPhrases).toHaveLength(50);
    expect(emptyDayPhrases).toHaveLength(19);
    const data = fixture(),
      me = data.members[0];
    expect(dailySummary(data, me, now, () => 0)).toContain(emptyDayPhrases[0]);
    expect(dailySummary(data, me, now, () => 0.999999)).toContain(
      emptyDayPhrases[18],
    );
    data.tasks = [task("For today")];
    expect(dailySummary(data, me, now, () => 0)).toContain(busyDayPhrases[0]);
    expect(dailySummary(data, me, now, () => 0.999999)).toContain(
      busyDayPhrases[49],
    );
  });
  it("sends a greeting and empty-day message even with nothing assigned", () => {
    const data = fixture();
    const text = dailySummary(data, data.members[0], now, () => 0);
    expect(text).toBe(
      `Bom dia, Miguel!\n\nNão tens nada planeado para hoje.\n\n${emptyDayPhrases[0]}`,
    );
    expect(meetingReminders(data, now)).toHaveLength(1);
  });
  it("includes only unfinished tasks due today and assigned to this person", () => {
    const data = fixture();
    data.tasks = [
      task("Shared", { ownerId: "afonso", assigneeIds: ["afonso", "miguel"] }),
      task("Personal", { visibility: "private" }),
      task("No date", { dueOn: null }),
      task("Overdue", { dueOn: "2026-10-15" }),
      task("Future", { dueOn: "2026-10-17" }),
      task("Finished", { status: "done" }),
      task("Other", { ownerId: "ana" }),
      task("Confidential", { visibility: "private", ownerId: "afonso" }),
    ];
    const text = dailySummary(data, data.members[0], now, () => 0);
    expect(text).toContain("• Shared");
    expect(text).toContain("• Personal");
    for (const title of [
      "No date",
      "Overdue",
      "Future",
      "Finished",
      "Other",
      "Confidential",
    ])
      expect(text).not.toContain(title);
  });
  it("includes today’s meetings once, including all-day events; excludes cancelled, future and unassigned", () => {
    const data = fixture();
    data.meetings = [
      event("Shared", { groupId: "same" }),
      event("Duplicate", { groupId: "same" }),
      event("All day", { allDay: true }),
      event("Cancelled", { cancelled: true }),
      event("Tomorrow", { startsAt: "2026-10-17T11:00:00Z" }),
      event("Not mine", { participantIds: ["afonso"] }),
    ];
    const text = dailySummary(data, data.members[0], now, () => 0);
    expect(text).toContain("12:00 · Shared");
    expect(text).toContain("Todo o dia · All day");
    for (const title of ["Duplicate", "Cancelled", "Tomorrow", "Not mine"])
      expect(text).not.toContain(title);
  });
  it("does not leak Board tasks or Office events to an engineer", () => {
    const data = fixture();
    const engineer = data.members.find((m) => m.id === "vasco")!;
    data.tasks = [
      task("Board secret", { visibility: "board", assigneeIds: ["vasco"] }),
    ];
    data.meetings = [event("Office secret", { participantIds: ["vasco"] })];
    expect(dailySummary(data, engineer, now, () => 0)).toContain(
      "Não tens nada planeado",
    );
  });
  it("uses Lisbon dates at midnight and during daylight saving changes", () => {
    const data = fixture();
    data.tasks = [task("Today", { dueOn: "2026-10-17" })];
    data.meetings = [event("Midnight", { startsAt: "2026-10-16T23:30:00Z" })];
    const text = dailySummary(
      data,
      data.members[0],
      "2026-10-16T23:00:00Z",
      () => 0,
    );
    expect(text).toContain("• Today");
    expect(text).toContain("00:30 · Midnight");
    expect(meetingReminders(data, "2026-10-16T06:59:00Z")).toEqual([]);
    expect(
      meetingReminders(data, "2026-10-16T07:59:00Z").some((x) =>
        x.key.startsWith("daily:"),
      ),
    ).toBe(true);
    expect(meetingReminders(data, "2026-10-16T08:00:00Z")).toEqual([]);
    expect(
      meetingReminders(data, "2026-12-16T08:00:00Z").some((x) =>
        x.key.startsWith("daily:"),
      ),
    ).toBe(true);
  });
  it("excludes archived and unlinked users and keeps daily keys stable", () => {
    const data = fixture();
    data.members[0].archived = true;
    expect(meetingReminders(data, now)).toEqual([]);
    delete data.members[0].archived;
    const a = meetingReminders(data, now),
      b = meetingReminders(data, "2026-10-16T07:25:00Z");
    expect(a).toHaveLength(1);
    expect(a[0]).toEqual(b[0]);
    expect(a[0].key).toBe("daily:miguel:2026-10-16");
  });
  it("continues after one failed recipient and never duplicates accepted or uncertain sends", async () => {
    const data = fixture();
    data.members[1].telegramChatId = "2";
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce(new Response("{}", { status: 403 }))
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ ok: true, result: { message_id: 1 } })),
      );
    const ctx: ServiceContext = {
      env: { TELEGRAM_BOT_TOKEN: "test-only" },
      now: () => now,
      fetch: fetcher as typeof fetch,
      repo: {
        read: async () => structuredClone(data),
        transact: async (fn) => fn(data),
      },
    };
    await expect(deliverReminders(ctx)).rejects.toThrow("miguel:daily");
    expect(data.notificationDeliveries.map((d) => d.state)).toEqual([
      "uncertain",
      "sent",
    ]);
    await deliverReminders(ctx);
    expect(fetcher).toHaveBeenCalledTimes(2);
  });
  it("splits long digests without dropping entries", () => {
    const data = fixture();
    data.tasks = Array.from({ length: 100 }, (_, i) =>
      task(`Task ${i} ${"a".repeat(100)}`),
    );
    const parts = dailySummaryParts(
      dailySummary(data, data.members[0], now, () => 0),
      "Miguel",
    );
    expect(parts.length).toBeGreaterThan(1);
    expect(
      parts.every((p) => p.length <= 3900 && p.startsWith("Bom dia, Miguel!")),
    ).toBe(true);
    for (const t of data.tasks) expect(parts.join("\n")).toContain(t.title);
  });
});
