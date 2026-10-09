import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createSeed } from "@/persistence/seed";
import { executeCommand } from "@/application/commands";
import { convertProspect, openProspects, readProspect } from "@/application/prospects";
import { LocalProspectRepository } from "@/persistence/prospects";
import { workspaceFor } from "@/projections/workspace";
import { applySnapshotPatch, snapshotChanges } from "@/projections/changes";
import type { Member, Store } from "@/domain/model";
import type { Prospect } from "@/domain/prospects";

vi.mock("server-only", () => ({}));

const now = "2026-09-24T08:00:00.000Z";
const fixture = createSeed("test-only-password", now);
let data: Store;
let admin: Member;
let engineer: Member;
let other: Member;
beforeEach(() => {
  data = structuredClone(fixture);
  admin = data.members[0];
  engineer = data.members[2];
  other = data.members[3];
});
const run = (action: string, values: Record<string, unknown>, actor: Member = admin) => executeCommand(data, actor, { action, values }, now);
const stop = (values: Record<string, unknown> = {}) => ({ kind: "crm", id: "norte", name: "Norte Metal", location: "Maia", lat: 41.24, lng: -8.6, arrival: "09:30", departure: "10:00", reasons: ["Empresa New do CRM"], ...values });
const saveRoute = (actor: Member, values: Record<string, unknown> = {}) =>
  run("route.save", { name: "Rota · 8 out", date: "2026-10-08", stops: [stop(), stop({ kind: "prospect", id: "osm:1", name: "Prospeto Sem CRM" })], ...values }, actor).ids![0];

describe("shared routes", () => {
  it("are saved for the whole team, with the creator responsible by default", () => {
    const id = saveRoute(engineer);
    const route = workspaceFor(data, other, now).routes.find((r) => r.id === id);
    expect(route).toMatchObject({ ownerId: engineer.id, currentIndex: 0, visits: [] });
    expect(route?.stops[0].organizationId).toBe("norte");
  });
  it("rejects malformed stops", () => {
    expect(() => saveRoute(admin, { stops: [] })).toThrow("entre 1 e 12");
    expect(() => saveRoute(admin, { stops: [stop({ lat: "x" })] })).toThrow("Posição inválida");
    expect(() => saveRoute(admin, { stops: [stop({ arrival: "25:00" })] })).toThrow("Horário inválido");
    expect(() => saveRoute(admin, { date: "2026-02-30" })).toThrow("Invalid date");
  });
  it("lets only the responsible person or an admin register visits", () => {
    const id = saveRoute(engineer);
    const version = () => data.routes.find((r) => r.id === id)!.version;
    expect(() => run("route.visit", { id, version: version(), note: "Correu bem", stage: "meeting" }, other)).toThrow("You do not have access");
    run("route.visit", { id, version: version(), note: "Correu bem", stage: "meeting" }, engineer);
    expect(data.routes.find((r) => r.id === id)?.currentIndex).toBe(1);
  });
  it("records the visit, the company stage and the route progress in one step, with a single note", () => {
    const id = saveRoute(admin);
    const notes = data.interactions.length;
    run("route.visit", { id, version: 1, note: "Querem proposta", stage: "meeting" });
    const route = data.routes.find((r) => r.id === id)!;
    expect(data.interactions).toHaveLength(notes + 1);
    expect(data.interactions.at(-1)).toMatchObject({ organizationId: "norte", body: "Visita em rota: Querem proposta", stageFrom: "proposal", stageTo: "meeting" });
    expect(data.organizations.find((o) => o.id === "norte")?.stage).toBe("meeting");
    expect(route.visits[0]).toMatchObject({ stopId: "norte", organizationId: "norte", by: admin.id, stage: "meeting" });
  });
  it("keeps the stage without a stage-change entry when it does not change", () => {
    const id = saveRoute(admin);
    run("route.visit", { id, version: 1, note: "Sem novidades", stage: "proposal" });
    expect(data.interactions.at(-1)).not.toHaveProperty("stageTo");
  });
  it("refuses a visit to a prospect that is not a company yet, without moving the route", () => {
    const id = saveRoute(admin);
    run("route.visit", { id, version: 1, note: "Ok", stage: "meeting" });
    expect(() => run("route.visit", { id, version: 2, note: "Ok", stage: "contacted" })).toThrow("ainda não está no CRM");
    expect(data.routes.find((r) => r.id === id)?.currentIndex).toBe(1);
  });
  it("finds a scheduled prospect through its new CRM company, by name", () => {
    const id = saveRoute(admin);
    run("route.visit", { id, version: 1, note: "Ok", stage: "meeting" });
    run("organization.save", { name: "prospeto sem crm", stage: "new" });
    run("route.visit", { id, version: 2, note: "Primeira visita", stage: "contacted" });
    const route = data.routes.find((r) => r.id === id)!;
    expect(route.currentIndex).toBe(2);
    expect(route.stops[1].organizationId).toBe(data.organizations.find((o) => o.name === "prospeto sem crm")?.id);
  });
  // A saved or deleted route has to travel in the write response itself, or the list only catches up on a reload.
  it("reach the interface through the workspace patch, without a reload", () => {
    const before = structuredClone(workspaceFor(data, admin, now));
    const id = saveRoute(admin);
    data.revision++;
    const saved = applySnapshotPatch(before, snapshotChanges(before, workspaceFor(data, admin, now)));
    expect(saved.routes.map((route) => route.id)).toEqual([id]);
    run("route.delete", { id });
    data.revision++;
    expect(applySnapshotPatch(saved, snapshotChanges(saved, workspaceFor(data, admin, now))).routes).toEqual([]);
  });
  it("can be deleted by its people or an admin, not by anyone else", () => {
    const id = saveRoute(engineer);
    expect(() => run("route.delete", { id }, other)).toThrow("You do not have access");
    run("route.delete", { id }, engineer);
    expect(data.routes).toHaveLength(0);
  });
});

