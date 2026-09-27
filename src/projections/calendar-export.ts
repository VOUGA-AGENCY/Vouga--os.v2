import type { Meeting } from "@/domain/model";
const escape = (s: string) =>
  s
    .replace(/\\/g, "\\\\")
    .replace(/\r?\n/g, "\\n")
    .replace(/,/g, "\\,")
    .replace(/;/g, "\\;");
const stamp = (s: string) => s.replace(/[-:]/g, "").replace(/\.\d{3}/, "");
function fold(line: string) {
  const lines: string[] = [];
  let chunk = "";
  let length = 0;
  for (const char of line) {
    const bytes = new TextEncoder().encode(char).length;
    if (length + bytes > 75) {
      lines.push(chunk);
      chunk = " ";
      length = 1;
    }
    chunk += char;
    length += bytes;
  }
  lines.push(chunk);
  return lines.join("\r\n");
}
export function calendarExport(meetings: Meeting[], now: string) {
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Vouga//OS Local//PT",
    "CALSCALE:GREGORIAN",
  ];
  for (const m of meetings.filter((m) => !m.cancelled))
    lines.push(
      "BEGIN:VEVENT",
      `UID:${m.id}@vouga.local`,
      `DTSTAMP:${stamp(now)}`,
      `DTSTART:${stamp(m.startsAt)}`,
      `DTEND:${stamp(m.endsAt)}`,
      `SUMMARY:${escape(m.title)}`,
      `DESCRIPTION:${escape(m.body)}`,
      "END:VEVENT",
    );
  lines.push("END:VCALENDAR");
  return lines.map(fold).join("\r\n") + "\r\n";
}
