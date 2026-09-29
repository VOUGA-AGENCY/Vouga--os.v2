import { describe, expect, test } from "vitest";
import { executeCommand } from "@/application/commands";
import { createSeed } from "@/persistence/seed";
import { dateKey, localDateTime } from "@/domain/time";

const now = "2026-09-27T12:00:00.000Z";

function workspace() {
  const data = createSeed("test-only-password", now);
  return {
    data,
    actor: data.members.find((member) => member.id === "miguel")!,
  };
}

// The event editor sends real booleans, and the calendar day panel lets the operator
// create an all-day event that begins and ends on the same date.
describe("meeting.save date handling", () => {
  test("accepts a timed meeting that starts and ends on the same day", () => {
    const { data, actor } = workspace();

    executeCommand(data, actor, {
      action: "meeting.save",
      values: {
        title: "Chamada rápida",
        kind: "meeting",
        startsAt: "2026-09-28T10:00",
        endsAt: "2026-09-28T10:30",
        allDay: false,
        calendarTargets: ["office"],
      },
    });

    const created = data.meetings.find(
      (meeting) => meeting.title === "Chamada rápida",
    )!;
    expect(localDateTime(created.startsAt)).toBe("2026-09-28T10:00");
    expect(localDateTime(created.endsAt)).toBe("2026-09-28T10:30");
    expect(created.allDay).toBe(false);
  });

  test("accepts an all-day event confined to a single day", () => {
    const { data, actor } = workspace();

    executeCommand(data, actor, {
      action: "meeting.save",
      values: {
        title: "Folga",
        kind: "event",
        startsAt: "2026-09-28T00:00",
        endsAt: "2026-09-28T00:00",
        allDay: true,
        calendarTargets: ["personal:miguel"],
      },
    });

    const created = data.meetings.find(
      (meeting) => meeting.title === "Folga",
    )!;
    expect(created.allDay).toBe(true);
    expect(dateKey(created.startsAt)).toBe("2026-09-28");
    // The end instant is exclusive, so a single-day event must stop at the next
    // midnight: that is how the agenda decides which days an event covers.
    expect(
      dateKey(new Date(Date.parse(created.endsAt) - 1).toISOString()),
    ).toBe("2026-09-28");
  });

  test("keeps the stored range of an all-day event that spans several days", () => {
    const { data, actor } = workspace();

    executeCommand(data, actor, {
      action: "meeting.save",
      values: {
        title: "Férias longas",
        kind: "event",
        startsAt: "2026-09-28T00:00",
        endsAt: "2026-09-30T00:00",
        allDay: true,
        calendarTargets: ["personal:miguel"],
      },
    });

    const created = data.meetings.find(
      (meeting) => meeting.title === "Férias longas",
    )!;
    expect(localDateTime(created.startsAt)).toBe("2026-09-28T00:00");
    expect(localDateTime(created.endsAt)).toBe("2026-09-30T00:00");
  });

  test("still refuses an all-day range whose end is before its start", () => {
    const { data, actor } = workspace();

    expect(() =>
      executeCommand(data, actor, {
        action: "meeting.save",
        values: {
          title: "Férias inválidas",
          kind: "event",
          startsAt: "2026-09-30T00:00",
          endsAt: "2026-09-28T00:00",
          allDay: true,
          calendarTargets: ["personal:miguel"],
        },
      }),
    ).toThrowError(/end must be after the start/);
  });
});
