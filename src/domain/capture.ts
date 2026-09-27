import type { CaptureDraft, Member, WorkspaceData } from "./model";
import { addDays, dateKey, isDateKey } from "./time";

export const normalize = (value: string) => value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
export function emptyDraft(me: Member): CaptureDraft {
  return { kind: "inbox", title: "", body: "", ownerId: me.id, projectId: "", organizationId: "", organizationName: "", date: "", time: "", duration: "30", person: "", nextStep: "", stage: "" };
}
function mentioned<T extends { id: string; name: string }>(items: T[], text: string) {
  const matches = items.filter((item) => text.includes(normalize(item.name)));
  return matches.length === 1 ? matches[0].id : "";
}
const months = ["janeiro", "fevereiro", "marco", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"];
export function suggestedDate(text: string, now: string) {
  const today = dateKey(now);
  const iso = text.match(/\b\d{4}-\d{2}-\d{2}\b/)?.[0];
  if (iso) return isDateKey(iso) ? iso : "";
  const named = /\b(?:dia\s+)?(\d{1,2})\s+de\s+(janeiro|fevereiro|marco|abril|maio|junho|julho|agosto|setembro|outubro|novembro|dezembro)\b/.exec(text);
  if (named) {
    const month = months.indexOf(named[2]) + 1;
    const part = `${String(month).padStart(2, "0")}-${named[1].padStart(2, "0")}`;
    let year = Number(today.slice(0, 4));
    let candidate = `${year}-${part}`;
    if (candidate < today) candidate = `${++year}-${part}`;
    return isDateKey(candidate) ? candidate : "";
  }
  if (/\bdepois de amanha\b/.test(text)) return addDays(today, 2);
  if (/\bamanha\b/.test(text)) return addDays(today, 1);
  if (/\bhoje\b/.test(text)) return today;
  const days = ["domingo", "segunda", "terca", "quarta", "quinta", "sexta", "sabado"];
  const index = days.findIndex((day) => new RegExp(`\\b${day}\\b`).test(text));
  if (index >= 0) {
    const current = new Date(`${today}T12:00Z`).getUTCDay();
    const delta = (index - current + 7) % 7;
    return addDays(today, delta === 0 && /proxim/.test(text) ? 7 : delta);
  }
  return "";
}
function organizationName(line: string, data: WorkspaceData) {
  const value = normalize(line);
  const id = mentioned(data.organizations, value);
  if (id) return { id, name: data.organizations.find((item) => item.id === id)!.name };
  const match = /\b(?:da|do|com a|com o|empresa|organizacao)\s+([A-ZÁÀÂÃÉÊÍÓÔÕÚÇ][\p{L}\p{N}-]*(?:\s+[A-ZÁÀÂÃÉÊÍÓÔÕÚÇ][\p{L}\p{N}-]*)?)/u.exec(line);
  return { id: "", name: match?.[1] ?? "" };
}
function single(line: string, data: WorkspaceData, me: Member, now: string): CaptureDraft {
  const value = normalize(line);
  const draft = emptyDraft(me);
  draft.body = line;
  draft.title = line.replace(/^(tarefa|reuni[aã]o|evento|nota|lembrete|contacto|atualiza[cç][aã]o)\s*:\s*/i, "").slice(0, 160);
  draft.projectId = mentioned(data.projects, value);
  const organization = organizationName(line, data);
  draft.organizationId = organization.id;
  draft.organizationName = organization.id ? "" : organization.name;
  draft.date = suggestedDate(value, now);
  const time = /(?:\bas?\s+|\b)(\d{1,2})(?:h(?:(\d{2}))?|:(\d{2}))\b/.exec(value);
  const plainHour = /\bas?\s+(\d{1,2})\b/.exec(value);
  if (time || plainHour) {
    const hour = Number(time?.[1] ?? plainHour?.[1]);
    const minute = Number(time?.[2] ?? time?.[3] ?? 0);
    if (hour < 24 && minute < 60) draft.time = `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
  }
  const duration = /\b(\d+)\s*(?:minutos|min)\b/.exec(value);
  if (duration) draft.duration = duration[1];
  const owner = data.members.filter((member) => new RegExp(`(?:para (?:o |a )?|calendario (?:do |da )?)${normalize(member.name)}\\b`).test(value));
  if (owner.length === 1) draft.ownerId = owner[0].id;
  if (/^(nota|apontamento)\b/.test(value)) draft.kind = "note";
  else if (/^(lembrete|lembrar|lembra-me)\b/.test(value)) draft.kind = "reminder";
  else if (/^(atualizacao|update)\b/.test(value)) draft.kind = "update";
  else if (/\b(muda|alterar|atualiza)\s+o\s+estado\s+para\b/.test(value) && draft.organizationId) draft.kind = "crm";
  else if (/\b(reuniao|reunir|call|meeting)\b/.test(value)) draft.kind = "meeting";
  else if (/^(evento|encontro|conferencia)\b/.test(value)) draft.kind = "event";
  else if (/^(contacto|organizacao|empresa)\s*:/.test(value) || /^(conheci|falei|contactei|liguei)\b/.test(value)) draft.kind = "contact";
  else if (/^(tarefa|preparar|enviar|rever|validar|retomar|ligar|terminar|criar|corrigir|confirmar|marcar|fazer)\b/.test(value)) draft.kind = "task";
  if (draft.kind === "contact") {
    draft.person = /\b(?:conheci|falei com)\s+(?:o|a)?\s*([A-ZÁÀÂÃÉÊÍÓÔÕÚÇ][\p{L}-]*)/iu.exec(line)?.[1] ?? "";
    draft.title = organization.name || draft.title;
    if (/\b(quer falar|retomar|contactar|ligar)\b/.test(value)) draft.nextStep = "Retomar contacto";
  }
  if (draft.kind === "meeting") {
    draft.title = draft.title.replace(/^marca\s+(?:uma\s+)?/i, "").replace(/\s+(?:segunda|terça|terca|quarta|quinta|sexta|sábado|sabado|domingo)(?:-feira)?\s+(?:às|as)\s+\d{1,2}(?:h\d{0,2}|:\d{2})?$/i, "");
    draft.title = draft.title.charAt(0).toLocaleUpperCase("pt") + draft.title.slice(1);
  }
  if (draft.kind === "task") draft.title = draft.title.charAt(0).toLocaleUpperCase("pt") + draft.title.slice(1);
  if (draft.kind === "crm") {
    const requested = /\bestado\s+para\s+([\p{L}]+)/iu.exec(line)?.[1];
    const stage = requested?.toLowerCase() ?? "";
    draft.stage = stage === "talking" ? "contacted" : stage === "opportunity" ? "meeting" : stage;
    draft.title = organization.name;
    draft.body = /\bnota\s+(?:a\s+)?dizer\s+que\s+(.+)$/iu.exec(line)?.[1] ?? line;
  }
  if (draft.kind === "reminder" && !draft.time) draft.time = "09:00";
  return draft;
}
// Rule-based proposals are reviewed before a single atomic commit. Ambiguous text
// remains in Inbox; it is never silently discarded or classified as a task.
export function parseCapture(raw: string, data: WorkspaceData, me: Member, now: string): CaptureDraft[] {
  const lines = raw.split(/\n+/).map((line) => line.trim()).filter(Boolean).slice(0, 10);
  return lines.flatMap((line) => {
    const taskClause = /\s+e\s+cria\s+uma\s+(?:tarefa|task)\s+(?:para\s+)?(.+)$/i.exec(line);
    if (taskClause) {
      const meeting = single(line.slice(0, taskClause.index), data, me, now);
      const task = single(`Tarefa: ${taskClause[1]}`, data, me, now);
      task.kind = "task";
      task.organizationId = meeting.organizationId;
      task.organizationName = meeting.organizationName;
      if (/dia anterior/i.test(taskClause[1]) && meeting.date) task.date = addDays(meeting.date, -1);
      task.title = task.title.replace(/\s+no dia anterior.*$/i, "");
      task.title = task.title.replace(/^eu\s+/i, "").replace(/\s+(?:na|no)\s+(?:segunda|terca|quarta|quinta|sexta|sabado|domingo).*$/i, "");
      return [meeting, task];
    }
    const draft = single(line, data, me, now);
    // A commercial follow-up belongs to the organization, so no duplicate reminder.
    if (draft.kind === "contact") {
      const reminder = /\blembra-me\s+(?:no\s+)?(?:dia\s+)?(.+)$/i.exec(line);
      if (reminder) draft.date = suggestedDate(normalize(reminder[1]), now) || draft.date;
    }
    return [draft];
  });
}
