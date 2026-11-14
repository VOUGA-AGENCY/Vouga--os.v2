import { describe, expect, test } from "vitest";
import { layoutDayEvents } from "@/domain/calendar-layout";

const at = (hours: number) => hours * 60;

describe("layoutDayEvents", () => {
  test("a single event uses the whole column", () => {
    const layout = layoutDayEvents([{ id: "a", start: at(10), end: at(11) }]);
    expect(layout.get("a")).toEqual({ lane: 0, lanes: 1 });
  });

  test("events in the same hour share the column equally", () => {
    const layout = layoutDayEvents([
      { id: "a", start: at(10), end: at(11) },
      { id: "b", start: at(10), end: at(11) },
      { id: "c", start: at(10.5), end: at(11) },
    ]);
    expect([...layout.values()].map((item) => item.lanes)).toEqual([3, 3, 3]);
    expect(new Set([...layout.values()].map((item) => item.lane))).toEqual(
      new Set([0, 1, 2]),
    );
  });

  test("back-to-back events do not split the column", () => {
    const layout = layoutDayEvents([
      { id: "a", start: at(10), end: at(11) },
      { id: "b", start: at(11), end: at(12) },
    ]);
    expect(layout.get("a")).toEqual({ lane: 0, lanes: 1 });
    expect(layout.get("b")).toEqual({ lane: 0, lanes: 1 });
  });

  test("separate overlap groups are sized independently", () => {
    const layout = layoutDayEvents([
      { id: "a", start: at(9), end: at(10) },
      { id: "b", start: at(9), end: at(10) },
      { id: "c", start: at(14), end: at(15) },
    ]);
    expect(layout.get("a")?.lanes).toBe(2);
    expect(layout.get("b")?.lanes).toBe(2);
    expect(layout.get("c")).toEqual({ lane: 0, lanes: 1 });
  });

  test("a freed lane is reused inside a chain of overlaps", () => {
    // a 9–12 overlaps b 9–10 and c 10–11; b and c can share the second lane.
    const layout = layoutDayEvents([
      { id: "a", start: at(9), end: at(12) },
      { id: "b", start: at(9), end: at(10) },
      { id: "c", start: at(10), end: at(11) },
    ]);
    expect(layout.get("a")).toEqual({ lane: 0, lanes: 2 });
    expect(layout.get("b")).toEqual({ lane: 1, lanes: 2 });
    expect(layout.get("c")).toEqual({ lane: 1, lanes: 2 });
  });

  test("zero-length events still get their own lane", () => {
    const layout = layoutDayEvents([
      { id: "a", start: at(10), end: at(10) },
      { id: "b", start: at(10), end: at(10) },
    ]);
    expect(layout.get("a")?.lanes).toBe(2);
  });
});
