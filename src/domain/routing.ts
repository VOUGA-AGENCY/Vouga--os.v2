// Visit planning: pick the best N companies in an area and order them into a day's route.
// The maths is deterministic (a greedy "value per minute" insertion followed by 2-opt); an AI never computes
// the itinerary. Travel times come from a road-routing provider when configured, otherwise from an estimate.

export interface RouteCandidate {
  kind: "crm" | "prospect";
  id: string;
  name: string;
  location: string;
  lat: number;
  lng: number;
  score: number;
  reasons: string[];
}

export interface RouteRequest {
  center: { lat: number; lng: number };
  radiusKm: number;
  count: number;
  /** Day of the visits, YYYY-MM-DD (Europe/Lisbon). */
  date: string;
  /** "09:00" */
  start: string;
  /** Latest return to base, "18:30". */
  end: string;
  visitMinutes: number;
  lunch: boolean;
}

export interface RouteStop extends RouteCandidate {
  arrival: string;
  departure: string;
  driveMinutes: number;
  km: number;
}

export interface RoutePlan {
  stops: RouteStop[];
  returnAt: string;
  driveMinutes: number;
  km: number;
  /** True when travel times are straight-line estimates rather than road times. */
  estimated: boolean;
  /** Road geometry ([lng, lat] pairs) when a routing provider returned it. */
  geometry?: [number, number][];
  lunchAt?: string;
  left: number;
  /** Minutes beyond the requested return time (the requested number of visits is always honoured). */
  overtime: number;
}

/** Travel matrix between points: seconds and metres. Index 0 is the base. */
export interface TravelMatrix {
  durations: number[][];
  distances: number[][];
  estimated: boolean;
}

export function haversineKm(a: { lat: number; lng: number }, b: { lat: number; lng: number }) {
  const rad = Math.PI / 180;
  const dLat = (b.lat - a.lat) * rad, dLng = (b.lng - a.lng) * rad;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin(dLng / 2) ** 2;
  return 12742 * Math.asin(Math.sqrt(h));
}

/** Straight-line estimate: roads are ~35% longer than the crow flies; ~45 km/h average plus 4 minutes per leg. */
export function estimateMatrix(points: { lat: number; lng: number }[]): TravelMatrix {
  const distances = points.map((a) => points.map((b) => (a === b ? 0 : haversineKm(a, b) * 1.35 * 1000)));
  const durations = distances.map((row) => row.map((m) => (m === 0 ? 0 : (m / 1000 / 45) * 3600 + 240)));
  return { durations, distances, estimated: true };
}

const minutes = (hhmm: string) => { const [h, m] = hhmm.split(":").map(Number); return h * 60 + m; };
// Rounded first, so 599.7 minutes reads "10:00" and never "09:60".
const clock = (total: number) => { const t = Math.round(total); return `${String(Math.floor(t / 60) % 24).padStart(2, "0")}:${String(t % 60).padStart(2, "0")}`; };

export function routeSwapDelta(from: Pick<RoutePlan, "returnAt">, to: Pick<RoutePlan, "returnAt">) {
  return Math.round(minutes(to.returnAt) - minutes(from.returnAt));
}

/**
 * Reorders the visits still to do from where the person is now, ending at the base, and gives them new times.
 * `matrix` covers [origin, ...stops, base]. Each stop keeps the visit length it had in the plan. Up to 7 stops
 * every order is tried; beyond that, nearest-next followed by 2-opt.
 */
export function replanFrom<T extends { arrival: string; departure: string }>(stops: T[], matrix: TravelMatrix, start: string) {
  const d = matrix.durations, end = stops.length + 1;
  const visit = stops.map((s) => Math.max(15, minutes(s.departure) - minutes(s.arrival)) * 60);
  const cost = (order: number[]) => order.reduce((total, node, i) => total + d[i ? order[i - 1] : 0][node], 0) + d[order.at(-1) ?? 0][end];
  const nodes = stops.map((_, i) => i + 1);
  let best = nodes;
  if (nodes.length <= 7) {
    const permute = (rest: number[], prefix: number[]): void => {
      if (!rest.length) { if (cost(prefix) < cost(best)) best = prefix; return; }
      rest.forEach((node, i) => permute([...rest.slice(0, i), ...rest.slice(i + 1)], [...prefix, node]));
    };
    permute(nodes, []);
  } else {
    const left = new Set(nodes);
    best = [];
    for (let at = 0; left.size;) {
      const next = [...left].reduce((a, b) => (d[at][a] <= d[at][b] ? a : b));
      best.push(next); left.delete(next); at = next;
    }
    for (let improved = true; improved;) {
      improved = false;
      for (let i = 0; i < best.length - 1; i++)
        for (let k = i + 1; k < best.length; k++) {
          const candidate = [...best.slice(0, i), ...best.slice(i, k + 1).reverse(), ...best.slice(k + 1)];
          if (cost(candidate) < cost(best) - 1) { best = candidate; improved = true; }
        }
    }
  }
  let now = minutes(start) * 60, at = 0;
  const ordered = best.map((node) => {
    now += d[at][node];
    const arrival = clock(now / 60);
    now += visit[node - 1];
    at = node;
    return { ...stops[node - 1], arrival, departure: clock(now / 60) };
  });
  return { stops: ordered, returnAt: clock((now + d[at][end]) / 60) };
}

