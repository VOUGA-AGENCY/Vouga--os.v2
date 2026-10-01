import { afterEach, describe, expect, it, vi } from "vitest";
import { estimateMatrix, googleMapsLink, haversineKm, planRoute, type RouteCandidate, type RouteRequest } from "@/domain/routing";

vi.mock("server-only", () => ({}));

const base = { lat: 41.1752, lng: -8.6059 };
const candidate = (id: string, lat: number, lng: number, score = 1): RouteCandidate => ({ kind: "prospect", id, name: id, location: "", lat, lng, score, reasons: [] });
const request: RouteRequest = { center: base, radiusKm: 30, count: 3, date: "2026-10-01", start: "09:00", end: "18:30", visitMinutes: 45, lunch: true };

describe("route planning", () => {
  it("estimates road distances from straight lines", () => {
    const km = haversineKm(base, { lat: 41.2427, lng: -8.5989 });
    expect(km).toBeGreaterThan(7);
    expect(km).toBeLessThan(8);
    const m = estimateMatrix([base, { lat: 41.2427, lng: -8.5989 }]);
    expect(m.estimated).toBe(true);
    expect(m.distances[0][1]).toBeCloseTo(km * 1.35 * 1000, 0);
  });

  it("respects the number of visits and prefers valuable companies", () => {
    const candidates = [
      candidate("maia", 41.2427, -8.5989, 1),
      candidate("trofa", 41.3029, -8.5657, 1),
      candidate("gaia", 41.0901, -8.4627, 1),
      candidate("favorita", 41.20, -8.60, 6),
      candidate("longe", 40.2249, -8.4484, 1),
    ];
    const plan = planRoute(candidates, estimateMatrix([base, ...candidates]), request);
    expect(plan.stops).toHaveLength(3);
    expect(plan.stops.map((s) => s.id)).toContain("favorita");
    expect(plan.stops.map((s) => s.id)).not.toContain("longe");
    expect(plan.estimated).toBe(true);
  });

  it("never plans beyond the working day and schedules lunch", () => {
    const far = Array.from({ length: 12 }, (_, i) => candidate(`c${i}`, 40.6 + i * 0.01, -8.6));
    const plan = planRoute(far, estimateMatrix([base, ...far]), { ...request, count: 12 });
    const [h, m] = plan.returnAt.split(":").map(Number);
    expect(h * 60 + m).toBeLessThanOrEqual(18 * 60 + 30);
    expect(plan.left).toBeGreaterThan(0);
    const times = plan.stops.map((s) => s.arrival);
    expect([...times].sort()).toEqual(times);
  });

  it("orders stops to avoid crossing back and forth", () => {
    // Four points on a line north of the base, given in a scrambled order.
    const line = [candidate("n3", 41.40, -8.60), candidate("n1", 41.22, -8.60), candidate("n4", 41.49, -8.60), candidate("n2", 41.31, -8.60)];
    const plan = planRoute(line, estimateMatrix([base, ...line]), { ...request, count: 4 });
    const ids = plan.stops.map((s) => s.id);
    expect(ids.join()).toMatch(/^(n1,n2,n3,n4|n4,n3,n2,n1)$/);
  });

  it("builds a Google Maps link with at most 9 waypoints", () => {
    const stops = Array.from({ length: 11 }, (_, i) => ({ lat: 41 + i / 100, lng: -8.6 }));
    const url = new URL(googleMapsLink(base, stops));
    expect(url.searchParams.get("origin")).toBe("41.1752,-8.6059");
    expect(url.searchParams.get("waypoints")!.split("|")).toHaveLength(9);
  });
});

describe("routing provider", () => {
  afterEach(() => { delete process.env.ORS_API_KEY; });

  it("uses road times from OpenRouteService when the key is set", async () => {
    process.env.ORS_API_KEY = "test-key";
    const { travelMatrix } = await import("@/services/routing-service");
    const fetcher = vi.fn(async () => new Response(JSON.stringify({ durations: [[0, 900], [880, 0]], distances: [[0, 12000], [11800, 0]] }), { status: 200 }));
    const matrix = await travelMatrix([base, { lat: 41.2427, lng: -8.5989 }], fetcher as unknown as typeof fetch);
    expect(matrix.estimated).toBe(false);
    expect(matrix.durations[0][1]).toBe(900);
    expect(fetcher).toHaveBeenCalledWith(expect.stringContaining("/matrix/driving-car"), expect.objectContaining({ headers: expect.objectContaining({ Authorization: "test-key" }) }));
  });

  it("falls back to estimates and explains a rejected key", async () => {
    process.env.ORS_API_KEY = "wrong-key";
    const { travelMatrix } = await import("@/services/routing-service");
    const fetcher = vi.fn(async () => new Response("{}", { status: 403 }));
    const matrix = await travelMatrix([base, { lat: 41.2427, lng: -8.5989 }], fetcher as unknown as typeof fetch);
    expect(matrix.estimated).toBe(true);
    expect(matrix.warning).toContain("recusou a chave");
  });

  it("does not call the provider without a key", async () => {
    const { travelMatrix } = await import("@/services/routing-service");
    const fetcher = vi.fn();
    const matrix = await travelMatrix([base, { lat: 41.2427, lng: -8.5989 }], fetcher as unknown as typeof fetch);
    expect(fetcher).not.toHaveBeenCalled();
    expect(matrix.estimated).toBe(true);
  });
});
