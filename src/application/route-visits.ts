import { executeCommand } from "@/application/commands";
import { convertProspect, knownCompanies } from "@/application/prospects";
import type { Member, Store } from "@/domain/model";
import { locateMunicipality } from "@/domain/municipalities";
import { caeGroups, classify, groupForCae, icpFit, knownIndex, type CaeGroup, type Prospect } from "@/domain/prospects";
import { haversineKm, type RouteCandidate, type RouteRequest } from "@/domain/routing";
import { isDateKey } from "@/domain/time";
import { AppError, choice, record, text } from "@/domain/validation";

export type PlanInput = RouteRequest & { sectors: CaeGroup[]; crm: boolean; prospects: boolean; include: string[]; exclude: string[] };

const sectorLabel = (group: CaeGroup) => caeGroups[group].replace(/ \(CAE \d+\)/, "");
const clock = /^([01]\d|2[0-3]):[0-5]\d$/;
const ids = (value: unknown, max: number) =>
  Array.isArray(value) ? value.filter((x): x is string => typeof x === "string" && x.length <= 200).slice(0, max) : [];

export function readPlanInput(value: unknown): PlanInput {
  const v = (value ?? {}) as Record<string, unknown>;
  const center = v.center as { lat?: unknown; lng?: unknown } | undefined;
  const lat = Number(center?.lat), lng = Number(center?.lng);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) throw new AppError("Escolhe o centro da área no mapa.");
  const time = (t: unknown, fallback: string) => (typeof t === "string" && clock.test(t) ? t : fallback);
  if (typeof v.date !== "string" || !isDateKey(v.date)) throw new AppError("Escolhe o dia das visitas.");
  const sectors = Array.isArray(v.sectors) ? (v.sectors.filter((s) => typeof s === "string" && s in caeGroups) as CaeGroup[]) : [];
  return {
    center: { lat, lng },
    radiusKm: Math.min(80, Math.max(2, Number(v.radiusKm) || 20)),
    count: Math.min(12, Math.max(1, Math.round(Number(v.count) || 6))),
    date: v.date,
    start: time(v.start, "09:00"),
    end: time(v.end, "18:30"),
    visitMinutes: Math.min(180, Math.max(15, Number(v.visitMinutes) || 45)),
    lunch: v.lunch !== false,
    sectors: sectors.length ? sectors : (Object.keys(caeGroups) as CaeGroup[]),
    crm: v.crm !== false,
    prospects: v.prospects !== false,
    include: ids(v.include, 12),
    exclude: ids(v.exclude, 200),
  };
}

/** Companies that may enter the route: New CRM companies and prospects in the area, plus any company the user picked. */
export function candidatesFor(data: Store, prospects: Prospect[], input: PlanInput) {
  // Notes grouped once, instead of scanning every note for every company.
  const notesByCompany = new Map<string, string[]>();
  for (const note of data.interactions) notesByCompany.set(note.organizationId, [...(notesByCompany.get(note.organizationId) ?? []), note.body]);
  const notesOf = (id: string) => (notesByCompany.get(id) ?? []).join(" ");
  const inArea = (p: { lat: number; lng: number }) => haversineKm(input.center, p) <= input.radiusKm;
  const candidates: RouteCandidate[] = [];
  let unknownSector = 0;
  if (input.crm) {
    for (const company of data.organizations) {
      if (company.archived || company.stage !== "new") continue;
      const spot = company.coordinates ?? locateMunicipality(company.location);
      if (!spot || !inArea(spot)) continue;
      const notes = notesOf(company.id);
      const group = groupForCae(notes.match(/CAE:?\s*(\d{4,5})/)?.[1]) ?? classify(company.name, notes.slice(0, 400));
      // Only the selected sectors: a company whose sector is unknown or outside the priority CAEs is left out.
      if (!group) { unknownSector++; continue; }
      if (!input.sectors.includes(group)) continue;
      if (icpFit(company.financials, company.size) === "fora") continue;
      const reasons = ["Empresa New do CRM", sectorLabel(group)];
      let score = 3;
      if (company.pinned) { score += 3; reasons.push("Favorita"); }
      if (icpFit(company.financials, company.size) === "dentro") { score += 2; reasons.push("Dentro do ICP"); }
      if (!company.coordinates) { score -= 1; reasons.push("Localização aproximada (centro do concelho)"); }
      candidates.push({ kind: "crm", id: company.id, name: company.name, location: company.location ?? "", lat: spot.lat, lng: spot.lng, score, reasons });
    }
  }
  if (input.prospects) {
    const known = knownIndex(knownCompanies(data));
    for (const prospect of prospects) {
      if (!input.sectors.includes(prospect.group) || !inArea(prospect)) continue;
      if (prospect.check?.status === "a-confirmar" || icpFit(prospect.financials) === "fora" || known(prospect)) continue;
      const reasons = [`Prospeto · ${sectorLabel(prospect.group)}`];
      let score = 1;
      if (prospect.check?.status === "verificado") { score += 1; reasons.push("Localização verificada"); }
      if (icpFit(prospect.financials) === "dentro") { score += 2; reasons.push("Dentro do ICP"); }
      candidates.push({ kind: "prospect", id: prospect.id, name: prospect.name, location: prospect.location, lat: prospect.lat, lng: prospect.lng, score, reasons });
    }
  }
  // A company the user picked on the map always joins, even outside the area, the sectors or the filters.
  for (const id of input.include) {
    if (input.exclude.includes(id) || candidates.some((c) => c.id === id)) continue;
    const company = data.organizations.find((item) => item.id === id && !item.archived);
    const spot = company && (company.coordinates ?? locateMunicipality(company.location));
    const prospect = company ? undefined : prospects.find((item) => item.id === id);
    if (company && spot) candidates.push({ kind: "crm", id, name: company.name, location: company.location ?? "", lat: spot.lat, lng: spot.lng, score: 0, reasons: ["Escolhida no mapa"] });
    else if (prospect) candidates.push({ kind: "prospect", id, name: prospect.name, location: prospect.location, lat: prospect.lat, lng: prospect.lng, score: 0, reasons: ["Escolhida no mapa", `Prospeto · ${sectorLabel(prospect.group)}`] });
  }
  // Road matrices are limited in size: keep the 40 most valuable, nearest first on ties.
  // Chosen companies always stay among the candidates; excluded ones never appear.
  const pool = candidates.filter((c) => !input.exclude.includes(c.id));
  const ranked = [...pool.filter((c) => input.include.includes(c.id)), ...pool.filter((c) => !input.include.includes(c.id))
    .sort((a, b) => b.score - a.score || haversineKm(input.center, a) - haversineKm(input.center, b))
    ].slice(0, 40);
  return { candidates: ranked, unknownSector };
}

