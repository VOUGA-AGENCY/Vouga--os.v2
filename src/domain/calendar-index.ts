import type { Meeting } from "./model";
import { dateKey } from "./time";

// Only bucket days on screen: a long event/series must never expand an unbounded range.
// Numeric overlap rejects off-screen occurrences before any timezone formatting.
export function indexMeetingsByDay(meetings: Meeting[], days: string[]) {
  const sorted = [...new Set(days)].sort();
  const index = new Map<string, Meeting[]>(sorted.map((day) => [day, []]));
  if (!sorted.length) return index;
  const min = Date.parse(`${sorted[0]}T00:00Z`) - 86400000;
  const max = Date.parse(`${sorted.at(-1)}T00:00Z`) + 2 * 86400000;
  for (const meeting of meetings) {
    const start = Date.parse(meeting.startsAt),
      end = Date.parse(meeting.endsAt);
    if (
      meeting.cancelled ||
      !Number.isFinite(start) ||
      !Number.isFinite(end) ||
      end <= start ||
      end <= min ||
      start >= max
    )
      continue;
    const first = dateKey(new Date(start)),
      last = dateKey(new Date(end - 1));
    for (const day of sorted) {
      if (day >= first && day <= last) index.get(day)!.push(meeting);
    }
  }
  for (const events of index.values())
    events.sort((a, b) => Date.parse(a.startsAt) - Date.parse(b.startsAt));
  return index;
}
