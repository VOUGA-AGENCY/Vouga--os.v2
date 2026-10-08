import "server-only";
import { randomUUID } from "node:crypto";
import type { Store } from "@/domain/model";
import { AppError } from "@/domain/validation";
import type { WorkspaceRepository } from "../store";
import { rows, delta } from "./collections";
import { SupabaseClient, type SupabaseOptions } from "./client";
export class SupabaseWorkspaceRepository implements WorkspaceRepository {
  private client: SupabaseClient;
  constructor(options: SupabaseOptions) { this.client = new SupabaseClient(options); }
  async read(): Promise<Store> {
    const data = await this.client.rpc<Store|null>("vouga_next_read",{});
    if (!data) throw new AppError("The vouga_next database has not been initialized. Run the local migration.",503);
    rows(data);
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
      const before=await this.read();
      const after=structuredClone(before);
      const value=fn(after);
      if (value && typeof (value as {then?:unknown}).then === "function") throw new Error("Transactions must be synchronous, without external requests.");
      if (after.schemaVersion !== before.schemaVersion || after.revision !== before.revision) throw new Error("Workspace metadata cannot be changed by the command.");
      const changes=delta(before,after);
      const result=await this.client.rpc<{status:string;revision:number}>("vouga_next_commit",{
        p_expected_revision:before.revision,p_mutation_id:randomUUID(),p_schema_version:after.schemaVersion,
        p_upserts:changes.upserts,p_deletes:changes.deletes,
      });
      if (result.status === "ok") return value;
      if (result.status !== "conflict") throw new AppError("Invalid Supabase response.",503);
    }
    throw new AppError("The workspace is being changed by another operation. Try again.",409);
  }
}
