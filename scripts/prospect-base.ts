// Writes prospects from a source (OpenStreetMap sync, CSV import, the former data/prospects.json) into the shared
// prospect base: the local .local/prospects.json or Supabase, following VOUGA_STORAGE like the app.
// A prospect corrected in the app (editedBy), discarded by the team or already turned into a CRM company
// (organizationId) is never overwritten by a source, so a new import does not bring it back.
import { prospectRepository } from "../src/persistence/prospects";
import type { Prospect } from "../src/domain/prospects";

export async function saveToBase(items: Prospect[]) {
  const base = prospectRepository();
  const kept = new Set<string>();
  for (let i = 0; i < items.length; i += 500) {
    const ids = items.slice(i, i + 500).map((p) => p.id);
    for (const existing of await base.query({ ids, limit: ids.length }))
      if (existing.editedBy || existing.organizationId || existing.discarded) kept.add(existing.id);
  }
  const written = await base.upsert(items.filter((p) => !kept.has(p.id)));
  return { written, kept: kept.size };
}
