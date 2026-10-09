import { beforeEach, describe, expect, it, vi } from "vitest";
import { createSeed } from "@/persistence/seed";
import { executeCommand } from "@/application/commands";
import { openProspects, readDiscard } from "@/application/prospects";
import { estimateMatrix, replanFrom } from "@/domain/routing";
import { executeAgentTool } from "@/services/agent-service";
import { meetingReminders } from "@/services/telegram-service";
import type { ServiceContext } from "@/services/runtime";
import type { Member, Store } from "@/domain/model";
import type { Prospect } from "@/domain/prospects";

vi.mock("server-only", () => ({}));

const now = "2026-09-26T07:00:00.000Z";
const fixture = createSeed("test-only-password", now);
let data: Store;
let admin: Member;
let engineer: Member;
let ctx: ServiceContext;
beforeEach(() => {
  data = structuredClone(fixture);
  admin = data.members[0];
  engineer = data.members[2];
  ctx = {
    repo: {
      read: async () => structuredClone(data),
      transact: async (fn) => { const clone = structuredClone(data); const result = fn(clone); clone.revision++; data = clone; return result; },
    },
    fetch: vi.fn() as unknown as typeof fetch,
    now: () => now,
    env: {},
  };
});
const run = (action: string, values: Record<string, unknown>, actor: Member = admin) => executeCommand(data, actor, { action, values }, now);
const stop = (id: string, lat: number, arrival: string, departure: string) => ({ kind: "crm", id, name: id, location: "", lat, lng: -8.6, arrival, departure, reasons: [] });
const route = (actor: Member = admin) => run("route.save", {
  name: "Rota · 26 set", date: "2026-09-26",
  stops: [stop("norte", 41.3, "09:30", "10:00"), stop("vale", 41.4, "10:30", "11:00"), stop("atlas", 41.5, "11:30", "12:00")],
}, actor).ids![0];
const current = (id: string) => data.routes.find((r) => r.id === id)!;

describe("registering a visit", () => {
  it("updates the next step and follow-up only when they are filled in", () => {
    const id = route();
    const before = structuredClone(data.organizations.find((o) => o.id === "norte")!);
    run("route.visit", { id, version: 1, note: "Ok", stage: "meeting" });
    expect(data.organizations.find((o) => o.id === "norte")).toMatchObject({ nextStep: before.nextStep, followUpOn: before.followUpOn });
    run("route.visit", { id, version: 2, note: "Querem proposta", stage: "proposal", nextStep: "Enviar proposta", followUpOn: "2026-10-02" });
    expect(data.organizations.find((o) => o.id === "vale")).toMatchObject({ nextStep: "Enviar proposta", followUpOn: "2026-10-02" });
    expect(() => run("route.visit", { id, version: 3, note: "x", stage: "meeting", followUpOn: "2026-02-30" })).toThrow("Invalid date");
  });
  it("can skip a visit without touching the CRM", () => {
    const id = route();
    const notes = data.interactions.length;
    run("route.skip", { id, version: 1, note: "Fechado" });
    expect(current(id)).toMatchObject({ currentIndex: 1, visits: [{ stopId: "norte", skipped: true, note: "Fechado" }] });
    expect(data.interactions).toHaveLength(notes);
    expect(() => run("route.skip", { id, version: 2 }, data.members[3])).toThrow("You do not have access");
  });
});

