import type { Store, Stage, Entity } from "@/domain/model";

export type Row = Record<string, unknown>;
export interface LegacyExport {
  format: "vouga-legacy-export-v1";
  source: string;
  exportedAt: string;
  tables: Record<string, Row[]>;
  manifest: Record<string, { count: number; complete: boolean; error?: string }>;
}
export interface ImportOptions {
  actorId: string;
  memberMap: Record<string, string>;
  // Explicit decisions only. A similar name is never sufficient to merge clients.
  companyMap?: Record<string, string>;
  stageMap?: Record<string, Stage>;
}
export interface ImportReport {
  created: { companies: number; contacts: number; interactions: number; tasks: number };
  skipped: number;
  review: { table: string; id: string; reason: string }[];
}
const stages: Record<string, Stage> = {
  to_contact: "new", contacted: "contacted", replied: "contacted",
  meeting_scheduled: "meeting", budgeting: "proposal", agreed: "client", not_interested: "dormant",
};
const str = (v: unknown) => typeof v === "string" ? v : "";
const norm = (v: string) => v.normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim().toLowerCase().replace(/\s+/g, " ");

/** Pure planning step: caller previews this result, then commits in one repository transaction. */
export function importLegacyCrm(store: Store, input: LegacyExport, options: ImportOptions) {
  if (input.format !== "vouga-legacy-export-v1" || !/^[a-z0-9-]+$/.test(input.source)) throw new Error("Export inválido.");
  if (!store.members.some(m => m.id === options.actorId && m.role === "admin")) throw new Error("Importação reservada a administradores.");
  for (const table of ["companies", "contacts", "contact_interactions", "members", "tasks", "task_companies"]) {
    if (!input.manifest[table]?.complete || !Array.isArray(input.tables[table]) || input.tables[table].length !== input.manifest[table].count)
      throw new Error(`Export incompleto: ${table}. Não foram alterados dados.`);
  }
  const data = structuredClone(store);
  const report: ImportReport = { created: { companies: 0, contacts: 0, interactions: 0, tasks: 0 }, skipped: 0, review: [] };
  const review = (table: string, row: Row, reason: string) => report.review.push({ table, id: str(row.id), reason });
  const id = (table: string, sourceId: unknown) => {
    if (!str(sourceId)) throw new Error(`Registo sem ID: ${table}`);
    return `legacy:${input.source}:${table}:${sourceId}`;
  };
  const member = (sourceId: unknown) => {
    const mapped = options.memberMap[str(sourceId)];
    return data.members.some(m => m.id === mapped) ? mapped : undefined;
  };
  const base = (table: string, row: Row, actor: string): Entity => {
    const created = str(row.created_at) || input.exportedAt;
    const updated = str(row.updated_at) || created;
    if (!Number.isFinite(Date.parse(created)) || !Number.isFinite(Date.parse(updated))) throw new Error(`Data inválida em ${table}`);
    return { id: id(table, row.id), version: 1, createdAt: created, updatedAt: updated, createdBy: actor };
  };
  const companyIds = new Map<string, string>();
  for (const row of input.tables.companies) {
    const sourceId = str(row.id), localId = id("companies", sourceId);
    if (data.organizations.some(o => o.id === localId)) { companyIds.set(sourceId, localId); report.skipped++; continue; }
    const mapped = options.companyMap?.[sourceId];
    if (mapped) {
      if (!data.organizations.some(o => o.id === mapped)) throw new Error("Mapeamento para organização inexistente.");
      companyIds.set(sourceId, mapped); report.skipped++; continue;
    }
    const owner = member(row.owner_member_id);
    if (!owner) { review("companies", row, "Mapear responsável antes de importar."); continue; }
    if (!str(row.name).trim()) { review("companies", row, "Nome em falta."); continue; }
    if (data.organizations.some(o => norm(o.name) === norm(str(row.name)))) { review("companies", row, "Nome já existente: confirmar associação ou manter separado."); continue; }
    const stage = options.stageMap?.[sourceId] ?? stages[str(row.prospecting_stage)];
    if (!stage) { review("companies", row, "Estado comercial ambíguo (inclui parceria estratégica ou estado vazio): mapear explicitamente."); continue; }
    const primary = input.tables.contacts.find(c => c.id === row.primary_contact_id && c.company_id === sourceId);
    data.organizations.push({ ...base("companies", row, owner), name: str(row.name), person: str(primary?.display_name),
      email: str(row.contact_email) || str(primary?.email), phone: str(row.contact_phone) || str(primary?.phone),
      stage, ownerId: owner, nextStep: "", followUpOn: null, archived: row.status === "archived" });
    companyIds.set(sourceId, localId); report.created.companies++;
    // Preserve original fields without introducing additional fields into the CRM interface.
    const context = ["Importado do Vouga OS anterior.", `Estado original: ${str(row.prospecting_stage)} · ${str(row.status)}`,
      ...[["Website", row.website], ["CAE", row.primary_cae], ["Contexto", row.current_context], ["Riscos da relação", row.relationship_risks]]
        .filter(([, value]) => str(value)).map(([label, value]) => `${label}: ${str(value)}`)].join("\n");
    data.interactions.push({ ...base("company-context", row, owner), organizationId: localId, channel: "note", body: context });
    report.created.interactions++;
  }
  for (const row of input.tables.contacts) {
    if (data.contacts.some(c => c.id === id("contacts", row.id))) { report.skipped++; continue; }
    const companyId = companyIds.get(str(row.company_id)), owner = member(row.owner_member_id);
    if (!companyId || !owner || !str(row.display_name)) { review("contacts", row, "Empresa, nome ou responsável por resolver; preservado no export."); continue; }
    if (row.status === "archived") { review("contacts", row, "Contacto arquivado: preservado no export, não reativado."); continue; }
    data.contacts.push({ ...base("contacts", row, owner), organizationId: companyId, name: str(row.display_name), email: str(row.email), phone: str(row.phone) });
    report.created.contacts++;
    const context = [["Função", row.job_title], ["Relação", row.relationship_role], ["LinkedIn", row.linkedin_url], ["Contexto", row.important_context]]
      .filter(([, value]) => str(value)).map(([label, value]) => `${label}: ${str(value)}`).join("\n");
    if (context) {
      data.interactions.push({ ...base("contact-context", row, owner), organizationId: companyId, channel: "note", body: `${str(row.display_name)}\n${context}` });
      report.created.interactions++;
    }
  }
  for (const row of input.tables.contact_interactions) {
    if (data.interactions.some(i => i.id === id("contact_interactions", row.id))) { report.skipped++; continue; }
    const contact = input.tables.contacts.find(c => c.id === row.contact_id);
    const companyId = companyIds.get(str(row.company_id) || str(contact?.company_id));
    const recorder = member(row.recorded_by_member_id);
    if (!companyId || !recorder) { review("contact_interactions", row, "Empresa ou autor por resolver."); continue; }
    const channel = row.channel === "call" || row.channel === "email" ? row.channel : "note";
    const occurredAt = str(row.occurred_at) || str(row.created_at);
    if (!Number.isFinite(Date.parse(occurredAt))) { review("contact_interactions", row, "Data da interação inválida."); continue; }
    data.interactions.push({ ...base("contact_interactions", row, recorder), createdAt: occurredAt,
      organizationId: companyId, channel,
      body: [str(contact?.display_name), [str(row.channel), str(row.direction)].filter(Boolean).join(" · "), str(row.body)].filter(Boolean).join("\n") });
    report.created.interactions++;
  }
  for (const row of input.tables.tasks.filter(t => t.purpose === "relationship_follow_up")) {
    if (data.tasks.some(t => t.id === id("tasks", row.id))) { report.skipped++; continue; }
    const links = input.tables.task_companies.filter(l => l.task_id === row.id);
    const companyId = links.length === 1 ? companyIds.get(str(links[0].company_id)) : undefined;
    const owner = member(row.owner_member_id);
    const statusMap = { todo: "todo", in_progress: "doing", blocked: "blocked", completed: "done" } as const;
    const status = statusMap[str(row.status) as keyof typeof statusMap];
    if (!owner || !companyId || !status) { review("tasks", row, "Follow-up com responsável, associação ou estado por resolver (canceladas não reativadas)."); continue; }
    const due = str(row.due_at);
    if (due && !Number.isFinite(Date.parse(due))) { review("tasks", row, "Prazo inválido."); continue; }
    const dueOn = due ? new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Lisbon", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(due)) : null;
    data.tasks.push({ ...base("tasks", row, owner), title: str(row.title), body: [row.expected_result, row.blocked_reason, row.blocked_next_move, row.completion_note].map(str).filter(Boolean).join("\n"), status, ownerId: owner, dueOn, projectId: null, organizationId: companyId, priority: "none" });
    report.created.tasks++;
  }
  return { data, report };
}
