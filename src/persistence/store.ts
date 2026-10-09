import "server-only";
import { SupabaseWorkspaceRepository, sharedWorkspaceCache } from "./supabase/repository";
import { supabaseOptions } from "./supabase/client";
import { mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import type { Store } from "@/domain/model";
import { createSeed, addTeamProfiles } from "./seed";

export interface WorkspaceRepository {
  read(): Promise<Store>;
  transact<T>(fn: (data: Store) => T): Promise<T>;
}

// A small, replaceable local adapter. Atomic rename + cross-process lock protects
// read/modify/write operations; never rebuild a corrupt store over the user's data.
export class LocalWorkspaceRepository implements WorkspaceRepository {
  constructor(
    private directory: string,
    private seed: () => Store,
  ) {}
  private get file() {
    return path.join(this.directory, "workspace.json");
  }
  private async lock<T>(fn: () => Promise<T>): Promise<T> {
    await mkdir(this.directory, { recursive: true, mode: 0o700 });
    const lockPath = path.join(this.directory, "write.lock");
    const until = Date.now() + 6000;
    for (;;) {
      try {
        await mkdir(lockPath);
        break;
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
        if (Date.now() >= until)
          throw new Error(
            "Local storage is busy. Check docs/LOCAL-DATA.md if the problem persists.",
          );
        await new Promise((resolve) => setTimeout(resolve, 30));
      }
    }
    try {
      return await fn();
    } finally {
      await rm(lockPath, { recursive: true });
    }
  }
  private async load(): Promise<Store> {
    const data = JSON.parse(await readFile(this.file, "utf8")) as Store;
    if (data.schemaVersion === (1 as number)) {
      data.schemaVersion = 2 as 5;
      data.contacts = data.organizations
        .filter((organization) => organization.person)
        .map((organization) => ({
          id: `legacy-contact-${organization.id}`,
          version: 1,
          createdAt: organization.createdAt,
          updatedAt: organization.updatedAt,
          createdBy: organization.createdBy,
          organizationId: organization.id,
          name: organization.person,
          email: organization.email,
          phone: organization.phone,
        }));
      data.inbox = [];
      for (const organization of data.organizations) {
        if (organization.stage === ("won" as string)) organization.stage = "client";
        if (organization.stage === ("lost" as string)) organization.stage = "dormant";
      }
      // Migration stays in memory until the next normal transaction; the original
      // file is never replaced merely by reading it.
    }
    if (data.schemaVersion === (2 as number)) {
      data.schemaVersion = 3 as 5;
      data.taskComments = [];
      data.taskAttachments = [];
      data.taskActivity = [];
      for (const task of data.tasks) task.priority ??= "none";
      for (const meeting of data.meetings) meeting.visibility ??= "private";
    }
    if (data.schemaVersion === (3 as number)) {
      const password = process.env.VOUGA_DEMO_PASSWORD;
      if (password) addTeamProfiles(data, password);
      for (const note of data.notes) note.recipientIds ??= [];
      for (const meeting of data.meetings) meeting.participantIds = [...new Set([meeting.calendarOwnerId, ...meeting.participantIds])];
      data.schemaVersion = 4 as 5;
    }
    if (data.schemaVersion === (4 as number)) {
      data.schemaVersion = 5;
      const roque = data.members.find((member) => member.id === "afonso");
      if (roque) { roque.name = "Roque"; roque.email = "roque@vouga.local"; }
      data.activity = []; data.externalConnections = []; data.integrationJobs = [];
      data.pendingActions = []; data.notificationDeliveries = []; data.oauthStates = [];
      data.telegramLinks = []; data.agentReceipts = [];
      for (const meeting of data.meetings) {
        meeting.calendarKey = meeting.organizationId && !meeting.projectId ? "contacto" : "office";
        meeting.externalParticipants = []; meeting.syncStatus = "local";
      }
      for (const project of data.projects) project.repositories ??= [];
    }
    // Collections added within schema 5 start empty; the file is rewritten on the next transaction.
    data.routes ??= [];
    if (
      data.schemaVersion !== 5 ||
      !Array.isArray(data.members) ||
      !Array.isArray(data.tasks)
    )
      throw new Error(
        "Incompatible local data format. Data was not changed.",
      );
    return data;
  }
  private async save(data: Store) {
    const temporary = `${this.file}.${randomUUID()}.tmp`;
    try {
      await writeFile(temporary, JSON.stringify(data, null, 2), {
        mode: 0o600,
        flag: "wx",
      });
      await rename(temporary, this.file);
    } finally {
      await rm(temporary, { force: true });
    }
  }
  async read(): Promise<Store> {
    try {
      return await this.load();
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
      return this.lock(async () => {
        try {
          return await this.load();
        } catch (inner) {
          if ((inner as NodeJS.ErrnoException).code !== "ENOENT") throw inner;
        }
        const data = this.seed();
        await this.save(data);
        return data;
      });
    }
  }
  async transact<T>(fn: (data: Store) => T): Promise<T> {
    await this.read();
    return this.lock(async () => {
      const data = await this.load();
      const result = fn(data); // Synchronous by contract: no network work inside a transaction.
      data.revision += 1;
      await this.save(data);
      return result;
    });
  }
}

export function repository(): WorkspaceRepository {
  // The shared cache keeps Supabase egress to a revision check per read (see supabase/repository.ts).
  if (process.env.VOUGA_STORAGE === "supabase") return new SupabaseWorkspaceRepository(supabaseOptions(), sharedWorkspaceCache());
  if (process.env.VOUGA_STORAGE && process.env.VOUGA_STORAGE !== "local") throw new Error("Invalid VOUGA_STORAGE.");
  if (process.env.VOUGA_LOCAL_MODE !== "1")
    throw new Error("Run bun run setup to configure this local edition.");
  return new LocalWorkspaceRepository(
    path.resolve(process.env.VOUGA_DATA_DIR || ".local"),
    () => {
      const password = process.env.VOUGA_DEMO_PASSWORD;
      if (!password || password.length < 12)
        throw new Error(
          "Define VOUGA_DEMO_PASSWORD com pelo menos 12 caracteres.",
        );
      return createSeed(password);
    },
  );
}