describe("replanning during the day", () => {
  it("only accepts the same visits that are still to do, and keeps the ones done", () => {
    const id = route();
    run("route.visit", { id, version: 1, note: "Ok", stage: "meeting" });
    expect(() => run("route.replan", { id, version: 2, stops: [{ id: "atlas", arrival: "14:00", departure: "14:30" }] })).toThrow("mesmas visitas");
    expect(() => run("route.replan", { id, version: 2, stops: [{ id: "atlas", arrival: "14:00", departure: "14:30" }, { id: "norte", arrival: "15:00", departure: "15:30" }] })).toThrow("mesmas visitas");
    run("route.replan", { id, version: 2, stops: [{ id: "atlas", arrival: "14:00", departure: "14:30" }, { id: "vale", arrival: "15:00", departure: "15:30" }] });
    expect(current(id).stops.map((s) => `${s.id} ${s.arrival}`)).toEqual(["norte 09:30", "atlas 14:00", "vale 15:00"]);
  });
  it("adds a company during the day to the visits still to do, once", () => {
    const id = route();
    run("route.visit", { id, version: 1, note: "Saímos mais cedo", stage: "meeting" });
    const added = { kind: "prospect", id: "osm:extra", name: "Moldes Extra", location: "Maia", lat: 41.25, lng: -8.62, arrival: "11:00", departure: "11:30", reasons: ["Acrescentada durante a rota"] };
    // The new plan must include the added company together with the remaining ones.
    expect(() => run("route.replan", { id, version: 2, add: added, stops: [{ id: "vale", arrival: "11:00", departure: "11:30" }, { id: "atlas", arrival: "12:00", departure: "12:30" }] })).toThrow("mesmas visitas");
    run("route.replan", { id, version: 2, add: added, stops: [
      { id: "osm:extra", arrival: "10:40", departure: "11:10" }, { id: "vale", arrival: "11:30", departure: "12:00" }, { id: "atlas", arrival: "12:20", departure: "12:50" },
    ] });
    expect(current(id).stops.map((s) => s.id)).toEqual(["norte", "osm:extra", "vale", "atlas"]);
    expect(current(id).currentIndex).toBe(1);
    expect(() => run("route.replan", { id, version: 3, add: { ...added, id: "vale", kind: "crm" }, stops: [] })).toThrow("já está nesta rota");
    expect(() => run("route.replan", { id, version: 3, add: added, stops: [] })).toThrow("já está nesta rota");
  });
  it("orders the remaining visits from where the person is and keeps each visit's length", () => {
    // From the north, heading back south to the base: the northern stop first.
    const stops = [{ id: "sul", lat: 41.2, lng: -8.6, arrival: "10:00", departure: "10:30" }, { id: "norte", lat: 41.6, lng: -8.6, arrival: "11:00", departure: "11:45" }];
    const origin = { lat: 41.7, lng: -8.6 }, base = { lat: 41.1, lng: -8.6 };
    const plan = replanFrom(stops, estimateMatrix([origin, ...stops, base]), "14:00");
    expect(plan.stops.map((s) => s.id)).toEqual(["norte", "sul"]);
    const [first, second] = plan.stops;
    const length = (s: { arrival: string; departure: string }) => { const m = (t: string) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3)); return m(s.departure) - m(s.arrival); };
    expect([length(first), length(second)]).toEqual([45, 30]);
    expect(first.arrival > "14:00").toBe(true);
    for (const time of [first.arrival, first.departure, second.arrival, plan.returnAt]) expect(time).toMatch(/^([01]\d|2[0-3]):[0-5]\d$/);
  });
});

describe("routes in the Agent and Telegram", () => {
  it("reads the next visit and registers it through the same command", async () => {
    const id = route(engineer);
    const routes = (await executeAgentTool(ctx, engineer, "getRoutes", { mine: true })) as { id: string; nextVisit: { name: string }; progress: string }[];
    expect(routes).toEqual([expect.objectContaining({ id, progress: "0/3", nextVisit: expect.objectContaining({ name: "norte" }) })]);
    await executeAgentTool(ctx, engineer, "registerRouteVisit", { id, note: "Correu bem", stage: "meeting", followUpOn: "2026-10-01" });
    expect(current(id).currentIndex).toBe(1);
    await expect(executeAgentTool(ctx, data.members[3], "registerRouteVisit", { id, note: "x", stage: "meeting" })).rejects.toThrow("You do not have access");
  });
  it("adds today's route to the 08:00 summary of its responsible person, even without meetings", () => {
    route(engineer);
    data.meetings = [];
    engineer.telegramChatId = "9";
    data.members.find((m) => m.id === engineer.id)!.telegramChatId = "9";
    const jobs = meetingReminders(data, now);
    expect(jobs).toHaveLength(1);
    expect(jobs[0]).toMatchObject({ memberId: engineer.id });
    expect(jobs[0].text).toContain("Rota · 26 set · 3 visitas");
    expect(jobs[0].text).toContain("09:30 · norte");
  });
});

describe("discarded prospects", () => {
  const prospect = (values: Partial<Prospect>): Prospect => ({ id: "p", name: "Empresa", source: "csv", category: "", group: "metal", address: "", location: "Maia", lat: 41.2, lng: -8.6, ...values });
  it("need a known reason and leave the open list until restored", () => {
    const discarded = readDiscard({ reason: "pequena", note: " 3 pessoas " }, admin, now);
    expect(discarded).toEqual({ reason: "pequena", note: "3 pessoas", by: admin.id, at: now });
    expect(() => readDiscard({ reason: "porque-sim" }, admin, now)).toThrow("Motivo");
    const items = [prospect({ id: "a" }), prospect({ id: "b", name: "Outra", discarded })];
    expect(openProspects(items, data).map((p) => p.id)).toEqual(["a"]);
    expect(openProspects(items, data, true).map((p) => p.id)).toEqual(["b"]);
  });
});
