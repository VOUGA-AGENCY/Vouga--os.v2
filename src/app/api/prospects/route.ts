import { requireMember } from "@/application/auth";
import { convertProspect, knownCompanies, openProspects, readDiscard, readProspect } from "@/application/prospects";
import { repository } from "@/persistence/store";
import { prospectRepository, type Area } from "@/persistence/prospects";
import { errorResponse, jsonBody } from "@/foundation/http";
import { discardReasons, isKnown } from "@/domain/prospects";
import { AppError, record, text } from "@/domain/validation";
import { fetchCompanySize } from "@/services/iberinform-service";

const noStore = { headers: { "Cache-Control": "no-store" } };
// The map shows DOM markers: beyond this, the person is asked to zoom in.
const mapLimit = 3000;

/** ?bbox=minLng,minLat,maxLng,maxLat → the shared prospects in that part of the map, minus the CRM's companies. */
export async function GET(request: Request) {
  try {
    await requireMember(request);
    const params = new URL(request.url).searchParams;
    const bbox = params.get("bbox")?.split(",").map(Number);
    let area: Area | undefined;
    if (bbox) {
      if (bbox.length !== 4 || bbox.some((n) => !Number.isFinite(n))) throw new AppError("Zona do mapa inválida.");
      area = { minLng: bbox[0], minLat: bbox[1], maxLng: bbox[2], maxLat: bbox[3] };
    }
    const base = prospectRepository();
    const found = await base.query({ area, limit: mapLimit + 1 });
    const items = openProspects(found.slice(0, mapLimit), await repository().read(), params.get("descartados") === "1");
    const notice = base.usingFallback
      ? "A mostrar a lista antiga (data/prospects.json): a base partilhada ainda não está ativa no Supabase, por isso adicionar, corrigir ou descartar prospetos ainda não funciona."
      : undefined;
    return Response.json({ items, truncated: found.length > mapLimit, notice }, noStore);
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(request: Request) {
  try {
    const me = await requireMember(request);
    const body = (await jsonBody(request)) as { action?: string; id?: unknown; values?: unknown };
    const prospects = prospectRepository();
    const now = new Date().toISOString();
    const existing = async () => {
      const id = text(body.id, "Prospeto", 300);
      const [prospect] = await prospects.query({ ids: [id] });
      if (!prospect) throw new AppError("Este prospeto já não existe na base.", 404);
      return prospect;
    };
    if (body.action === "save") {
      const previous = body.id ? await existing() : undefined;
      const prospect = readProspect(body.values, me, now, previous);
      if (!previous) {
        // Same company already in the CRM, or already in the base around this spot.
        if (isKnown(prospect, knownCompanies(await repository().read())))
          throw new AppError("Esta empresa já está no CRM.");
        const around = await prospects.query({ area: { minLat: prospect.lat - 0.05, maxLat: prospect.lat + 0.05, minLng: prospect.lng - 0.07, maxLng: prospect.lng + 0.07 } });
        if (isKnown(prospect, around)) throw new AppError("Esta empresa já está na base de prospeção.");
      }
      await prospects.upsert([prospect]);
      return Response.json({ message: previous ? "Prospeto atualizado." : "Prospeto adicionado à base partilhada.", item: prospect }, noStore);
    }
    if (body.action === "discard") {
      const prospect = await existing();
      const discarded = readDiscard(body.values, me, now);
      await prospects.upsert([{ ...prospect, discarded }]);
      return Response.json({ message: `Descartado: ${discardReasons[discarded.reason].toLocaleLowerCase("pt")}. Fica escondido para toda a equipa.` }, noStore);
    }
    if (body.action === "restore") {
      const prospect = { ...(await existing()) };
      delete prospect.discarded;
      await prospects.upsert([prospect]);
      return Response.json({ message: "Prospeto recuperado.", item: prospect }, noStore);
    }
    if (body.action === "size") {
      const prospect = await existing();
      const size = await fetchCompanySize(text(record(body.values ?? {}).url, "Link do Iberinform", 500));
      // Names repeat: the page's NIF must be this company's, when either is known.
      if (prospect.nif && size.nif && prospect.nif !== size.nif)
        throw new AppError(`Esta página é de outra empresa: NIF ${size.nif}, e este prospeto tem o NIF ${prospect.nif}.`);
      const item = { ...prospect, size, ...(!prospect.nif && size.nif ? { nif: size.nif } : {}) };
      await prospects.upsert([item]);
      return Response.json({ message: `Dimensão lida do Iberinform${!prospect.nif && size.nif ? ` (NIF ${size.nif} guardado)` : ""}.`, item }, noStore);
    }
    if (body.action === "delete") {
      const prospect = await existing();
      await prospects.remove([prospect.id]);
      return Response.json({ message: "Prospeto apagado da base." }, noStore);
    }
    if (body.action === "convert") {
      const prospect = await existing();
      const organizationId = await repository().transact((data) => convertProspect(data, me, prospect));
      // The company is saved; if marking fails, the CRM match still keeps it off the prospect map.
      await prospects.upsert([{ ...prospect, organizationId }]).catch(() => undefined);
      return Response.json({ message: "Empresa adicionada ao CRM como New.", organizationId }, noStore);
    }
    throw new AppError("Ação desconhecida.");
  } catch (error) {
    return errorResponse(error);
  }
}
