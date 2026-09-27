import { mkdir, readFile, writeFile } from "node:fs/promises";
import { createHash, randomUUID } from "node:crypto";
import path from "node:path";
import { LocalWorkspaceRepository } from "../src/persistence/store";
import { SupabaseWorkspaceRepository } from "../src/persistence/supabase/repository";
import { supabaseOptions } from "../src/persistence/supabase/client";
import { SupabaseAttachmentStorage } from "../src/persistence/attachment-storage";
import { rows } from "../src/persistence/supabase/collections";
const directory=path.resolve(process.env.VOUGA_DATA_DIR||".local");
const local=new LocalWorkspaceRepository(directory,()=>{throw new Error("O workspace local não existe. Não se criam dados demo numa migração.");});
const data=await local.read();
const fingerprint=(value:unknown)=>createHash("sha256").update(JSON.stringify(value)).digest("hex");
const summary={revision:data.revision,companies:data.organizations.length,contacts:data.contacts.length,interactions:data.interactions.length,tasks:data.tasks.length,attachments:data.taskAttachments.length,records:rows(data).length};
console.log(JSON.stringify(summary,null,2));
if(!process.argv.includes("--apply")) {console.log("Pré-visualização; nenhum dado remoto alterado. Parar servidor e worker antes de --apply.");process.exit(0);}
const backupDir=path.join(directory,"backups");await mkdir(backupDir,{recursive:true,mode:0o700});
await writeFile(path.join(backupDir,`before-supabase-${Date.now()}.json`),JSON.stringify(data,null,2),{mode:0o600,flag:"wx"});
const remote=new SupabaseWorkspaceRepository(supabaseOptions());
const receiptPath=path.join(directory,"supabase-migration.json");
let receipt:{mutationId:string;fingerprint:string};
try{receipt=JSON.parse(await readFile(receiptPath,"utf8"));if(receipt.fingerprint!==fingerprint(data))throw new Error("O workspace mudou desde a tentativa anterior; reconciliar antes de repetir.");}
catch(error){if((error as NodeJS.ErrnoException).code!=="ENOENT")throw error;receipt={mutationId:randomUUID(),fingerprint:fingerprint(data)};await writeFile(receiptPath,JSON.stringify(receipt),{mode:0o600,flag:"wx"});}
const storage=new SupabaseAttachmentStorage();
for(const attachment of data.taskAttachments){
 const bytes=await readFile(path.join(directory,"uploads",attachment.storageName));
 if(bytes.length!==attachment.size)throw new Error("Anexo local com tamanho inválido.");
 try{await storage.put(attachment.storageName,bytes,attachment.mimeType);}catch{
  const existing=await storage.get(attachment.storageName);
  if(fingerprint(Array.from(existing))!==fingerprint(Array.from(bytes)))throw new Error("Anexo remoto diferente; migração interrompida.");
 }
}
if((await local.read()).revision!==data.revision)throw new Error("Workspace em uso. Parar aplicação e worker antes de migrar.");
const revision=await remote.initialize(data,receipt.mutationId);
const confirmed=await remote.read();
if(fingerprint({...confirmed,revision:data.revision})!==fingerprint(data)){
 // Property order from JSONB differs; compare every logical row after sorting.
 // Deep equality below handles nested JSONB object ordering as well.
 const normalize=(v:unknown):unknown=>Array.isArray(v)?v.map(normalize):v&&typeof v==="object"?Object.fromEntries(Object.entries(v).sort(([a],[b])=>a.localeCompare(b)).map(([k,x])=>[k,normalize(x)])):v;
 if(JSON.stringify(normalize({...confirmed,revision:data.revision}))!==JSON.stringify(normalize(data)))throw new Error("A verificação remota não coincide. Não ativar o backend remoto.");
}
console.log(`Dados e anexos verificados no Supabase (revisão ${revision}). Define VOUGA_STORAGE=supabase e reinicia aplicação e worker. O backup local foi preservado.`);