const prospect = (values: Partial<Prospect> = {}): Prospect =>
  ({ id: "osm:1", name: "Moldes do Lis", source: "osm", category: "moldes", group: "metal", address: "Rua 1", location: "Leiria", lat: 39.74, lng: -8.8, ...values });

describe("shared prospects", () => {
  it("are added by anyone with a position marked on the map", () => {
    const item = readProspect({ name: "Fábrica Nova", group: "metal", lat: 41.2, lng: -8.6, nif: "500 100 200" }, engineer, now);
    expect(item).toMatchObject({ source: "manual", editedBy: engineer.id, nif: "500100200", location: "Maia", check: { status: "verificado" } });
    expect(item.id).toMatch(/^manual:/);
    expect(() => readProspect({ name: "X", group: "metal", lat: 48.8, lng: 2.3 }, engineer, now)).toThrow("Portugal");
    expect(() => readProspect({ name: "X", group: "outro", lat: 41.2, lng: -8.6 }, engineer, now)).toThrow("Setor");
    expect(() => readProspect({ name: "X", group: "metal", lat: 41.2, lng: -8.6, nif: "123" }, engineer, now)).toThrow("9 dígitos");
  });
  it("keep their source and position check when corrected without moving", () => {
    const original = prospect({ check: { status: "provavel", evidence: ["OSM"] } });
    const corrected = readProspect({ name: "Moldes do Lis, S.A.", group: "metal", lat: original.lat, lng: original.lng }, other, now, original);
    expect(corrected).toMatchObject({ id: "osm:1", source: "osm", name: "Moldes do Lis, S.A.", editedBy: other.id, check: { status: "provavel" } });
  });
  it("leave the map once they are CRM companies", () => {
    expect(openProspects([prospect(), prospect({ id: "osm:2", organizationId: "x" }), prospect({ id: "osm:3", name: "Norte Metal" })], data).map((p) => p.id)).toEqual(["osm:1"]);
  });
  it("become a New company, or reuse the company that already has their name", () => {
    const created = convertProspect(data, admin, prospect());
    expect(data.organizations.find((o) => o.id === created)).toMatchObject({ name: "Moldes do Lis", stage: "new" });
    const count = data.organizations.length;
    expect(convertProspect(data, admin, prospect({ id: "osm:9", name: "NORTE METAL" }))).toBe("norte");
    expect(data.organizations).toHaveLength(count);
  });
});

describe("local prospect base", () => {
  let directory: string;
  beforeEach(async () => { directory = await mkdtemp(path.join(tmpdir(), "vouga-prospects-")); });
  afterEach(async () => { await rm(directory, { recursive: true, force: true }); });

  it("starts from the former data file and then keeps its own copy", async () => {
    const legacy = path.join(directory, "legacy.json");
    await writeFile(legacy, JSON.stringify({ items: [prospect()] }));
    const base = new LocalProspectRepository(path.join(directory, "data"), legacy);
    expect((await base.query({})).map((p) => p.id)).toEqual(["osm:1"]);
    await base.upsert([prospect({ id: "manual:1", lat: 41.2, lng: -8.6 })]);
    await rm(legacy);
    expect((await base.query({})).map((p) => p.id).sort()).toEqual(["manual:1", "osm:1"]);
  });
  it("answers by map area and by id, and removes", async () => {
    const base = new LocalProspectRepository(directory, path.join(directory, "none.json"));
    await Promise.all([base.upsert([prospect()]), base.upsert([prospect({ id: "porto", lat: 41.15, lng: -8.61 })])]);
    expect((await base.query({ area: { minLat: 41, maxLat: 41.3, minLng: -8.7, maxLng: -8.5 } })).map((p) => p.id)).toEqual(["porto"]);
    expect((await base.query({ ids: ["osm:1"] })).map((p) => p.id)).toEqual(["osm:1"]);
    expect(await base.remove(["osm:1"])).toBe(1);
    expect((await base.query({})).map((p) => p.id)).toEqual(["porto"]);
  });
});
