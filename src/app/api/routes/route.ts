import { requireMember } from "@/application/auth";
import { candidatesFor, readPlanInput, readScheduleInput, scheduleVisits, type PlanInput } from "@/application/route-visits";
import { repository } from "@/persistence/store";
import { prospectRepository } from "@/persistence/prospects";
import { errorResponse, jsonBody } from "@/foundation/http";
import { executeCommand } from "@/application/commands";
import { knownCompanies } from "@/application/prospects";
import { AppError, record, text } from "@/domain/validation";
import { stages, type VisitRouteStop } from "@/domain/model";
import { locateMunicipality } from "@/domain/municipalities";
import { caeGroups, knownIndex, vougaBase } from "@/domain/prospects";
import { googleMapsLink, haversineKm, planRoute, replanFrom, routeSwapDelta, type RouteCandidate } from "@/domain/routing";
import { dateKey, localDateTime } from "@/domain/time";
import { routeGeometry, routingConfigured, travelMatrix } from "@/services/routing-service";

/** Prospects the plan may use: those inside the area's bounding box, plus the ones the user picked anywhere. */
async function prospectsFor(input: PlanInput) {
  const lat = input.radiusKm / 110.57, lng = input.radiusKm / (111.32 * Math.cos((input.center.lat * Math.PI) / 180));
  const prospects = prospectRepository();
  const [nearby, picked] = await Promise.all([
    input.prospects ? prospects.query({ area: { minLat: input.center.lat - lat, maxLat: input.center.lat + lat, minLng: input.center.lng - lng, maxLng: input.center.lng + lng } }) : [],
    input.include.length ? prospects.query({ ids: input.include }) : [],
  ]);
  // Discarded prospects stay out of suggestions, but one the user picks on the map still goes in.
  return [...nearby.filter((p) => !p.discarded), ...picked.filter((p) => !nearby.some((n) => n.id === p.id))].filter((p) => !p.organizationId);
}

async function plan(input: PlanInput) {
  const { candidates, unknownSector } = candidatesFor(await repository().read(), await prospectsFor(input), input);
  const base = { lat: vougaBase.lat, lng: vougaBase.lng };
  if (!candidates.length) return { stops: [], considered: 0, unknownSector, message: "Não há empresas elegíveis nesta área com estes setores e filtros." };
  const matrix = await travelMatrix([base, ...candidates]);
  const result = planRoute(candidates, matrix, input, input.include);
  const chosen = new Set(result.stops.map((s) => s.id));
  const alternatives = candidates.filter((c) => !chosen.has(c.id)).slice(0, 25);
  // Keep the user in control: a selected stop can always compare against nearby alternatives and show the delta,
  // even when the route still fits before the end of the day.
  const suggestions: { remove: string; removeName: string; add: string; addName: string; saves: number; lat: number; lng: number; kind: "crm" | "prospect"; location: string }[] = [];
  const ids = result.stops.map((stop) => stop.id);
  const near = (c: RouteCandidate) => Math.min(...result.stops.map((stop) => haversineKm(stop, c)));
  for (const stop of result.stops) {
    for (const alt of [...alternatives].sort((x, y) => near(x) - near(y)).slice(0, 10)) {
      const trial = planRoute(candidates, matrix, input, [...ids.filter((id) => id !== stop.id), alt.id]);
      const saves = -routeSwapDelta(result, trial);
      const worthwhile = result.overtime > 0 ? saves >= 5 : Math.abs(saves) <= 30 || saves >= 5;
      if (worthwhile) {
        suggestions.push({ remove: stop.id, removeName: stop.name, add: alt.id, addName: alt.name, saves, lat: alt.lat, lng: alt.lng, kind: alt.kind, location: alt.location });
      }
    }
  }
  suggestions.sort((x, y) => y.saves - x.saves);
  const bestSwaps = suggestions.filter((s, i, all) => all.findIndex((o) => o.remove === s.remove) === i).slice(0, 3);
  const geometry = await routeGeometry([base, ...result.stops, base]);
  return {
    ...result,
    geometry,
    considered: candidates.length,
    alternatives: alternatives.map((c) => ({ id: c.id, name: c.name, location: c.location, lat: c.lat, lng: c.lng, kind: c.kind })),
    suggestions: bestSwaps,
    unknownSector,
    sectors: input.sectors.map((s) => caeGroups[s].replace(/ \(CAE \d+\)/, "")),
    base: vougaBase,
    googleMaps: googleMapsLink(base, result.stops),
    provider: matrix.estimated ? "estimativa" : "OpenRouteService",
    warning: "warning" in matrix ? matrix.warning : routingConfigured() ? undefined : "Tempos estimados: adiciona ORS_API_KEY ao .env para usar tempos reais por estrada.",
  };
}

