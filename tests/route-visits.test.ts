import { beforeEach, describe, expect, it } from "vitest";
import { createSeed } from "@/persistence/seed";
import { candidatesFor, readPlanInput, readScheduleInput, scheduleVisits } from "@/application/route-visits";
import type { Member, Store } from "@/domain/model";
import type { Prospect } from "@/domain/prospects";

const fixture = createSeed("test-only-password", "2026-09-24T08:00:00.000Z");
let data: Store;
let admin: Member;
beforeEach(() => {
  data = structuredClone(fixture);
  admin = data.members[0];
});

const prospect = (id: string, name: string, lat: number, lng: number, extra: Partial<Prospect> = {}): Prospect =>
  ({ id, name, source: "osm", category: "metal_construction", group: "metal", address: "Rua 1", location: "Maia", lat, lng, ...extra });
const near = prospect("osm:near", "Serralharia Perto", 41.2427, -8.5989);
const unconfirmed = prospect("osm:doubt", "Metais Duvidosos", 41.24, -8.6, { check: { status: "a-confirmar", evidence: [] } });
const far = prospect("osm:far", "Metalúrgica Longe", 40.2249, -8.4484);
const prospects = [near, unconfirmed, far];
const input = (values: Record<string, unknown> = {}) =>
  readPlanInput({ center: { lat: 41.1752, lng: -8.6059 }, date: "2030-10-08", radiusKm: 20, sectors: ["metal"], ...values });

describe("route candidates", () => {
  it("keeps prospects inside the area and leaves out the unconfirmed and distant ones", () => {
    const ids = candidatesFor(data, prospects, input()).candidates.map((c) => c.id);
    expect(ids).toContain("osm:near");
    expect(ids).not.toContain("osm:doubt");
    expect(ids).not.toContain("osm:far");
  });
  it("always includes a company picked on the map, even outside the area or the filters", () => {
    const { candidates } = candidatesFor(data, prospects, input({ include: ["osm:far", "osm:doubt", "norte"] }));
    for (const id of ["osm:far", "osm:doubt"]) expect(candidates.find((c) => c.id === id)?.reasons).toContain("Escolhida no mapa");
    // A CRM company without a recognised location cannot be placed, so it is not invented.
    expect(candidates.map((c) => c.id)).not.toContain("norte");
  });
  it("never includes a company the user took out", () => {
    const ids = candidatesFor(data, prospects, input({ include: ["osm:far"], exclude: ["osm:far", "osm:near"] })).candidates.map((c) => c.id);
    expect(ids).not.toContain("osm:far");
    expect(ids).not.toContain("osm:near");
  });
});

describe("scheduling a route", () => {
  const stop = (values: Record<string, unknown> = {}) => ({ kind: "prospect", id: "osm:near", name: "Serralharia Perto", arrival: "09:30", departure: "10:00", reasons: ["Prospeto · Metalomecânica"], ...values });
  const schedule = (values: Record<string, unknown> = {}) => readScheduleInput({ key: "plan-1", date: "2030-10-08", stops: [stop()], ...values });

  it("rejects malformed plans instead of failing later", () => {
    expect(() => schedule({ key: undefined })).toThrow("Identificador do pedido");
    expect(() => schedule({ date: "2030-02-30" })).toThrow("dia das visitas");
    expect(() => schedule({ stops: [stop({ arrival: "10:00", departure: "09:30" })] })).toThrow("Horário inválido");
    expect(() => schedule({ stops: [stop({ kind: "outro" })] })).toThrow("Tipo de visita");
    expect(() => schedule({ stops: [stop({ reasons: [42] })] })).toThrow("Motivo");
    expect(() => schedule({ stops: Array.from({ length: 13 }, () => stop()) })).toThrow("Máximo de 12");
  });
  it("creates the prospect as a New company and links the visit to that company", () => {
    const result = scheduleVisits(data, admin, prospects, schedule());
    const company = data.organizations.find((o) => o.name === "Serralharia Perto");
    expect(company?.stage).toBe("new");
    const meeting = data.meetings.find((m) => m.id === result.ids[0]);
    expect(meeting).toMatchObject({ organizationId: company?.id, calendarKey: "contacto", title: "Visita · Serralharia Perto" });
  });
  it("does not mark the same visits twice when the request is repeated", () => {
    scheduleVisits(data, admin, prospects, schedule());
    const counts = [data.organizations.length, data.meetings.length];
    expect(scheduleVisits(data, admin, prospects, schedule()).message).toBe("Estas visitas já estavam marcadas.");
    expect([data.organizations.length, data.meetings.length]).toEqual(counts);
  });
  it("visits an existing company with the prospect's name instead of failing on the duplicate", () => {
    const twin = prospect("osm:twin", "NORTE METAL", 41.2, -8.6);
    const before = data.organizations.length;
    const result = scheduleVisits(data, admin, [twin], schedule({ stops: [stop({ id: "osm:twin", name: "NORTE METAL" })] }));
    expect(data.organizations).toHaveLength(before);
    expect(data.meetings.find((m) => m.id === result.ids[0])?.organizationId).toBe("norte");
  });
});
