import { readFile } from "node:fs/promises";
import path from "node:path";
import { requireMember } from "@/application/auth";
import { executeCommand } from "@/application/commands";
import { repository } from "@/persistence/store";
import { errorResponse, jsonBody } from "@/foundation/http";
import { AppError } from "@/domain/validation";
import { locateMunicipality } from "@/domain/municipalities";
import { caeGroups, classify, groupForCae, icpFit, isKnown, vougaBase, type CaeGroup, type Prospect } from "@/domain/prospects";
import { googleMapsLink, haversineKm, planRoute, type RouteCandidate, type RouteRequest, type RouteStop } from "@/domain/routing";
import { routeGeometry, routingConfigured, travelMatrix } from "@/services/routing-service";

type PlanInput = RouteRequest & { sectors: CaeGroup[]; crm: boolean; prospects: boolean; include: string[]; exclude: string[] };

async function loadProspects(): Promise<Prospect[]> {
  try {
    return (JSON.parse(await readFile(path.resolve(process.env.VOUGA_DATA_DIR || ".local", "prospects.json"), "utf8")).items as Prospect[]) ?? [];
  } catch {
    return [];
  }
}

function readPlanInput(value: unknown): PlanInput {
  const v = (value ?? {}) as Record<string, unknown>;
  const center = v.center as { lat?: unknown; lng?: unknown } | undefined;
  const lat = Number(center?.lat), lng = Number(center?.lng);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) throw new AppError("Escolhe o centro da área no mapa.");
  const time = (t: unknown, fallback: string) => (typeof t === "string" && /^\d{2}:\d{2}$/.test(t) ? t : fallback);
  const date = typeof v.date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v.date) ? v.date : "";
  if (!date) throw new AppError("Escolhe o dia das visitas.");
  const sectors = Array.isArray(v.sectors) ? (v.sectors.filter((s) => typeof s === "string" && s in caeGroups) as CaeGroup[]) : [];
  return {
    center: { lat, lng },
    radiusKm: Math.min(80, Math.max(2, Number(v.radiusKm) || 20)),
    count: Math.min(12, Math.max(1, Math.round(Number(v.count) || 6))),
    date,
    start: time(v.start, "09:00"),
    end: time(v.end, "18:30"),
    visitMinutes: Math.min(180, Math.max(15, Number(v.visitMinutes) || 45)),
    lunch: v.lunch !== false,
    sectors: sectors.length ? sectors : (Object.keys(caeGroups) as CaeGroup[]),
    crm: v.crm !== false,
    prospects: v.prospects !== false,
    include: Array.isArray(v.include) ? v.include.filter((x): x is string => typeof x === "string").slice(0, 12) : [],
    exclude: Array.isArray(v.exclude) ? v.exclude.filter((x): x is string => typeof x === "string").slice(0, 200) : [],
  };
}

async function candidatesFor(input: PlanInput) {
  const data = await repository().read();
  const notesOf = (id: string) => data.interactions.filter((note) => note.organizationId === id).map((note) => note.body).join(" ");
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
      const reasons = ["Empresa New do CRM", caeGroups[group].replace(/ \(CAE \d+\)/, "")];
      let score = 3;
      if (company.pinned) { score += 3; reasons.push("Favorita"); }
      if (icpFit(company.financials, company.size) === "dentro") { score += 2; reasons.push("Dentro do ICP"); }
      if (!company.coordinates) { score -= 1; reasons.push("Localização aproximada (centro do concelho)"); }
      candidates.push({ kind: "crm", id: company.id, name: company.name, location: company.location ?? "", lat: spot.lat, lng: spot.lng, score, reasons });
    }
  }
  if (input.prospects) {
    const known = data.organizations.map((company) => ({ name: company.name, nif: company.nif, website: notesOf(company.id).match(/Website: (\S+)/)?.[1] }));
    for (const prospect of await loadProspects()) {
      if (!input.sectors.includes(prospect.group) || !inArea(prospect)) continue;
      if (prospect.check?.status === "a-confirmar" || icpFit(prospect.financials) === "fora" || isKnown(prospect, known)) continue;
      const reasons = [`Prospeto · ${caeGroups[prospect.group].replace(/ \(CAE \d+\)/, "")}`];
      let score = 1;
      if (prospect.check?.status === "verificado") { score += 1; reasons.push("Localização verificada"); }
      if (icpFit(prospect.financials) === "dentro") { score += 2; reasons.push("Dentro do ICP"); }
      candidates.push({ kind: "prospect", id: prospect.id, name: prospect.name, location: prospect.location, lat: prospect.lat, lng: prospect.lng, score, reasons });
    }
  }
  // Road matrices are limited in size: keep the 40 most valuable, nearest first on ties.
  // Chosen companies always stay among the candidates; excluded ones never appear.
  const pool = candidates.filter((c) => !input.exclude.includes(c.id));
  const ranked = [...pool.filter((c) => input.include.includes(c.id)), ...pool.filter((c) => !input.include.includes(c.id))
    .sort((a, b) => b.score - a.score || haversineKm(input.center, a) - haversineKm(input.center, b))
    ].slice(0, 40);
  return { candidates: ranked, unknownSector };
}