/** The route and where the day continues from: the person's position when given, else the last visited stop. */
async function routeContext(value: unknown) {
  const v = record(value ?? {});
  const data = await repository().read();
  const route = data.routes.find((item) => item.id === text(v.id, "Rota", 100));
  if (!route) throw new AppError("Rota não encontrada.", 404);
  if (route.currentIndex >= route.stops.length) throw new AppError("Esta rota já está concluída.");
  const lat = Number(v.lat), lng = Number(v.lng);
  const here = v.lat !== undefined && Number.isFinite(lat) && Number.isFinite(lng) ? { lat, lng } : null;
  return { v, data, route, here, origin: here ?? route.stops[route.currentIndex - 1] ?? vougaBase };
}

const minutesOf = (hhmm: string) => Number(hhmm.slice(0, 2)) * 60 + Number(hhmm.slice(3));
const hhmm = (total: number) => `${String(Math.floor(total / 60) % 24).padStart(2, "0")}:${String(total % 60).padStart(2, "0")}`;

/**
 * Companies worth a detour from here: CRM companies (any stage) and open prospects within 25 km, nearest first,
 * leaving out the ones already in the route.
 */
async function nearby(value: unknown) {
  const { data, route, origin } = await routeContext(value);
  const inRoute = new Set(route.stops.flatMap((stop) => [stop.id, stop.organizationId ?? ""]));
  const radius = 25, lat = radius / 110.57, lng = radius / (111.32 * Math.cos((origin.lat * Math.PI) / 180));
  const prospects = await prospectRepository().query({ area: { minLat: origin.lat - lat, maxLat: origin.lat + lat, minLng: origin.lng - lng, maxLng: origin.lng + lng } });
  const known = knownIndex(knownCompanies(data));
  const items = [
    ...data.organizations.flatMap((company) => {
      const spot = company.coordinates ?? locateMunicipality(company.location);
      if (company.archived || !spot || inRoute.has(company.id)) return [];
      return [{ kind: "crm" as const, id: company.id, name: company.name, location: company.location ?? "", detail: stages[company.stage], approximate: !company.coordinates, km: haversineKm(origin, spot) }];
    }),
    ...prospects
      .filter((p) => !p.organizationId && !p.discarded && !inRoute.has(p.id) && !known(p))
      .map((p) => ({ kind: "prospect" as const, id: p.id, name: p.name, location: p.location, detail: caeGroups[p.group].replace(/ \(CAE \d+\)/, ""), approximate: false, km: haversineKm(origin, p) })),
  ].filter((item) => item.km <= radius).sort((a, b) => a.km - b.km).slice(0, 40);
  return { items: items.map((item) => ({ ...item, km: Math.round(item.km * 10) / 10 })) };
}

/**
 * Reorders the visits still to do from where the person is (or the last visited stop) and from now, keeping
 * every remaining visit and, when asked, adding one company; the result is saved through route.replan.
 */
