import { uniqueEvents } from "./calendars";
import type { Snapshot } from "./model";
import { addDays, dateKey, toInstant } from "./time";
export type QuickTaskTiming = "today" | "week" | "undated";
export function quickTaskDueOn(
  timing: QuickTaskTiming,
  now: string,
): string | null {
  if (timing === "undated") return null;
  const today = dateKey(now);
  if (timing === "today") return today;
  const weekday = new Date(`${today}T12:00:00Z`).getUTCDay();
  return addDays(today, weekday === 0 ? 0 : weekday === 6 ? 1 : 5 - weekday);
}
// Only receives the server-authorized snapshot. No extra workspace reads or AI.
export function homeAgenda(data: Snapshot, now = data.now) {
  const today = dateKey(now);
  const days = Array.from({ length: 7 }, (_, i) => addDays(today, i + 1));
  const last = days[6];
  const tasks = data.tasks
    .filter(
      (task) =>
        task.status !== "done" &&
        task.dueOn &&
        task.dueOn >= today &&
        task.dueOn <= last,
    )
    .sort(
      (a, b) =>
        a.dueOn!.localeCompare(b.dueOn!) ||
        Number(b.status === "doing") - Number(a.status === "doing") ||
        a.title.localeCompare(b.title),
    );
  const meetings = uniqueEvents(
    data.meetings.filter(
      (event) =>
        !event.cancelled &&
        dateKey(event.startsAt) <= last &&
        dateKey(event.endsAt) >= today,
    ),
  ).sort(
    (a, b) =>
      Number(!!b.allDay) - Number(!!a.allDay) ||
      a.startsAt.localeCompare(b.startsAt),
  );
  const onDay = (day: string) => {
    const start = Date.parse(toInstant(`${day}T00:00`)!);
    const end = Date.parse(toInstant(`${addDays(day, 1)}T00:00`)!);
    return {
      day,
      tasks: tasks.filter((task) => task.dueOn === day),
      meetings: meetings.filter(
        (event) =>
          Date.parse(event.startsAt) < end && Date.parse(event.endsAt) > start,
      ),
    };
  };
  return { today: onDay(today), next: days.map(onDay) };
}
