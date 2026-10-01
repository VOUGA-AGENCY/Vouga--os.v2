import "server-only";
import { estimateMatrix, type TravelMatrix } from "@/domain/routing";

// OpenRouteService (HeiGIT): road travel times and route geometry. The key stays on the server (ORS_API_KEY).
// Without a key, or if the provider fails, callers get the straight-line estimate and plans say so.
const base = "https://api.openrouteservice.org/v2";
type Point = { lat: number; lng: number };

export function routingConfigured(env = process.env) {
  return !!env.ORS_API_KEY?.trim();
}

async function ors<T>(path: string, body: unknown, fetcher: typeof fetch): Promise<T> {
  const response = await fetcher(`${base}${path}`, {
    method: "POST",
    headers: { Authorization: process.env.ORS_API_KEY!.trim(), "Content-Type": "application/json", Accept: "application/json, application/geo+json" },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(20_000),
  });
  if (response.status === 401 || response.status === 403)
    throw new Error("o OpenRouteService recusou a chave ORS_API_KEY (tem de ser uma chave do openrouteservice.org, não de outro serviço)");
  if (response.status === 429) throw new Error("limite diário do OpenRouteService atingido");
  if (!response.ok) throw new Error(`OpenRouteService respondeu ${response.status}`);
  return (await response.json()) as T;
}

/** Road travel matrix (seconds, metres) between the points; falls back to the estimate. */
export async function travelMatrix(points: Point[], fetcher: typeof fetch = fetch): Promise<TravelMatrix & { warning?: string }> {
  if (!routingConfigured()) return estimateMatrix(points);
  try {
    const result = await ors<{ durations: (number | null)[][]; distances: (number | null)[][] }>(
      "/matrix/driving-car",
      { locations: points.map((p) => [p.lng, p.lat]), metrics: ["duration", "distance"], units: "m" },
      fetcher,
    );
    const fallback = estimateMatrix(points);
    // Unreachable pairs come back as null; use the estimate for those cells.
    const fill = (m: (number | null)[][], f: number[][]) => m.map((row, i) => row.map((v, j) => (v ?? f[i][j])));
    return { durations: fill(result.durations, fallback.durations), distances: fill(result.distances, fallback.distances), estimated: false };
  } catch (error) {
    return { ...estimateMatrix(points), warning: `Tempos estimados: ${(error as Error).message}.` };
  }
}

/** Road geometry for the whole route ([lng, lat] pairs), or undefined when unavailable. */
export async function routeGeometry(points: Point[], fetcher: typeof fetch = fetch): Promise<[number, number][] | undefined> {
  if (!routingConfigured() || points.length < 2) return undefined;
  try {
    const result = await ors<{ features: { geometry: { coordinates: [number, number][] } }[] }>(
      "/directions/driving-car/geojson",
      { coordinates: points.map((p) => [p.lng, p.lat]) },
      fetcher,
    );
    return result.features[0]?.geometry.coordinates;
  } catch {
    return undefined;
  }
}
