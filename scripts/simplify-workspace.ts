import { mkdir, writeFile } from "node:fs/promises";
import { runtime } from "../src/services/runtime";
import { simplifyWorkspace } from "../src/migrations/workspace-simplification";
const ctx=runtime(), data=await ctx.repo.read();
const preview=simplifyWorkspace(structuredClone(data),ctx.now());
console.log(JSON.stringify({mode:process.argv.includes("--apply")?"apply":"preview",...preview}));
if(process.argv.includes("--apply")) {
  await mkdir(".local/backups",{recursive:true,mode:0o700});
  await writeFile(`.local/backups/before-simplification-${Date.now()}.json`,JSON.stringify(data),{mode:0o600,flag:"wx"});
  console.log(JSON.stringify(await ctx.repo.transact(store=>simplifyWorkspace(store,ctx.now()))));
}
