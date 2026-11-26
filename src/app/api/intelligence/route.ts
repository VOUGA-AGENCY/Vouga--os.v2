import { requireMember } from "@/application/auth";
import { accessToken } from "@/services/calendar-service";
import { exportReport, sheetPreview } from "@/services/intelligence-drive";
import {
  folders,
  InvalidReport,
  intelligenceAccess,
  streams,
  type Folder,
  type Stream,
} from "@/domain/intelligence";
import { isDateKey } from "@/domain/time";
import { AppError } from "@/domain/validation";
import { errorResponse } from "@/foundation/http";
import {
  intelligenceDb,
  runIntelligence,
} from "@/services/intelligence-service";
import { equal, required, runtime } from "@/services/runtime";

export const maxDuration = 300;
const json = (value: unknown) =>
  Response.json(value, { headers: { "Cache-Control": "private, no-store" } });
async function identity(request: Request, ctx: ReturnType<typeof runtime>) {
  const auth =
    ctx.repo.scoped?.(["members", "accounts", "sessions"]) ?? ctx.repo;
  const member = await requireMember(request, await auth.read());
  const access = intelligenceAccess(member);
  if (!access) throw new AppError("Sem acesso a Intelligence.", 403);
  return { member, access };
}
function reportId(value: string | null) {
  if (!value || !/^[\w-]{1,200}$/.test(value))
    throw new AppError("Identificador inválido.");
  return value;
}
export async function GET(request: Request) {
  try {
    const ctx = runtime();
    const { member, access } = await identity(request, ctx);
    const db = intelligenceDb(ctx);
    const params = new URL(request.url).searchParams;
    const read = (operation: string, args: unknown) =>
      db.rpc("vouga_next_intelligence_read", {
        actor: member.id,
        operation,
        args,
      });
    if (params.has("id")) {
      const detail = await read("detail", { id: reportId(params.get("id")) });
      if (!detail) throw new AppError("Relatório indisponível.", 404);
      const row = detail as {
        id: string;
        folder_id: string;
        source_modified_at: string;
        task_key: Stream;
      };
      const key = row.folder_id === folders.office.id ? "office" : "contacto";
      if (
        folders[key].id !== row.folder_id ||
        !Object.hasOwn(streams, row.task_key) ||
        streams[row.task_key][0] !== folders[key].audience ||
        (key === "office" && access !== "founders")
      )
        throw new AppError("Relatório indisponível.", 404);
      const layout = params.get("layout");
      if (layout === "pdf" || layout === "sheet") {
        try {
          if (layout === "sheet") {
            const index = Number(params.get("tab") ?? 0);
            if (!Number.isSafeInteger(index) || index < 0)
              throw new AppError("Separador inválido.");
            return json(
              await sheetPreview(
                ctx,
                await accessToken(ctx, key),
                {
                  folderId: row.folder_id,
                  id: row.id,
                  modified: row.source_modified_at,
                },
                index,
              ),
            );
          }
          const bytes = await exportReport(
            ctx,
            await accessToken(ctx, key),
            row.folder_id,
            row.id,
            row.source_modified_at,
          );
          return new Response(bytes, {
            headers: {
              "Content-Type": "application/pdf",
              "Content-Disposition": "inline",
              "Cache-Control": "private, no-store",
              "X-Content-Type-Options": "nosniff",
            },
          });
        } catch (e) {
          if (e instanceof InvalidReport) throw new AppError(e.message, 409);
          throw e;
        }
      }
      return json(detail);
    }
    const date = params.get("date") || null;
    if (date && !isDateKey(date)) throw new AppError("Data inválida.");
    if (params.has("key")) {
      const key = params.get("key") as Stream,
        offset = Number(params.get("offset") || 0);
      if (
        !Object.hasOwn(streams, key) ||
        (access !== "founders" && streams[key][0] !== access)
      )
        throw new AppError("Fluxo indisponível.", 404);
      if (!Number.isSafeInteger(offset) || offset < 0 || offset > 2147483647)
        throw new AppError("Filtro inválido.");
      return json(await read("history", { key, date, offset }));
    }
    return json(await read("streams", { date }));
  } catch (error) {
    return errorResponse(error);
  }
}
export async function POST(request: Request) {
  try {
    const ctx = runtime();
    const params = new URL(request.url).searchParams;
    let targets: Folder[] = ["office", "contacto"];
    if (params.get("scheduled") === "1") {
      if (
        !equal(
          "Bearer " + required(ctx.env, "INTEGRATION_CRON_SECRET"),
          request.headers.get("authorization") ?? "",
        )
      )
        throw new AppError("Unauthorized.", 403);
    } else {
      const { member, access } = await identity(request, ctx);
      if (params.has("read")) {
        await intelligenceDb(ctx).rpc("vouga_next_intelligence_read", {
          actor: member.id,
          operation: "mark",
          args: { id: reportId(params.get("read")) },
        });
        return json({ ok: true });
      }
      if (access === folders.contacto.audience) targets = ["contacto"];
    }
    const scans = await runIntelligence(ctx, targets);
    return Response.json(
      { scans },
      {
        status: scans.some((s) => "error" in s) ? 502 : 200,
        headers: { "Cache-Control": "no-store" },
      },
    );
  } catch (error) {
    return errorResponse(error);
  }
}
