import "server-only";
import { randomUUID } from "node:crypto";
import type { Store } from "@/domain/model";
import { AppError } from "@/domain/validation";
import type { WorkspaceRepository } from "../store";
import { rows, delta } from "./collections";
import { SupabaseClient, type SupabaseOptions } from "./client";

/**
 * Last full read, shared by every request of this process. A full read is ~0.5 MB of egress and the app reads on
 * every request, poll (30 s) and worker tick (1 min), which exhausted the Free plan's 5 GB egress. With the cache,
 * a read only asks Supabase for the revision number (a few bytes) and downloads everything only when it changed.
 */
export type WorkspaceCache = { entry?: { revision: number; data: Store; routesMissing: boolean; readAt: number }; noRevisionUntil?: number };
// Until vouga_next_revision exists (20261007 migration), changes by other processes show up after this delay.
const staleWithoutRevision = 60_000;
export function sharedWorkspaceCache(): WorkspaceCache {
  const holder = globalThis as { vougaNextWorkspaceCache?: WorkspaceCache };
  return (holder.vougaNextWorkspaceCache ??= {});
}

export class SupabaseWorkspaceRepository implements WorkspaceRepository {
  private client: SupabaseClient;
  private routesMissing = false;
  constructor(options: SupabaseOptions, private cache?: WorkspaceCache) { this.client = new SupabaseClient(options); }

  /** Current revision, or null while the function is not installed. */
  private async revision(): Promise<number | null> {
    const cache = this.cache!;
    if (cache.noRevisionUntil && cache.noRevisionUntil > Date.now()) return null;
    try {
      return Number(await this.client.rpc<number>("vouga_next_revision", {}));
    } catch (error) {
      if (!(error instanceof AppError) || !/Run the vouga_next setup SQL|Executa o SQL/.test(error.message)) throw error;
      cache.noRevisionUntil = Date.now() + 5 * 60_000;
      return null;
    }
  }

  async read(fresh = false): Promise<Store> {
    const cached = this.cache?.entry;
    if (cached && !fresh) {
      const revision = await this.revision();
      if (revision === null ? Date.now() - cached.readAt < staleWithoutRevision : revision === cached.revision) {
        this.routesMissing = cached.routesMissing;
        return structuredClone(cached.data);
      }
    }
    const data = await this.client.rpc<Store|null>("vouga_next_read",{});
    if (!data) throw new AppError("The vouga_next database has not been initialized. Run the local migration.",503);
    // Until supabase/migrations/20261007_routes_prospects.sql runs, routes read as empty and saving one fails.
    this.routesMissing = data.routes === undefined;
    data.routes ??= [];
    rows(data);
    if (this.cache) this.cache.entry = { revision: data.revision, data: structuredClone(data), routesMissing: this.routesMissing, readAt: Date.now() };
    return data;
  }

  async initialize(data: Store, mutationId = randomUUID()) {
    const result=await this.client.rpc<{status:string;revision:number}>("vouga_next_commit",{
      p_expected_revision:-1,p_mutation_id:mutationId,p_schema_version:data.schemaVersion,
      p_upserts:rows(data),p_deletes:[],
    });
    if (result.status !== "ok") throw new AppError("Supabase already has data. The import did not replace it.",409);
    return result.revision;
  }

  async transact<T>(fn: (data: Store) => T): Promise<T> {
    for (let attempt=0;attempt<5;attempt++) {
      // A retry after a conflict always reads again: the cached copy is what conflicted.
      const before=await this.read(attempt>0);
      const after=structuredClone(before);
      const value=fn(after);
      if (value && typeof (value as {then?:unknown}).then === "function") throw new Error("Transactions must be synchronous, without external requests.");
      if (after.schemaVersion !== before.schemaVersion || after.revision !== before.revision) throw new Error("Workspace metadata cannot be changed by the command.");
      const changes=delta(before,after);
      // Nothing changed (e.g. the worker found no job): no write, no new revision, no egress for every reader.
      if (!changes.upserts.length && !changes.deletes.length) return value;
      if (this.routesMissing && [...changes.upserts,...changes.deletes].some(change=>change.collection==="routes"))
        throw new AppError("As rotas partilhadas ainda não estão ativas: quem gere o Supabase tem de executar supabase/migrations/20261007_routes_prospects.sql.",503);
      const result=await this.client.rpc<{status:string;revision:number}>("vouga_next_commit",{
        p_expected_revision:before.revision,p_mutation_id:randomUUID(),p_schema_version:after.schemaVersion,
        p_upserts:changes.upserts,p_deletes:changes.deletes,
      });
      if (result.status === "ok") {
        // The written state is the new current state: keep it, so the next read costs no download.
        if (this.cache) this.cache.entry = { revision: result.revision, data: { ...structuredClone(after), revision: result.revision }, routesMissing: this.routesMissing, readAt: Date.now() };
        return value;
      }
      if (result.status !== "conflict") throw new AppError("Invalid Supabase response.",503);
    }
    throw new AppError("The workspace is being changed by another operation. Try again.",409);
  }
}
