import { readFile } from "node:fs/promises";
import path from "node:path";
import { requireMember } from "@/application/auth";
import { repository } from "@/persistence/store";
import { errorResponse } from "@/foundation/http";
import { isKnown, type Prospect } from "@/domain/prospects";

// Prospects are reference data built by `bun run prospects:sync` / `prospects:import` into the local data
// folder; companies already in the CRM are left out.
export async function GET(request: Request) {
  try {
    await requireMember(request);
    let base: { items: Prospect[]; updatedAt?: string; attribution?: string } = { items: [] };
    try {
      base = JSON.parse(await readFile(path.resolve("data", "prospects.json"), "utf8"));
    } catch {
      return Response.json({ items: [], missing: true }, { headers: { "Cache-Control": "no-store" } });
    }
    const data = await repository().read();
    const companies = data.organizations.map((company) => ({
      name: company.name,
      nif: company.nif,
      website: data.interactions.find((note) => note.organizationId === company.id && /Website: /.test(note.body))?.body.match(/Website: (\S+)/)?.[1],
    }));
    const items = base.items.filter((prospect) => !isKnown(prospect, companies));
    return Response.json({ items, updatedAt: base.updatedAt, attribution: base.attribution }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return errorResponse(error);
  }
}