/**
 * Chooses and orders the visits. `matrix` covers [base, ...candidates] (base is index 0 and the return point).
 * Candidates are added one at a time where they cost the least extra time, preferring the highest score per
 * minute, while the day (minus lunch) still fits; then the order is improved with 2-opt.
 */
export function planRoute(candidates: RouteCandidate[], matrix: TravelMatrix, request: RouteRequest, forced: string[] = []): RoutePlan {
  const visit = request.visitMinutes * 60;
  // Lunch only matters when the day starts before it; an afternoon round has no lunch break.
  const lunchSeconds = request.lunch && minutes(request.start) < 13 * 60 ? 60 * 60 : 0;
  const budget = (minutes(request.end) - minutes(request.start)) * 60 - lunchSeconds;
  const d = matrix.durations;
  const cost = (order: number[]) => {
    let total = 0;
    for (let i = 0; i < order.length - 1; i++) total += d[order[i]][order[i + 1]];
    return total + (order.length - 2) * visit;
  };
  let route = [0, 0];
  const remaining = new Set(candidates.map((_, i) => i + 1));
  const insert = (pool: number[], respectBudget: boolean, byValue: boolean) => {
    let best: { node: number; at: number; ratio: number; added: number } | null = null;
    for (const node of pool) {
      for (let at = 1; at < route.length; at++) {
        const added = d[route[at - 1]][node] + d[node][route[at]] - d[route[at - 1]][route[at]] + visit;
        if (respectBudget && cost(route) + added > budget) continue;
        const ratio = byValue ? candidates[node - 1].score / (added / 60) : -added;
        if (!best || ratio > best.ratio || (ratio === best.ratio && added < best.added)) best = { node, at, ratio, added };
      }
    }
    if (!best) return false;
    route.splice(best.at, 0, best.node);
    remaining.delete(best.node);
    return true;
  };
  // Companies the user chose always go in, wherever they cost the least.
  const chosen = forced.map((id) => candidates.findIndex((c) => c.id === id) + 1).filter((n) => n > 0);
  while (chosen.some((n) => remaining.has(n))) insert(chosen.filter((n) => remaining.has(n)), false, false);
  const target = Math.max(request.count, route.length - 2);
  // Fill within the day first; if the day is too short, still reach the requested number (overtime is reported).
  while (route.length - 2 < target && remaining.size && insert([...remaining], true, true));
  while (route.length - 2 < target && remaining.size && insert([...remaining], false, true));
  // 2-opt: reverse segments while it shortens the route (endpoints stay at the base).
  for (let improved = true; improved;) {
    improved = false;
    for (let i = 1; i < route.length - 2; i++) {
      for (let k = i + 1; k < route.length - 1; k++) {
        const candidate = [...route.slice(0, i), ...route.slice(i, k + 1).reverse(), ...route.slice(k + 1)];
        if (cost(candidate) < cost(route) - 1) { route = candidate; improved = true; }
      }
    }
  }
  // Timetable, with lunch taken at the first stop that would start after 12:30.
  let now = minutes(request.start) * 60;
  let lunchAt: string | undefined;
  let driveSeconds = 0, metres = 0;
  const stops: RouteStop[] = [];
  for (let i = 1; i < route.length - 1; i++) {
    const leg = d[route[i - 1]][route[i]];
    driveSeconds += leg;
    metres += matrix.distances[route[i - 1]][route[i]];
    now += leg;
    if (lunchSeconds && !lunchAt && now >= 12.5 * 3600) { lunchAt = clock(now / 60); now += lunchSeconds; }
    const arrival = now;
    now += visit;
    stops.push({ ...candidates[route[i] - 1], arrival: clock(arrival / 60), departure: clock(now / 60), driveMinutes: Math.round(leg / 60), km: Math.round(matrix.distances[route[i - 1]][route[i]] / 100) / 10 });
  }
  const back = d[route[route.length - 2]][0];
  driveSeconds += back;
  metres += matrix.distances[route[route.length - 2]][0];
  now += back;
  return { stops, returnAt: clock(now / 60), driveMinutes: Math.round(driveSeconds / 60), km: Math.round(metres / 1000), estimated: matrix.estimated, lunchAt, left: remaining.size, overtime: Math.max(0, Math.round(now / 60 - minutes(request.end))) };
}

/** Google Maps directions for the phone. The URL API accepts up to 9 waypoints between origin and destination. */
export function googleMapsLink(base: { lat: number; lng: number }, stops: { lat: number; lng: number }[]) {
  const point = (p: { lat: number; lng: number }) => `${p.lat},${p.lng}`;
  const params = new URLSearchParams({ api: "1", origin: point(base), destination: point(base), travelmode: "driving" });
  if (stops.length) params.set("waypoints", stops.slice(0, 9).map(point).join("|"));
  return `https://www.google.com/maps/dir/?${params}`;
}
