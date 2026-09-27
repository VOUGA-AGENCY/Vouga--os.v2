import "server-only";
import { AppError } from "@/domain/validation";
export type SupabaseOptions = { url: string; secret: string; fetch?: typeof fetch };
export function supabaseOptions(env: Record<string,string|undefined> = process.env): SupabaseOptions {
  const url = env.NEXT_PUBLIC_SUPABASE_URL;
  const secret = env.SUPABASE_SECRET_KEY || env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !secret) throw new AppError("Configura NEXT_PUBLIC_SUPABASE_URL e SUPABASE_SECRET_KEY no servidor.",503);
  return {url,secret};
}
export class SupabaseClient {
  private origin: string;
  constructor(private options: SupabaseOptions) {
    const url = new URL(options.url);
    if (url.protocol !== "https:" || !url.hostname.endsWith(".supabase.co") || url.username || url.password || url.pathname !== "/") throw new AppError("URL Supabase inválida.",503);
    if (!options.secret || options.secret.startsWith("sb_publishable_")) throw new AppError("Usa uma secret key de servidor, não a publishable key.",503);
    this.origin = url.origin;
  }
  async request(path: string, options: RequestInit = {}): Promise<Response> {
    if (!path.startsWith("/") || path.startsWith("//")) throw new Error("Caminho Supabase inválido.");
    return (this.options.fetch || fetch)(`${this.origin}${path}`, {
      ...options, redirect: "error", cache:"no-store", signal: AbortSignal.timeout(25000),
      headers: {apikey:this.options.secret,
        ...(this.options.secret.startsWith("sb_secret_") ? {} : {Authorization:`Bearer ${this.options.secret}`}),
        ...options.headers},
    });
  }
  async rpc<T>(name: string, body: unknown): Promise<T> {
    if (!/^vouga_next_[a-z_]+$/.test(name)) throw new Error("Função Supabase inválida.");
    for (let attempt=0;attempt<2;attempt++) {
      let response: Response;
      try { response=await this.request(`/rest/v1/rpc/${name}`, {method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(body)}); }
      catch {
        if (!attempt) continue;
        throw new AppError("Supabase indisponível. A operação pode ter sido concluída; atualiza antes de repetir.",503);
      }
      if (response.ok) return await response.json() as T;
      if ([502,503,504].includes(response.status) && !attempt) continue;
      if (response.status === 404) throw new AppError("Executa o SQL de configuração vouga_next no Supabase antes de ativar a ligação.",503);
      if ([401,403].includes(response.status)) throw new AppError("Supabase recusou a chave de servidor ou as permissões da ligação.",503);
      // Never print database responses: they may contain credential-bearing rows.
      throw new AppError(`Operação Supabase recusada (HTTP ${response.status}).`,503);
    }
    throw new AppError("Supabase indisponível.",503);
  }
}