export type ScheduleInput = {
  key: string;
  date: string;
  stops: { kind: "crm" | "prospect"; id: string; name: string; arrival: string; departure: string; reasons: string[] }[];
};

export function readScheduleInput(value: unknown): ScheduleInput {
  const v = record(value ?? {});
  const key = text(v.key, "Identificador do pedido", 100);
  if (typeof v.date !== "string" || !isDateKey(v.date)) throw new AppError("Escolhe o dia das visitas.");
  if (!Array.isArray(v.stops) || !v.stops.length) throw new AppError("Não há visitas para marcar.");
  if (v.stops.length > 12) throw new AppError("Máximo de 12 visitas por roteiro.");
  const stops = v.stops.map((item) => {
    const stop = record(item);
    const arrival = text(stop.arrival, "Hora de chegada", 5), departure = text(stop.departure, "Hora de saída", 5);
    if (!clock.test(arrival) || !clock.test(departure) || departure <= arrival) throw new AppError("Horário inválido no plano.");
    return {
      kind: choice(stop.kind, ["crm", "prospect"] as const, "Tipo de visita"),
      id: text(stop.id, "Empresa", 200),
      name: text(stop.name, "Empresa", 160),
      arrival,
      departure,
      reasons: (Array.isArray(stop.reasons) ? stop.reasons : []).slice(0, 8).map((reason) => text(reason, "Motivo", 200)),
    };
  });
  return { key, date: v.date, stops };
}

/**
 * Creates the prospects as New companies and one Contacto event per visit, in the caller's single transaction.
 * Repeating the same request (same key) does nothing the second time.
 */
export function scheduleVisits(data: Store, me: Member, prospects: Prospect[], input: ScheduleInput) {
  const key = `route-schedule:${input.key}`;
  const previous = data.captureReceipts.find((receipt) => receipt.memberId === me.id && receipt.key === key);
  if (previous) return { message: "Estas visitas já estavam marcadas.", ids: previous.ids, converted: [] };
  const meetings: string[] = [];
  const converted: { prospectId: string; organizationId: string }[] = [];
  let created = 0;
  for (const stop of input.stops) {
    let company = stop.kind === "crm" ? data.organizations.find((o) => o.id === stop.id && !o.archived) : undefined;
    if (stop.kind === "prospect") {
      const prospect = prospects.find((p) => p.id === stop.id);
      if (!prospect) throw new AppError(`O prospeto ${stop.name} já não está na base de prospeção.`);
      // A prospect that is already in the CRM (same NIF or name) is visited as that company, not created again.
      const before = data.organizations.length;
      const organizationId = convertProspect(data, me, prospect, `, incluída num roteiro de visitas a ${input.date}`);
      if (data.organizations.length > before) created++;
      converted.push({ prospectId: prospect.id, organizationId });
      company = data.organizations.find((o) => o.id === organizationId);
    }
    if (!company) throw new AppError(`A empresa ${stop.name} já não existe.`);
    const before = new Set(data.meetings.map((m) => m.id));
    executeCommand(data, me, { action: "meeting.save", values: {
      title: `Visita · ${company.name}`,
      body: `Visita de prospeção (roteiro de ${input.date}). ${stop.reasons.join(" · ")}.`,
      kind: "meeting", startsAt: `${input.date}T${stop.arrival}`, endsAt: `${input.date}T${stop.departure}`,
      calendarOwnerId: me.id, calendarKey: "contacto", participantIds: [me.id], organizationId: company.id,
    } });
    meetings.push(...data.meetings.filter((m) => !before.has(m.id)).map((m) => m.id));
  }
  data.captureReceipts.push({ memberId: me.id, key, ids: meetings });
  return {
    message: `${input.stops.length} visitas marcadas no calendário Contacto${created ? `; ${created} prospetos adicionados ao CRM como New` : ""}.`,
    ids: meetings,
    /** Prospects that became (or matched) CRM companies; the caller marks them in the prospect base. */
    converted,
  };
}
