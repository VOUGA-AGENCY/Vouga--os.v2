import type { Store } from "@/domain/model";

// Keep the domain model unchanged; each record has its own Postgres row.
export const collections = [
  "members",
  "accounts",
  "sessions",
  "organizations",
  "contacts",
  "interactions",
  "projects",
  "tasks",
  "taskComments",
  "taskAttachments",
  "taskActivity",
  "meetings",
  "updates",
  "notes",
  "inbox",
  "reminders",
  "pullRequests",
  "reminderReceipts",
  "activity",
  "externalConnections",
  "integrationJobs",
  "pendingActions",
  "notificationDeliveries",
  "oauthStates",
  "telegramLinks",
  "agentReceipts",
  "captureReceipts",
  "routes",
] as const satisfies readonly (keyof Store)[];
export type Collection = (typeof collections)[number];
export interface StoredRow {
  collection: Collection;
  key: string;
  position: number;
  data: Record<string, unknown>;
}
export function rowKey(
  collection: Collection,
  row: Record<string, unknown>,
): string {
  let key: unknown;
  if (["sessions", "oauthStates", "telegramLinks"].includes(collection))
    key = row.hash;
  else if (collection === "accounts") key = row.memberId;
  else if (
    ["agentReceipts", "captureReceipts", "reminderReceipts"].includes(
      collection,
    )
  ) {
    if (typeof row.memberId !== "string" || typeof row.key !== "string")
      throw new Error("Invalid receipt.");
    key = JSON.stringify([row.memberId, row.key]);
  } else if (collection === "notificationDeliveries") key = row.key;
  else key = row.id;
  if (typeof key !== "string" || !key || key.length > 2048)
    throw new Error(`Invalid identifier: ${collection}.`);
  return key;
}
/** Validate a read without serializing and allocating every row again. */
export function validateStore(data: Store): void {
  if (
    data.schemaVersion !== 5 ||
    !Number.isSafeInteger(data.revision) ||
    data.revision < 0
  )
    throw new Error("Incompatible workspace format.");
  for (const collection of collections) {
    if (!Array.isArray(data[collection]))
      throw new Error(`Missing collection: ${collection}.`);
    const seen = new Set<string>();
    for (const item of data[collection]) {
      if (!item || typeof item !== "object")
        throw new Error(`Invalid record: ${collection}.`);
      const key = rowKey(
        collection,
        item as unknown as Record<string, unknown>,
      );
      if (seen.has(key))
        throw new Error(`Identificador duplicado: ${collection}.`);
      seen.add(key);
    }
  }
}
export function rows(data: Store): StoredRow[] {
  if (
    data.schemaVersion !== 5 ||
    !Number.isSafeInteger(data.revision) ||
    data.revision < 0
  )
    throw new Error("Incompatible workspace format.");
  const result: StoredRow[] = [];
  for (const collection of collections) {
    if (!Array.isArray(data[collection]))
      throw new Error(`Missing collection: ${collection}.`);
    const seen = new Set<string>();
    data[collection].forEach((item, position) => {
      const value = JSON.parse(JSON.stringify(item)) as Record<string, unknown>;
      const key = rowKey(collection, value);
      if (seen.has(key))
        throw new Error(`Identificador duplicado: ${collection}.`);
      seen.add(key);
      result.push({ collection, key, position, data: value });
    });
  }
  return result;
}
export function delta(before: Store, after: Store) {
  validateStore(before);
  validateStore(after);
  const upserts: StoredRow[] = [];
  const deletes: { collection: Collection; key: string }[] = [];
  for (const collection of collections) {
    const previous = new Map(before[collection].map((item, position) => {
      const value = item as unknown as Record<string, unknown>;
      return [rowKey(collection, value), { position, json: JSON.stringify(value) }] as const;
    }));
    after[collection].forEach((item, position) => {
      const value = item as unknown as Record<string, unknown>;
      const key = rowKey(collection, value);
      const old = previous.get(key);
      const json = JSON.stringify(value);
      if (!old || old.position !== position || old.json !== json)
        upserts.push({ collection, key, position, data: JSON.parse(json) });
      previous.delete(key);
    });
    for (const key of previous.keys()) deletes.push({ collection, key });
  }
  return { upserts, deletes };
}
