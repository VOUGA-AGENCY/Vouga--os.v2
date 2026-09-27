import "server-only";
import { mkdir, readFile, writeFile, rm } from "node:fs/promises";
import path from "node:path";
import { SupabaseClient, supabaseOptions } from "./supabase/client";
import { AppError } from "@/domain/validation";
const bucket = "vouga-next-attachments";
function validate(name: string) {
  if (!/^[a-f0-9-]{36}$/.test(name)) throw new AppError("Identificador de ficheiro inválido.",400);
}
export interface AttachmentStorage {
  put(name:string,bytes:Uint8Array,mime:string):Promise<void>;
  get(name:string):Promise<Uint8Array>;
  remove(name:string):Promise<void>;
}
export class SupabaseAttachmentStorage implements AttachmentStorage {
  constructor(private client = new SupabaseClient(supabaseOptions())) {}
  async put(name:string, bytes:Uint8Array, mime:string) {
    validate(name);
    const response=await this.client.request(`/storage/v1/object/${bucket}/${name}`, {method:"POST",headers:{"Content-Type":mime,"x-upsert":"false"},body:new Blob([Buffer.from(bytes)],{type:mime})});
    if (!response.ok) throw new AppError(`Não foi possível guardar o anexo no Supabase (${response.status}).`,503);
  }
  async get(name:string) {
    validate(name);
    const response=await this.client.request(`/storage/v1/object/authenticated/${bucket}/${name}`);
    if(!response.ok) throw new AppError("Anexo indisponível.",response.status===404?404:503);
    return new Uint8Array(await response.arrayBuffer());
  }
  async remove(name:string) {
    validate(name);
    const response=await this.client.request(`/storage/v1/object/${bucket}`,{method:"DELETE",headers:{"Content-Type":"application/json"},body:JSON.stringify({prefixes:[name]})});
    if(!response.ok) throw new AppError("Não foi possível remover o anexo.",503);
  }
}
export function attachmentStorage(): AttachmentStorage {
  if(process.env.VOUGA_STORAGE==="supabase") return new SupabaseAttachmentStorage();
  const directory=path.join(path.resolve(process.env.VOUGA_DATA_DIR||".local"),"uploads");
  return {
    async put(name,bytes) {validate(name);await mkdir(directory,{recursive:true,mode:0o700});await writeFile(path.join(directory,name),bytes,{mode:0o600,flag:"wx"});},
    async get(name) {validate(name);return readFile(path.join(directory,name));},
    async remove(name) {validate(name);await rm(path.join(directory,name),{force:true});},
  };
}
