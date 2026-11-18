import "server-only";
import { mkdir, readFile, writeFile, rm } from "node:fs/promises";
import path from "node:path";
import { SupabaseClient, supabaseOptions } from "./supabase/client";
import { AppError } from "@/domain/validation";
const bucket = "vouga-next-attachments";
function validate(name: string) {
  if (!/^[a-f0-9-]{36}$/.test(name)) throw new AppError("Invalid file identifier.",400);
}
export interface AttachmentStorage {
  put(name:string,bytes:Uint8Array,mime:string):Promise<void>;
  get(name:string):Promise<Uint8Array>;
  remove(name:string):Promise<void>;
}
export class SupabaseAttachmentStorage implements AttachmentStorage {
  constructor(private client = new SupabaseClient(supabaseOptions())) {}
  async signedUrl(name: string, upload: boolean, downloadName?: string) {
    validate(name);
    const route = upload ? "upload/sign" : "sign";
    const response = await this.client.request(`/storage/v1/object/${route}/${bucket}/${name}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(upload ? {} : { expiresIn: 300 }),
    });
    if (!response.ok) throw new AppError("Could not authorize file transfer.", 503);
    const result = await response.json();
    const base = new URL("/storage/v1/", supabaseOptions().url);
    const path = upload ? result.url : result.signedURL;
    if (typeof path !== "string") throw new AppError("Invalid file transfer URL.", 503);
    const url = new URL(path.startsWith("/storage/v1/") ? path : path.replace(/^\//, ""), base);
    if (base.origin !== url.origin || !url.pathname.startsWith(base.pathname))
      throw new AppError("Invalid file transfer URL.", 503);
    if (downloadName) url.searchParams.set("download", downloadName);
    return url.href;
  }
  async put(name:string, bytes:Uint8Array, mime:string) {
    validate(name);
    const response=await this.client.request(`/storage/v1/object/${bucket}/${name}`, {method:"POST",headers:{"Content-Type":mime,"x-upsert":"false"},body:new Blob([Buffer.from(bytes)],{type:mime})});
    if (!response.ok) throw new AppError(`Could not save the attachment to Supabase (${response.status}).`,503);
  }
  async get(name:string, expectedMime?: string) {
    validate(name);
    const response=await this.client.request(`/storage/v1/object/authenticated/${bucket}/${name}`);
    if(!response.ok) throw new AppError("Attachment unavailable.",response.status===404?404:503);
    if (expectedMime && response.headers.get("content-type")?.split(";")[0] !== expectedMime)
      throw new AppError("Invalid attachment type.");
    return new Uint8Array(await response.arrayBuffer());
  }
  async remove(name:string) {
    validate(name);
    const response=await this.client.request(`/storage/v1/object/${bucket}`,{method:"DELETE",headers:{"Content-Type":"application/json"},body:JSON.stringify({prefixes:[name]})});
    if(!response.ok) throw new AppError("Could not remove the attachment.",503);
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
