/** A timed event in one day column, in minutes from midnight (Europe/Lisbon). */
export type DayEvent = { id: string; start: number; end: number };
/** Column `lane` of `lanes` equal-width columns shared by the events it overlaps. */
export type EventLane = { lane: number; lanes: number };

/**
 * Splits a day column between overlapping events so none hides another.
 * Events that touch only at an edge (10:00–11:00 and 11:00–12:00) do not overlap.
 * Very short events count as at least `minDuration` minutes, matching their drawn height.
 */
export function layoutDayEvents(
  events: DayEvent[],
  minDuration = 30,
): Map<string, EventLane> {
  const sorted = [...events]
    .map((event) => ({
      ...event,
      end: Math.max(event.end, event.start + minDuration),
    }))
    .sort((a, b) => a.start - b.start || b.end - a.end || a.id.localeCompare(b.id));
  const result = new Map<string, EventLane>();
  let group: { id: string; lane: number }[] = [];
  let laneEnds: number[] = [];
  let groupEnd = -Infinity;
  const close = () => {
    for (const item of group)
      result.set(item.id, { lane: item.lane, lanes: laneEnds.length });
    group = [];
    laneEnds = [];
  };
  for (const event of sorted) {
    // A new group starts once nothing in the current one is still running.
    if (event.start >= groupEnd) close();
    let lane = laneEnds.findIndex((end) => end <= event.start);
    if (lane === -1) lane = laneEnds.push(event.end) - 1;
    else laneEnds[lane] = event.end;
    group.push({ id: event.id, lane });
    groupEnd = group.length === 1 ? event.end : Math.max(groupEnd, event.end);
  }
  close();
  return result;
}
