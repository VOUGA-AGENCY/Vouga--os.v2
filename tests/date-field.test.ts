import { describe, expect, it } from "vitest";
import { isBeforeMin, parseTime } from "@/components/date-field";

describe("typed times in the date picker", () => {
  it("accepts the usual ways of writing a time", () => {
    expect(parseTime("9")).toBe("09:00");
    expect(parseTime("930")).toBe("09:30");
    expect(parseTime("0930")).toBe("09:30");
    expect(parseTime("9:30")).toBe("09:30");
    expect(parseTime("9h30")).toBe("09:30");
    expect(parseTime("14h")).toBe("14:00");
    expect(parseTime("17.45")).toBe("17:45");
    expect(parseTime(" 23:59 ")).toBe("23:59");
  });

  it("rejects text that is not a time", () => {
    expect(parseTime("")).toBeNull();
    expect(parseTime("24:00")).toBeNull();
    expect(parseTime("9:60")).toBeNull();
    expect(parseTime("abc")).toBeNull();
  });
});

describe("minimum date and time bounds in DateField", () => {
  it("rejects an end time earlier than start time on the same date", () => {
    // 20/11 9:00 is strictly before 20/11 9:30
    expect(
      isBeforeMin(
        "datetime",
        "2026-11-20T09:00",
        "2026-11-20T09:30",
        true,
      ),
    ).toBe(true);

    // 20/11 9:30 is not allowed when minExclusive is true (meeting cannot have 0 duration)
    expect(
      isBeforeMin(
        "datetime",
        "2026-11-20T09:30",
        "2026-11-20T09:30",
        true,
      ),
    ).toBe(true);

    // 20/11 09:35 or 10:00 is valid
    expect(
      isBeforeMin(
        "datetime",
        "2026-11-20T09:35",
        "2026-11-20T09:30",
        true,
      ),
    ).toBe(false);
    expect(
      isBeforeMin(
        "datetime",
        "2026-11-20T10:00",
        "2026-11-20T09:30",
        true,
      ),
    ).toBe(false);
  });

  it("rejects an end date earlier than start date", () => {
    expect(
      isBeforeMin(
        "datetime",
        "2026-11-19T10:00",
        "2026-11-20T09:30",
        true,
      ),
    ).toBe(true);
    expect(
      isBeforeMin(
        "datetime",
        "2026-11-21T08:00",
        "2026-11-20T09:30",
        true,
      ),
    ).toBe(false);
  });

  it("enforces bounds in date mode and time mode", () => {
    expect(isBeforeMin("date", "2026-11-19", "2026-11-20")).toBe(true);
    expect(isBeforeMin("date", "2026-11-20", "2026-11-20")).toBe(false);
    expect(isBeforeMin("time", "09:00", "09:30")).toBe(true);
    expect(isBeforeMin("time", "09:30", "09:30")).toBe(false);
    expect(isBeforeMin("time", "09:30", "09:30", true)).toBe(true);
    expect(isBeforeMin("time", "10:00", "09:30")).toBe(false);
  });
});
