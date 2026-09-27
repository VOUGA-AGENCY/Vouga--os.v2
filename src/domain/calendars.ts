import type { Meeting, Member } from "./model";
export const calendarTarget = (event: Meeting) =>
  event.calendarKey === "personal"
    ? `personal:${event.calendarOwnerId}`
    : (event.calendarKey ?? "office");
export function calendarOptions(me: Member, members: Member[]) {
  return [
    ...(me.role === "admin" ? [{ id: "office", label: "Office" }] : []),
    { id: "contacto", label: "Contacto" },
    ...members
      .filter((m) => !m.archived && (me.role === "admin" || m.id === me.id))
      .map((m) => ({
        id: `personal:${m.id}`,
        label: m.id === me.id ? "Pessoal" : `Pessoal · ${m.name}`,
      })),
  ];
}
export const calendarLabel = (event: Meeting, members: Member[]) =>
  event.calendarKey === "personal"
    ? `Pessoal · ${members.find((m) => m.id === event.calendarOwnerId)?.name ?? ""}`
    : event.calendarKey === "contacto"
      ? "Contacto"
      : "Office";
export function uniqueEvents(events: Meeting[]) {
  const seen = new Set<string>();
  return events.filter((e) => {
    const id = e.groupId ?? e.id;
    if (seen.has(id)) return false;
    seen.add(id);
    return true;
  });
}
