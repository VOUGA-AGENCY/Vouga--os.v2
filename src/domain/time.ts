export const TIME_ZONE = "Europe/Lisbon";
export function dateKey(value: string | Date = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(value));
}
export function isDateKey(value: string) {
  return (
    /^\d{4}-\d{2}-\d{2}$/.test(value) &&
    !Number.isNaN(Date.parse(value)) &&
    new Date(`${value}T12:00:00Z`).toISOString().slice(0, 10) === value
  );
}
export function addDays(value: string, days: number) {
  const d = new Date(`${value}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}
export function localDateTime(value: string) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(new Date(value));
  const p = (type: string) => parts.find((x) => x.type === type)?.value ?? "";
  return `${p("year")}-${p("month")}-${p("day")}T${p("hour")}:${p("minute")}`;
}
// Wall-clock input is always Lisbon time, independent of the browser/server timezone.
// Reject nonexistent DST times rather than silently moving a user's meeting.
export function toInstant(value: string): string | null {
  const match = /^(\d{4}-\d{2}-\d{2})T(\d{2}):(\d{2})$/.exec(value);
  if (!match || !isDateKey(match[1]) || +match[2] > 23 || +match[3] > 59)
    return null;
  const target = Date.parse(`${value}:00Z`);
  let candidate = target;
  for (let i = 0; i < 4; i++) {
    const represented = Date.parse(
      `${localDateTime(new Date(candidate).toISOString())}:00Z`,
    );
    candidate += target - represented;
    if (target === represented) break;
  }
  const iso = new Date(candidate).toISOString();
  return localDateTime(iso) === value ? iso : null;
}
export function shortDate(value: string) {
  return new Intl.DateTimeFormat("pt-PT", {
    timeZone: TIME_ZONE,
    day: "numeric",
    month: "short",
  }).format(new Date(value.length === 10 ? `${value}T12:00Z` : value));
}
export function timeLabel(value: string) {
  return new Intl.DateTimeFormat("pt-PT", {
    timeZone: TIME_ZONE,
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}
export function relativeDate(value: string | null, today = dateKey()) {
  if (!value) return "Sem prazo";
  if (value === today) return "Hoje";
  if (value === addDays(today, 1)) return "Amanhã";
  if (value < today) return `Em atraso · ${shortDate(value)}`;
  return shortDate(value);
}
export function weekDays(day: string) {
  const weekday = new Date(`${day}T12:00Z`).getUTCDay();
  const start = addDays(day, weekday === 0 ? -6 : 1 - weekday);
  return Array.from({ length: 7 }, (_, i) => addDays(start, i));
}