async function plan(input: PlanInput) {
  const { candidates, unknownSector } = await candidatesFor(input);
  const base = { lat: vougaBase.lat, lng: vougaBase.lng };
  if (!candidates.length) return { stops: [], considered: 0, unknownSector, message: "Não há empresas elegíveis nesta área com estes setores e filtros." };
  const matrix = await travelMatrix([base, ...candidates]);
  const result = planRoute(candidates, matrix, input, input.include);
  const chosen = new Set(result.stops.map((s) => s.id));
  const alternatives = candidates.filter((c) => !chosen.has(c.id)).slice(0, 25);
  const geometry = await routeGeometry([base, ...result.stops, base]);
  return {
    ...result,
    geometry,
    considered: candidates.length,
    alternatives,
    unknownSector,
    sectors: input.sectors.map((s) => caeGroups[s].replace(/ \(CAE \d+\)/, "")),
    base: vougaBase,
    googleMaps: googleMapsLink(base, result.stops),
    provider: matrix.estimated ? "estimativa" : "OpenRouteService",
    warning: "warning" in matrix ? matrix.warning : routingConfigured() ? undefined : "Tempos estimados: adiciona ORS_API_KEY ao .env para usar tempos reais por estrada.",
  };
}

/** Creates the prospects as New companies and one Contacto event per visit, in a single transaction. */
async function schedule(me: Awaited<ReturnType<typeof requireMember>>, value: unknown) {
  const v = (value ?? {}) as { date?: unknown; stops?: unknown };
  const date = typeof v.date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v.date) ? v.date : null;
  if (!date || !Array.isArray(v.stops) || !v.stops.length) throw new AppError("Não há visitas para marcar.");
  const stops = v.stops as RouteStop[];
  const prospects = await loadProspects();
  return repository().transact((data) => {
    let created = 0;
    for (const stop of stops) {
      if (!/^\d{2}:\d{2}$/.test(stop.arrival) || !/^\d{2}:\d{2}$/.test(stop.departure)) throw new AppError("Horário inválido no plano.");
      let organizationId = stop.kind === "crm" ? stop.id : null;
      if (stop.kind === "prospect") {
        const prospect = prospects.find((p) => p.id === stop.id);
        if (!prospect) throw new AppError(`O prospeto ${stop.name} já não está na base de prospeção.`);
        const result = executeCommand(data, me, { action: "organization.save", values: {
          name: prospect.name, stage: "new", location: prospect.location, address: prospect.address,
          coordinates: { lat: prospect.lat, lng: prospect.lng }, phone: prospect.phone ?? "",
          ...(prospect.nif ? { nif: prospect.nif } : {}), ...(prospect.financials ? { financials: prospect.financials } : {}),
          initialNote: [`Origem: prospeção (${prospect.source === "osm" ? "OpenStreetMap" : "lista importada"}), incluída num roteiro de visitas a ${date}.`, prospect.website ? `Website: ${prospect.website}` : ""].filter(Boolean).join("\n"),
        } });
        organizationId = data.organizations.find((o) => o.name === prospect.name)?.id ?? null;
        if (!organizationId) throw new AppError(result.message ?? "Não foi possível criar a empresa.");
        created++;
      }
      const company = data.organizations.find((o) => o.id === organizationId);
      if (!company) throw new AppError(`A empresa ${stop.name} já não existe.`);
      executeCommand(data, me, { action: "meeting.save", values: {
        title: `Visita · ${company.name}`,
        body: `Visita de prospeção (roteiro de ${date}). ${stop.reasons.join(" · ")}.`,
        kind: "meeting", startsAt: `${date}T${stop.arrival}`, endsAt: `${date}T${stop.departure}`,
        calendarOwnerId: me.id, calendarKey: "contacto", participantIds: [me.id], organizationId: company.id,
      } });
    }
    return { message: `${stops.length} visitas marcadas no calendário Contacto${created ? `; ${created} prospetos adicionados ao CRM como New` : ""}.` };
  });
}

export async function POST(request: Request) {
  try {
    const me = await requireMember(request);
    const body = (await jsonBody(request)) as { action?: string; values?: unknown };
    if (body.action === "plan") return Response.json(await plan(readPlanInput(body.values)), { headers: { "Cache-Control": "no-store" } });
    if (body.action === "schedule") return Response.json(await schedule(me, body.values), { headers: { "Cache-Control": "no-store" } });
    throw new AppError("Ação desconhecida.");
  } catch (error) {
    return errorResponse(error);
  }
}
