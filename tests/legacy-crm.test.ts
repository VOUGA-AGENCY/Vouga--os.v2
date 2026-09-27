import { expect, it } from "vitest";
import { createSeed } from "@/persistence/seed";
import { importLegacyCrm, type LegacyExport } from "@/migrations/legacy-crm";
const store = createSeed("testing-password-123", "2026-09-27T10:00:00Z");
function fixture(): LegacyExport {
 const tables = {companies:[{id:"company-1",name:"Example real company",owner_member_id:"old-admin",prospecting_stage:"contacted",status:"active",created_at:"2026-01-01T10:00:00Z"}],contacts:[],contact_interactions:[],members:[],tasks:[],task_companies:[]};
 return {format:"vouga-legacy-export-v1",source:"legacy",exportedAt:"2026-09-27T10:00:00Z",tables,manifest:Object.fromEntries(Object.entries(tables).map(([k,v])=>[k,{count:v.length,complete:true}]))};
}
const options={actorId:"miguel",memberMap:{"old-admin":"miguel"}};
it("preserves dates, is idempotent and never mutates the original store",()=>{
 const first=importLegacyCrm(store,fixture(),options);
 expect(first.report.created.companies).toBe(1);
 expect(store.organizations).toHaveLength(3);
 expect(first.data.organizations.at(-1)?.createdAt).toBe("2026-01-01T10:00:00Z");
 const again=importLegacyCrm(first.data,fixture(),options);
 expect(again.report.created.companies).toBe(0);
 expect(again.data.interactions).toHaveLength(first.data.interactions.length);
});
it("does not silently merge names or assign unknown owners",()=>{
 const input=fixture();input.tables.companies[0].name=store.organizations[0].name;
 expect(importLegacyCrm(store,input,options).report.review).toHaveLength(1);
 expect(importLegacyCrm(store,fixture(),{...options,memberMap:{}}).report.review).toHaveLength(1);
});
it("rejects partial exports and leaves uncertain commercial stages for review",()=>{
 const input=fixture();input.manifest.contacts.complete=false;
 expect(()=>importLegacyCrm(store,input,options)).toThrow("incompleto");
 input.manifest.contacts.complete=true;input.tables.companies[0].prospecting_stage="strategic_partnership";
 expect(importLegacyCrm(store,input,options).report.review).toHaveLength(1);
});
