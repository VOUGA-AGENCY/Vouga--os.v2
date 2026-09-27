import { describe, it, expect, vi } from "vitest";
import { createSeed } from "@/persistence/seed";
import { SupabaseWorkspaceRepository } from "@/persistence/supabase/repository";
import { rows, delta } from "@/persistence/supabase/collections";
const seed=createSeed("test-password-1234","2026-09-27T10:00:00Z");
const response=(data:unknown,status=200)=>new Response(JSON.stringify(data),{status});
const options=(fetcher:ReturnType<typeof vi.fn>)=>({url:"https://test.supabase.co",secret:"sb_secret_test",fetch:fetcher as unknown as typeof fetch});
describe("Supabase persistence",()=>{
 it("stores each entity separately and computes only changed rows",()=>{
  const next=structuredClone(seed);next.tasks[0].title="Changed";
  const diff=delta(seed,next);expect(diff.upserts).toHaveLength(1);expect(diff.deletes).toHaveLength(0);
  expect(diff.upserts[0].collection).toBe("tasks");
  next.tasks.pop();expect(delta(seed,next).deletes).toHaveLength(1);
 });
 it("retries a confirmed revision conflict against fresh data",async()=>{
  const fresh=structuredClone(seed);fresh.revision++;fresh.tasks[1].title="Other person's change";
  const fetcher=vi.fn().mockResolvedValueOnce(response(seed)).mockResolvedValueOnce(response({status:"conflict",revision:fresh.revision})).mockResolvedValueOnce(response(fresh)).mockResolvedValueOnce(response({status:"ok",revision:fresh.revision+1}));
  const repo=new SupabaseWorkspaceRepository(options(fetcher));
  await repo.transact(s=>{s.tasks[0].title="Mine";});
  const last=JSON.parse(fetcher.mock.calls[3][1].body);
  expect(last.p_expected_revision).toBe(fresh.revision);
  expect(last.p_upserts).toHaveLength(1);expect(last.p_upserts[0].data.title).toBe("Mine");
 });
 it("retries a lost response with the same mutation ID and bytes",async()=>{
  const fetcher=vi.fn().mockResolvedValueOnce(response(seed)).mockRejectedValueOnce(new Error("connection lost")).mockResolvedValueOnce(response({status:"ok",revision:seed.revision+1}));
  await new SupabaseWorkspaceRepository(options(fetcher)).transact(s=>{s.tasks[0].title="One change";});
  expect(fetcher.mock.calls[1][1].body).toBe(fetcher.mock.calls[2][1].body);
 });
 it("does not expose provider error bodies or fall back to local data",async()=>{
  const fetcher=vi.fn().mockResolvedValue(response({message:"secret-data"},401));
  await expect(new SupabaseWorkspaceRepository(options(fetcher)).read()).rejects.toThrow("recusou");
  expect(fetcher).toHaveBeenCalledTimes(1);
 });
 it("rejects public credentials and malformed store collections",()=>{
  expect(()=>new SupabaseWorkspaceRepository({...options(vi.fn()),secret:"sb_publishable_test"})).toThrow("secret key");
  const broken=structuredClone(seed);broken.contacts=undefined as never;expect(()=>rows(broken)).toThrow("contacts");
 });
 it("cannot replace an already initialized workspace",async()=>{
  const fetcher=vi.fn().mockResolvedValue(response({status:"conflict",revision:90}));
  await expect(new SupabaseWorkspaceRepository(options(fetcher)).initialize(seed)).rejects.toThrow("já tem dados");
 });
 it("keeps per-user receipts distinct",()=>{
  const data=structuredClone(seed);
  data.reminderReceipts=[{memberId:"miguel",key:"same",dismissed:false,snoozedUntil:null},{memberId:"afonso",key:"same",dismissed:false,snoozedUntil:null}];
  expect(rows(data).filter(r=>r.collection==="reminderReceipts").map(r=>r.key)).toHaveLength(2);
 });
});
