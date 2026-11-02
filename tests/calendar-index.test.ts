import { describe, expect, it, vi } from "vitest";
import { indexMeetingsByDay } from "@/domain/calendar-index";
import { createSeed } from "@/persistence/seed";
import type { Meeting } from "@/domain/model";
import { dateKey, localDateTime } from "@/domain/time";
const base = createSeed("test-only-password", "2026-09-26T07:00:00Z")
  .meetings[0];
const event = (
  id: string,
  startsAt: string,
  endsAt: string,
  extra: Partial<Meeting> = {},
): Meeting => ({ ...base, id, startsAt, endsAt, cancelled: false, ...extra });
describe("calendar day index", () => {
  it("handles Lisbon midnight, DST and exclusive all-day ends", () => {
    const index = indexMeetingsByDay(
      [
        event("all-day", "2026-10-24T23:00:00Z", "2026-10-26T00:00:00Z", {
          allDay: true,
        }),
        event("overnight", "2026-10-25T23:30:00Z", "2026-10-26T00:30:00Z"),
        event("cancelled", "2026-10-25T10:00:00Z", "2026-10-25T11:00:00Z", {
          cancelled: true,
        }),
      ],
      ["2026-10-25", "2026-10-26"],
    );
    expect(index.get("2026-10-25")?.map((m) => m.id)).toEqual([
      "all-day",
      "overnight",
    ]);
    expect(index.get("2026-10-26")?.map((m) => m.id)).toEqual(["overnight"]);
  });
  it("keeps seven thousand future occurrences out of the current grid", () => {
    const events = Array.from({ length: 7000 }, (_, i) =>
      event(
        String(i),
        new Date(Date.UTC(2027, 0, i + 1, 10)).toISOString(),
        new Date(Date.UTC(2027, 0, i + 1, 11)).toISOString(),
      ),
    );
    events.push(event("today", "2026-11-02T09:00:00Z", "2026-11-02T10:00:00Z"));
    events.push(event("invalid", "invalid", "invalid"));
    const index = indexMeetingsByDay(events, ["2026-11-02", "2026-11-03"]);
    expect(index.get("2026-11-02")?.map((m) => m.id)).toEqual(["today"]);
    expect(index.get("2026-11-03")).toEqual([]);
  });
  it("reuses timezone formatters instead of allocating them for every event and cell", () => {
    const constructor = vi.spyOn(Intl, "DateTimeFormat");
    try {
      expect(dateKey("2026-07-01T23:30:00Z")).toBe("2026-07-02");
      expect(localDateTime("2026-07-01T23:30:00Z")).toBe("2026-07-02T00:30");
      expect(constructor).not.toHaveBeenCalled();
    } finally {
      constructor.mockRestore();
    }
  });
});
