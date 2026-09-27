import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { tmpdir } from "node:os";
import { LocalWorkspaceRepository } from "@/persistence/store";
import { createSeed } from "@/persistence/seed";
import { executeCommand } from "@/application/commands";
import { emptyDraft } from "@/domain/capture";

let directory: string;
let repo: LocalWorkspaceRepository;
const fixture = createSeed("test-only-password", "2026-09-24T08:00:00.000Z");
beforeEach(async () => {
  directory = await mkdtemp(path.join(tmpdir(), "vouga-store-test-"));
  repo = new LocalWorkspaceRepository(directory, () =>
    structuredClone(fixture),
  );
});
afterEach(async () => {
  await rm(directory, { recursive: true, force: true });
});

it("persists across independent repository instances", async () => {
  await repo.transact((data) => {
    executeCommand(data, data.members[0], {
      action: "task.save",
      values: { title: "Persistente" },
    });
  });
  const next = new LocalWorkspaceRepository(directory, () => {
    throw new Error("Must not reseed");
  });
  expect((await next.read()).tasks.at(-1)?.title).toBe("Persistente");
});
it("serializes concurrent writers without dropping either change", async () => {
  const other = new LocalWorkspaceRepository(directory, () =>
    structuredClone(fixture),
  );
  await Promise.all(
    Array.from({ length: 8 }, (_, i) =>
      (i % 2 ? other : repo).transact((data) => {
        executeCommand(data, data.members[0], {
          action: "task.save",
          values: { title: `Task ${i}` },
        });
      }),
    ),
  );
  expect((await repo.read()).tasks).toHaveLength(fixture.tasks.length + 8);
});
it("rolls back the whole capture if any proposed record is invalid", async () => {
  const me = fixture.members[0];
  await expect(
    repo.transact((data) =>
      executeCommand(data, me, {
        action: "capture.commit",
        values: {
          key: "atomic",
          drafts: [
            { ...emptyDraft(me), kind: "task", title: "Must not persist" },
            { ...emptyDraft(me), kind: "meeting", title: "Missing date" },
          ],
        },
      }),
    ),
  ).rejects.toThrow();
  const stored = await repo.read();
  expect(stored.tasks).toHaveLength(fixture.tasks.length);
  expect(stored.captureReceipts).toHaveLength(0);
});
it("does not overwrite a corrupted store with demo data", async () => {
  await repo.read();
  const file = path.join(directory, "workspace.json");
  await writeFile(file, "corrupted");
  await expect(repo.read()).rejects.toThrow();
  expect(await readFile(file, "utf8")).toBe("corrupted");
});
it("reads the previous local format without losing records and migrates on the next write", async () => {
  const old = structuredClone(fixture) as unknown as Record<string, unknown>;
  old.schemaVersion = 1;
  delete old.contacts;
  delete old.inbox;
  const organizations = old.organizations as Array<Record<string, unknown>>;
  organizations[0].stage = "won";
  await writeFile(path.join(directory, "workspace.json"), JSON.stringify(old));
  const migrated = await repo.read();
  expect(migrated.tasks).toHaveLength(fixture.tasks.length);
  expect(migrated.organizations[0].stage).toBe("client");
  expect(migrated.contacts[0].name).toBe(organizations[0].person);
  const contactId = migrated.contacts[0].id;
  await repo.transact((data) => { data.inbox.push({id:"test-inbox", version:1, createdAt:"2026-09-24T08:00:00.000Z", updatedAt:"2026-09-24T08:00:00.000Z", createdBy:data.members[0].id, ownerId:data.members[0].id, body:"texto", resolved:false}); });
  const saved = await repo.read();
  expect(saved.schemaVersion).toBe(5);
  expect(saved.contacts[0].id).toBe(contactId);
  expect(saved.inbox[0].body).toBe("texto");
});

it("adds named profiles without replacing accounts, private notes or appointments", async () => {
  const old = structuredClone(fixture);
  old.schemaVersion = 3 as 5;
  old.members = old.members.slice(0, 3);
  old.accounts = old.accounts.slice(0, 3);
  old.meetings[0].participantIds = ["afonso"];
  await writeFile(path.join(directory, "workspace.json"), JSON.stringify(old));
  vi.stubEnv("VOUGA_DEMO_PASSWORD", "test-only-password");
  try {
    await repo.transact(() => {});
    const saved = await repo.read();
    expect(saved.members.map((member) => member.id)).toEqual(["miguel", "afonso", "engineer", "vasco", "patrick", "ana", "pedro"]);
    expect(saved.accounts.slice(0, 3)).toEqual(old.accounts);
    expect(saved.meetings[0].participantIds).toEqual(["miguel", "afonso"]);
    expect(saved.notes.map((note) => note.visibility)).toEqual(old.notes.map((note) => note.visibility));
    expect(saved.tasks).toEqual(old.tasks);
  } finally { vi.unstubAllEnvs(); }
});
