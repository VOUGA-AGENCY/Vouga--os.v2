import { randomUUID } from "node:crypto";
import {
  folders,
  InvalidReport,
  notificationText,
  type Folder,
  type ReportRow,
} from "@/domain/intelligence";
import { SupabaseClient, supabaseOptions } from "@/persistence/supabase/client";
import { accessToken } from "./calendar-service";
import { driveReader, type PendingFile } from "./intelligence-drive";
import { telegramEnabled } from "./features";
import { sendTelegramMessage } from "./telegram-service";
import { ProviderError, publicOrigin, type ServiceContext } from "./runtime";

export type IntelligenceDb = Pick<SupabaseClient, "rpc">;
export function intelligenceDb(ctx: ServiceContext) {
  return new SupabaseClient({ ...supabaseOptions(ctx.env), fetch: ctx.fetch });
}
const failure = (e: unknown) =>
  e instanceof InvalidReport || e instanceof ProviderError
    ? e.message
    : "Falha na sincronização. Verifica a ligação e tenta novamente.";

export async function syncFolder(
  ctx: ServiceContext,
  db: IntelligenceDb,
  folder: Folder,
  deadline = Date.now() + 160_000,
) {
  const ticket = randomUUID();
  const rpc = <T>(operation: string, args: unknown = {}) =>
    db.rpc<T>("vouga_next_intelligence_sync", {
      folder: folders[folder].id,
      ticket,
      operation,
      args,
    });
  const lock = await rpc<{ cursor: string | null; started: string } | null>(
    "begin",
  );
  if (!lock) return { folder, busy: true, imported: 0, invalid: 0 };
  let imported = 0,
    invalid = 0;
  let providerError: string | undefined;
  try {
    const token = await accessToken(ctx, folder);
    const drive = driveReader(ctx, token, folder);
    let cursor = lock.cursor;
    if (!cursor) {
      const index = await drive.snapshot();
      await rpc("index", index);
      cursor = index.cursor;
    }
    for (;;) {
      try {
        const delta = await drive.changes(cursor);
        await rpc("index", delta);
        if (!delta.more) break;
        cursor = delta.cursor;
      } catch (e) {
        if (!(e instanceof ProviderError && e.status === 410)) throw e;
        const snapshot = await drive.snapshot();
        await rpc("index", snapshot);
        cursor = snapshot.cursor;
      }
    }
    for (;;) {
      const files = await rpc<PendingFile[]>("pending", {
        started: lock.started,
      });
      if (!files.length) break;
      for (const file of files) {
        if (Date.now() >= deadline) {
          await rpc("pause");
          return { folder, imported, invalid, deferred: true };
        }
        const ref = { id: file.id, modified: file.modified_at };
        let report;
        try {
          report = await drive.read(file);
        } catch (e) {
          if (!(e instanceof InvalidReport || e instanceof ProviderError))
            throw e;
          if (e instanceof ProviderError && e.status !== 404)
            providerError = failure(e);
          await rpc("invalid", { ...ref, error: failure(e) });
          invalid++;
          continue;
        }
        if (await rpc("import", { ...ref, ...report })) imported++;
      }
    }
    await rpc(providerError ? "error" : "finish", { error: providerError });
    return {
      folder,
      imported,
      invalid,
      ...(providerError ? { error: providerError } : {}),
    };
  } catch (e) {
    const error = failure(e);
    await rpc("error", { error });
    console.error("Intelligence", folder, error);
    return { folder, imported, invalid, error };
  }
}

type Delivery = Pick<
  ReportRow,
  "task_key" | "summary" | "item_count" | "delivered_at"
> & { id: string; chat: string };
export async function deliverIntelligence(
  ctx: ServiceContext,
  db: IntelligenceDb,
  folder?: Folder,
  deadline = Date.now() + 90_000,
) {
  if (!telegramEnabled(ctx.env)) return;
  const base = publicOrigin(ctx.env);
  for (let i = 0; i < 100 && Date.now() < deadline; i++) {
    const ticket = randomUUID();
    const rpc = <T>(operation: string, args: unknown) =>
      db.rpc<T>("vouga_next_intelligence_delivery", {
        ticket,
        operation,
        args,
      });
    const job = await rpc<Delivery | null>("claim", {
      folder: folder ? folders[folder].id : null,
    });
    if (!job) return;
    let receipt: { state: string; error?: string; retry?: number } = {
      state: "sent",
    };
    try {
      await sendTelegramMessage(ctx, job.chat, notificationText(job), [
        [
          {
            text: "Consultar relatório no Vouga OS",
            url: base + "/intelligence?report=" + encodeURIComponent(job.id),
          },
        ],
      ]);
    } catch (e) {
      // Telegram has no idempotency key. Only explicit rejection proves it did not send.
      const known =
        e instanceof ProviderError && e.status >= 400 && e.status < 500;
      receipt = {
        state: known
          ? [401, 429].includes(e.status)
            ? "pending"
            : "failed"
          : "uncertain",
        error: known ? e.message : "Envio sem confirmação",
        retry: known ? e.retryAfter : undefined,
      };
    }
    await rpc("finish", receipt);
  }
}
export async function runIntelligence(
  ctx: ServiceContext,
  targets: Folder[],
  db: IntelligenceDb = intelligenceDb(ctx),
) {
  const started = Date.now();
  const result = await Promise.allSettled(
    targets.map((folder) => syncFolder(ctx, db, folder, started + 160_000)),
  );
  const scans = result.map((r, i) =>
    r.status === "fulfilled"
      ? r.value
      : { folder: targets[i], error: failure(r.reason) },
  );
  await deliverIntelligence(
    ctx,
    db,
    targets.length === 1 ? targets[0] : undefined,
    started + 250_000,
  );
  return scans;
}
