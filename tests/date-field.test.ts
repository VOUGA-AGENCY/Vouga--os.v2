import { describe, expect, it } from "vitest";
import { parseTime } from "@/components/date-field";

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
