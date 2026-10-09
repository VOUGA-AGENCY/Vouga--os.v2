import { randomUUID } from "node:crypto";
import { executeCommand } from "@/application/commands";
import type { Member, Store } from "@/domain/model";
import { nearestMunicipality } from "@/domain/municipalities";
import { caeGroups, discardReasons, knownIndex, type CaeGroup, type DiscardReason, type Prospect } from "@/domain/prospects";
import { AppError, choice, record, text } from "@/domain/validation";

const sourceLabel = (prospect: Prospect) =>
  prospect.source === "osm" ? "OpenStreetMap" : prospect.source === "manual" ? "adicionado na app" : "lista importada";

/** Companies already in the CRM, in the shape isKnown compares against (name, NIF, website from notes). */
export function knownCompanies(data: Store) {
  // One pass over the notes: the first "Website:" line of each company.
  const websites = new Map<string, string>();
  for (const note of data.interactions) {
    if (websites.has(note.organizationId)) continue;
    const website = note.body.match(/Website: (\S+)/)?.[1];
    if (website) websites.set(note.organizationId, website);
  }
  return data.organizations.map((company) => ({ name: company.name, nif: company.nif, website: websites.get(company.id) }));
}

/**
 * Prospects still to work: not turned into a company and not already in the CRM under another record.
 * Discarded ones are left out, or are the only ones returned when reviewing them.
 */
export function openProspects(items: Prospect[], data: Store, discarded = false) {
  const known = knownIndex(knownCompanies(data));
  return items.filter((prospect) => !prospect.organizationId && !!prospect.discarded === discarded && !known(prospect));
}

export function readDiscard(value: unknown, me: Member, now: string): NonNullable<Prospect["discarded"]> {
  const v = record(value ?? {});
  return {
    reason: choice(v.reason, Object.keys(discardReasons) as DiscardReason[], "Motivo"),
    note: text(v.note, "Nota", 300, false) || undefined,
    by: me.id,
    at: now,
  };
}

/**
 * A prospect added or corrected in the app. Anyone in the team may do it; the position is the one marked
 * on the map, so it counts as verified.
 */
export function readProspect(value: unknown, me: Member, now: string, existing?: Prospect): Prospect {
  const v = record(value);
  const lat = Number(v.lat), lng = Number(v.lng);
  // Portugal, islands included.
  if (!Number.isFinite(lat) || !Number.isFinite(lng) || lat < 32 || lat > 42.2 || lng < -31.5 || lng > -6)
    throw new AppError("Marca a posição da empresa no mapa de Portugal.");
  const optional = (field: string, label: string, max = 200) => text(v[field], label, max, false) || undefined;
  const nif = optional("nif", "NIF", 20)?.replace(/\D/g, "");
  if (nif && nif.length !== 9) throw new AppError("O NIF tem 9 dígitos.");
  const moved = !existing || existing.lat !== lat || existing.lng !== lng;
  return {
    ...existing,
    id: existing?.id ?? `manual:${randomUUID()}`,
    source: existing?.source ?? "manual",
    name: text(v.name, "Nome da empresa", 160),
    group: choice(v.group, Object.keys(caeGroups) as CaeGroup[], "Setor"),
    category: text(v.category, "Atividade", 200, false),
    cae: optional("cae", "CAE", 10),
    nif: nif || undefined,
    address: text(v.address, "Morada", 300, false),
    location: text(v.location, "Concelho", 160, false) || nearestMunicipality(lat, lng),
    lat,
    lng,
    phone: optional("phone", "Telefone", 50),
    email: optional("email", "Email"),
    website: optional("website", "Website"),
    check: moved ? { status: "verificado", evidence: [`Posição marcada no mapa por ${me.name}.`] } : existing?.check,
    editedBy: me.id,
    editedAt: now,
  };
}

/** Creates the CRM company for a prospect in the caller's transaction and returns its id. */
export function convertProspect(data: Store, me: Member, prospect: Prospect, context = "") {
  const sameName = data.organizations.find((o) => !o.archived && ((!!prospect.nif && o.nif === prospect.nif) || o.name.toLocaleLowerCase("pt") === prospect.name.toLocaleLowerCase("pt")));
  if (sameName) return sameName.id;
  const result = executeCommand(data, me, { action: "organization.save", values: {
    name: prospect.name, stage: "new", location: prospect.location, address: prospect.address,
    coordinates: { lat: prospect.lat, lng: prospect.lng }, phone: prospect.phone ?? "",
    ...(prospect.nif ? { nif: prospect.nif } : {}), ...(prospect.financials ? { financials: prospect.financials } : {}),
    initialNote: [
      `Origem: prospeção (${sourceLabel(prospect)})${context}.`,
      `Setor: ${caeGroups[prospect.group]}${prospect.category ? ` · ${prospect.category}` : ""}${prospect.cae ? ` · CAE ${prospect.cae}` : ""}`,
      prospect.website ? `Website: ${prospect.website}` : "",
      prospect.email ? `Email: ${prospect.email}` : "",
    ].filter(Boolean).join("\n"),
  } });
  const id = result.ids?.[0];
  if (!id) throw new AppError(result.message ?? "Não foi possível criar a empresa.");
  return id;
}
