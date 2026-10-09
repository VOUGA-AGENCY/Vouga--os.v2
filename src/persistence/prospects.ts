import "server-only";
import { mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import type { Prospect } from "@/domain/prospects";
import { AppError } from "@/domain/validation";
import { SupabaseClient, supabaseOptions, type SupabaseOptions } from "./supabase/client";

export type Area = { minLat: number; maxLat: number; minLng: number; maxLng: number };
export type ProspectQuery = { area?: Area; ids?: string[]; limit?: number };

/**
 * The shared prospect base. It lives outside the workspace store on purpose: the store is read whole on
 * every request, while prospects are many and are always read by area (the map) or by id (routes).
 */
export interface ProspectRepository {
  query(query: ProspectQuery): Promise<Prospect[]>;
  upsert(items: Prospect[]): Promise<number>;
  remove(ids: string[]): Promise<number>;
  /** True after a read came from the former data/prospects.json because the shared base is not set up yet. */
  readonly usingFallback?: boolean;
}

/** The shared base's SQL has not been run in Supabase yet. */
export class ProspectBaseInactive extends AppError {
  constructor() {
    super("A base de prospeção partilhada ainda não está ativa: quem gere o Supabase tem de executar supabase/migrations/20261007_routes_prospects.sql; depois corre bun run prospects:migrate --apply.", 503);
  }
}

const inArea = (area: Area | undefined, p: Prospect) =>
  !area || (p.lat >= area.minLat && p.lat <= area.maxLat && p.lng >= area.minLng && p.lng <= area.maxLng);

/** Local edition: one JSON file in the data folder, seeded once from the former data/prospects.json. */
export class LocalProspectRepository implements ProspectRepository {
  // Writes are read-modify-write of one file: run them one at a time within this process.
  private static writes: Promise<unknown> = Promise.resolve();
  constructor(private directory: string, private legacy = path.resolve("data", "prospects.json")) {}
  private serial<T>(fn: () => Promise<T>): Promise<T> {
    const next = LocalProspectRepository.writes.then(fn, fn);
    LocalProspectRepository.writes = next.catch(() => undefined);
    return next;
  }
  private get file() {
    return path.join(this.directory, "prospects.json");
  }
  private async load(): Promise<Prospect[]> {
    for (const file of [this.file, this.legacy]) {
      try {
        return (JSON.parse(await readFile(file, "utf8")) as { items?: Prospect[] }).items ?? [];
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
      }
    }
    return [];
  }
  private async save(items: Prospect[]) {
    await mkdir(this.directory, { recursive: true, mode: 0o700 });
    const temporary = `${this.file}.${randomUUID()}.tmp`;
    try {
      await writeFile(temporary, JSON.stringify({ updatedAt: new Date().toISOString(), items }), { mode: 0o600, flag: "wx" });
      await rename(temporary, this.file);
    } finally {
      await rm(temporary, { force: true });
    }
  }
  async query({ area, ids, limit = 5000 }: ProspectQuery) {
    const items = await this.load();
    return items.filter((p) => (!ids || ids.includes(p.id)) && inArea(area, p)).slice(0, limit);
  }
  upsert(changes: Prospect[]) {
    return this.serial(async () => {
      const byId = new Map((await this.load()).map((p) => [p.id, p]));
      for (const item of changes) byId.set(item.id, item);
      await this.save([...byId.values()]);
      return changes.length;
    });
  }
  remove(ids: string[]) {
    return this.serial(async () => {
      const items = await this.load();
      const kept = items.filter((p) => !ids.includes(p.id));
      await this.save(kept);
      return items.length - kept.length;
    });
  }
}

/**
 * The whole prospect base kept in this process's memory. Every map move asks for its area; without this each
 * one was a Supabase read (up to MBs of egress). The base is downloaded at most every 5 minutes and this
 * process's own writes update it at once; changes made elsewhere show up within those 5 minutes.
 */
export type ProspectCache = { items?: Map<string, Prospect>; readAt?: number };
const prospectCacheAge = 5 * 60_000;
export function sharedProspectCache(): ProspectCache {
  const holder = globalThis as { vougaNextProspectCache?: ProspectCache };
  return (holder.vougaNextProspectCache ??= {});
}

/** Supabase edition: table vouga_next.prospects, reached only through the service-role functions. */
export class SupabaseProspectRepository implements ProspectRepository {
  private client: SupabaseClient;
  usingFallback = false;
  /** `fallback` answers reads until the shared base exists; writes always need the shared base. */
  constructor(options: SupabaseOptions, private fallback?: ProspectRepository, private cache?: ProspectCache) { this.client = new SupabaseClient(options); }

  private async cached(): Promise<Map<string, Prospect>> {
    const cache = this.cache!;
    if (!cache.items || Date.now() - (cache.readAt ?? 0) > prospectCacheAge) {
      const all = await this.call<Prospect[]>("vouga_next_prospects_query", { p_min_lat: null, p_max_lat: null, p_min_lng: null, p_max_lng: null, p_ids: null, p_limit: 20000 });
      cache.items = new Map(all.map((p) => [p.id, p]));
      cache.readAt = Date.now();
    }
    return cache.items;
  }
  // The client reports a missing function as missing setup; here that can only mean this migration.
  private async call<T>(name: string, body: unknown) {
    try {
      return await this.client.rpc<T>(name, body);
    } catch (error) {
      if (error instanceof AppError && /Run the vouga_next setup SQL|Executa o SQL/.test(error.message)) throw new ProspectBaseInactive();
      throw error;
    }
  }
  async query(query: ProspectQuery) {
    const { area, ids, limit = 5000 } = query;
    try {
      if (this.cache) {
        const items = await this.cached();
        const found = ids ? ids.flatMap((id) => { const p = items.get(id); return p ? [p] : []; }) : [...items.values()];
        return found.filter((p) => inArea(area, p)).sort((a, b) => a.id.localeCompare(b.id)).slice(0, limit);
      }
      return await this.call<Prospect[]>("vouga_next_prospects_query", {
        p_min_lat: area?.minLat ?? null, p_max_lat: area?.maxLat ?? null,
        p_min_lng: area?.minLng ?? null, p_max_lng: area?.maxLng ?? null,
        p_ids: ids ?? null, p_limit: limit,
      });
    } catch (error) {
      if (!(error instanceof ProspectBaseInactive) || !this.fallback) throw error;
      this.usingFallback = true;
      return this.fallback.query(query);
    }
  }
  async upsert(items: Prospect[]) {
    let written = 0;
    // Batches keep each request well under the API body limit.
    for (let i = 0; i < items.length; i += 500) {
      const batch = items.slice(i, i + 500);
      written += await this.call<number>("vouga_next_prospects_upsert", { p_items: batch });
      for (const item of batch) this.cache?.items?.set(item.id, item);
    }
    return written;
  }
  async remove(ids: string[]) {
    const removed = await this.call<number>("vouga_next_prospects_delete", { p_ids: ids });
    for (const id of ids) this.cache?.items?.delete(id);
    return removed;
  }
}

export function prospectRepository(): ProspectRepository {
  if (process.env.VOUGA_STORAGE === "supabase")
    // Until the shared base's SQL runs, the map still shows the former Git-tracked list (read only).
    return new SupabaseProspectRepository(supabaseOptions(), new LocalProspectRepository(path.resolve(".local", "no-shared-prospects")), sharedProspectCache());
  if (process.env.VOUGA_STORAGE && process.env.VOUGA_STORAGE !== "local") throw new AppError("VOUGA_STORAGE inválido.", 503);
  return new LocalProspectRepository(path.resolve(process.env.VOUGA_DATA_DIR || ".local"));
}