async function replan(me: Awaited<ReturnType<typeof requireMember>>, value: unknown) {
  const { v, data, route, here, origin } = await routeContext(value);
  const remaining = route.stops.slice(route.currentIndex);
  const now = new Date().toISOString();
  // Today: from the current time. Another day: from the time the remaining visits were due to start.
  const start = route.date === dateKey(now) ? localDateTime(now).slice(11) : remaining[0].arrival;
  // The added company's name and position come from the CRM or the prospect base, never from the browser.
  let added: VisitRouteStop | null = null;
  if (v.add !== undefined) {
    const add = record(v.add);
    const kind = add.kind === "prospect" ? "prospect" : "crm";
    const addId = text(add.id, "Empresa", 300);
    const typical = remaining.map((stop) => minutesOf(stop.departure) - minutesOf(stop.arrival)).sort((a, b) => a - b);
    const length = Math.max(15, typical[Math.floor(typical.length / 2)] ?? 30);
    const times = { arrival: start, departure: hhmm(minutesOf(start) + length) };
    if (kind === "crm") {
      const company = data.organizations.find((item) => item.id === addId && !item.archived);
      const spot = company && (company.coordinates ?? locateMunicipality(company.location));
      if (!company || !spot) throw new AppError("Esta empresa não tem localização no CRM para entrar na rota.");
      added = { kind, id: company.id, name: company.name, location: company.location ?? "", lat: spot.lat, lng: spot.lng, ...times, reasons: ["Acrescentada durante a rota"], organizationId: company.id };
    } else {
      const [prospect] = await prospectRepository().query({ ids: [addId] });
      if (!prospect) throw new AppError("Este prospeto já não está na base.", 404);
      added = { kind, id: prospect.id, name: prospect.name, location: prospect.location, lat: prospect.lat, lng: prospect.lng, ...times, reasons: ["Acrescentada durante a rota", `Prospeto · ${caeGroups[prospect.group].replace(/ \(CAE \d+\)/, "")}`], organizationId: null };
    }
  }
  const visits = added ? [...remaining, added] : remaining;
  const base = { lat: vougaBase.lat, lng: vougaBase.lng };
  const matrix = await travelMatrix([origin, ...visits, base]);
  const plan = replanFrom(visits, matrix, start);
  const result = await repository().transact((store) => executeCommand(store, me, { action: "route.replan", values: {
    id: route.id, version: route.version, ...(added ? { add: added } : {}),
    stops: plan.stops.map(({ id: stopId, arrival, departure }) => ({ id: stopId, arrival, departure })),
  } }));
  return {
    message: `${result.message} Regresso previsto às ${plan.returnAt}${here ? "" : " (a partir da última visita: sem localização atual)"}${matrix.estimated ? "; tempos estimados" : ""}.`,
  };
}

export async function POST(request: Request) {
  try {
    const me = await requireMember(request);
    const body = (await jsonBody(request)) as { action?: string; values?: unknown };
    if (body.action === "plan") return Response.json(await plan(readPlanInput(body.values)), { headers: { "Cache-Control": "no-store" } });
    if (body.action === "schedule") {
      const input = readScheduleInput(body.values);
      const prospectIds = input.stops.filter((stop) => stop.kind === "prospect").map((stop) => stop.id);
      const prospects = prospectIds.length ? await prospectRepository().query({ ids: prospectIds }) : [];
      const { converted, ...result } = await repository().transact((data) => scheduleVisits(data, me, prospects, input));
      // The companies are already saved; marking the prospects only takes them off the prospect map, and a
      // failure here leaves them hidden anyway by the CRM name/NIF match.
      if (converted.length)
        await prospectRepository().upsert(converted.flatMap(({ prospectId, organizationId }) => {
          const prospect = prospects.find((p) => p.id === prospectId);
          return prospect ? [{ ...prospect, organizationId }] : [];
        })).catch(() => undefined);
      return Response.json(result, { headers: { "Cache-Control": "no-store" } });
    }
    if (body.action === "replan") return Response.json(await replan(me, body.values), { headers: { "Cache-Control": "no-store" } });
    if (body.action === "nearby") return Response.json(await nearby(body.values), { headers: { "Cache-Control": "no-store" } });
    throw new AppError("Ação desconhecida.");
  } catch (error) {
    return errorResponse(error);
  }
}
