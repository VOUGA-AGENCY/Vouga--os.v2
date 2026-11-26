import { isBoardMember } from "./team";
import { toInstant } from "./time";
import type { Member } from "./model";

export const folders = {
  office: { id: "1FTP-3cMLlczpn-M-VVUR8Qsu5Fg_ERTf", audience: "founders" },
  contacto: { id: "1CxCH8m3qzSCDO05SuUqjeQzilDb1UlRW", audience: "commercial" },
} as const;
export type Folder = keyof typeof folders;
export const streams = {
  manage_leads: ["commercial", "Manage Leads"],
  general_leads: ["commercial", "General Leads"],
  buying_signals: ["commercial", "Buying Signals"],
  commercial_followup: ["commercial", "Commercial Follow-up"],
  ai_radar: ["founders", "AI Technology Radar"],
  funding_monitor: ["founders", "Funding Monitor"],
  vccm_lab: ["founders", "VCCM Innovation Lab"],
  founder_briefing: ["founders", "Founder Briefing"],
  infra_watchdog: ["founders", "Infrastructure Watchdog"],
  strategic_networking: ["founders", "Strategic Networking"],
  talent_radar: ["founders", "Porto Talent Radar"],
  founder_content: ["founders", "Founder Content"],
  board_report: ["founders", "Weekly Board Report"],
} as const;
export type Stream = keyof typeof streams;
export function intelligenceAccess(
  member: Pick<Member, "id" | "role" | "archived">,
) {
  if (isBoardMember(member)) return "founders";
  if (
    member.role === "engineer" &&
    !member.archived &&
    !["engineer", "patrick"].includes(member.id)
  )
    return "commercial";
  return null;
}
export interface ReportHeader {
  task_key: Stream;
  task_name: string;
  schema_version: 1;
  audience: "commercial" | "founders";
  delivered_at: string;
  summary: string;
  item_count: number | null;
  status: "ready";
}
export class InvalidReport extends Error {}
export function parseHeader(line: string, folder: Folder): ReportHeader {
  let h;
  try {
    h = JSON.parse(line);
  } catch {
    throw new InvalidReport("Cabeçalho JSON inválido.");
  }
  if (
    !h ||
    typeof h !== "object" ||
    /[\r\n]/.test(line) ||
    h.schema_version !== 1 ||
    h.status !== "ready"
  )
    throw new InvalidReport("Versão ou estado do relatório inválido.");
  if (
    typeof h.task_key !== "string" ||
    !Object.hasOwn(streams, h.task_key) ||
    streams[h.task_key as Stream][0] !== folders[folder].audience ||
    h.audience !== folders[folder].audience
  )
    throw new InvalidReport(
      "A pasta, o público e a automatização são incompatíveis.",
    );
  if (
    typeof h.task_name !== "string" ||
    !h.task_name.trim() ||
    typeof h.summary !== "string" ||
    !h.summary.trim() ||
    Array.from(h.summary).length > 350 ||
    (h.item_count !== null &&
      (!Number.isSafeInteger(h.item_count) || h.item_count < 0)) ||
    typeof h.delivered_at !== "string" ||
    !/(Z|[+-]\d{2}:\d{2})$/.test(h.delivered_at) ||
    !toInstant(h.delivered_at)
  )
    throw new InvalidReport("Metadados incompletos ou inválidos.");
  return {
    task_key: h.task_key,
    task_name: h.task_name,
    schema_version: 1,
    status: "ready",
    audience: h.audience,
    delivered_at: h.delivered_at,
    summary: h.summary,
    item_count: h.item_count,
  };
}
export const displayText = (value: string) =>
  value.replace(/https?:\/\/[^\s]+|[\u2013\u2014]/g, (part) =>
    part.length === 1 ? ", " : part,
  );
export const deliveryTime = (value: string) =>
  new Intl.DateTimeFormat("pt-PT", {
    timeZone: "Europe/Lisbon",
    dateStyle: "short",
    timeStyle: "short",
  }).format(new Date(value));
export type ReportRow = Pick<
  ReportHeader,
  "task_key" | "summary" | "item_count" | "delivered_at"
> & { id: string; title: string; updated_at: string; unread: boolean };
export type ReportDetail = ReportRow & {
  content: string;
  drive_file_url: string;
};
export function notificationText(
  report: Pick<
    ReportRow,
    "task_key" | "delivered_at" | "summary" | "item_count"
  >,
) {
  const count = report.item_count;
  const mentionsCount =
    count !== null &&
    new RegExp("(?:^|\\D)" + count + "(?:\\D|$)").test(report.summary);
  return [
    "Intelligence | " + streams[report.task_key][1],
    displayText(report.summary),
    count !== null && !mentionsCount ? "Resultados: " + count : "",
    "Entrega: " + deliveryTime(report.delivered_at),
  ]
    .filter(Boolean)
    .join("\n\n");
}
