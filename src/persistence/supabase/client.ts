import "server-only";
import { AppError } from "@/domain/validation";
export type SupabaseOptions = { url: string; secret: string; fetch?: typeof fetch };
export function supabaseOptions(env: Record<string,string|undefined> = process.env): SupabaseOptions {
  const url = env.NEXT_PUBLIC_SUPABASE_URL;
  const secret = env.SUPABASE_SECRET_KEY || env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !secret) throw new AppError("Configure NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SECRET_KEY on the server.",503);
  return {url,secret};
}
export class SupabaseClient {
  private origin: string;
  constructor(private options: SupabaseOptions) {
    const url = new URL(options.url);
    if (url.protocol !== "https:" || !url.hostname.endsWith(".supabase.co") || url.username || url.password || url.pathname !== "/") throw new AppError("Invalid Supabase URL.",503);
    if (!options.secret || options.secret.startsWith("sb_publishable_")) throw new AppError("Use a server secret key, not a publishable key.",503);
    this.origin = url.origin;
  }
  async request(path: string, options: RequestInit = {}): Promise<Response> {
    if (!path.startsWith("/") || path.startsWith("//")) throw new Error("Invalid Supabase path.");
    return (this.options.fetch || fetch)(`${this.origin}${path}`, {
      ...options, redirect: "error", cache:"no-store", signal: AbortSignal.timeout(25000),
      headers: {apikey:this.options.secret,
        ...(this.options.secret.startsWith("sb_secret_") ? {} : {Authorization:`Bearer ${this.options.secret}`}),
        ...options.headers},
    });
  }
  async rpc<T>(name: string, body: unknown): Promise<T> {
    if (!/^vouga_next_[a-z_]+$/.test(name)) throw new Error("Invalid Supabase function.");
    for (let attempt=0;attempt<2;attempt++) {
      let response: Response;
      try { response=await this.request(`/rest/v1/rpc/${name}`, {method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(body)}); }
      catch {
        if (!attempt) continue;
        throw new AppError("Supabase unavailable. The operation may have completed; refresh before trying again.",503);
      }
      if (response.ok) return await response.json() as T;
      if ([502,503,504].includes(response.status) && !attempt) continue;
      if (response.status === 404) throw new AppError("Run the vouga_next setup SQL in Supabase before enabling the connection.",503);
      if ([401,403].includes(response.status)) throw new AppError("Supabase rejected the server key or connection permissions.",503);
      // Never print database responses: they may contain credential-bearing rows.
      throw new AppError(`Supabase operation rejected (HTTP ${response.status}).`,503);
    }
    throw new AppError("Supabase unavailable.",503);
  }
}
