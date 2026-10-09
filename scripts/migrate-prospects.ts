// Moves the former Git-tracked data/prospects.json into the shared prospect base (Supabase or .local), once.
// Safe to repeat: prospects are written by id, and those corrected in the app are kept.
// Usage: bun run prospects:migrate [--apply]
import { readFile } from "node:fs/promises";
import path from "node:path";
import type { Prospect } from "../src/domain/prospects";
import { saveToBase } from "./prospect-base";

const file = path.resolve("data", "prospects.json");
const items = (JSON.parse(await readFile(file, "utf8")) as { items?: Prospect[] }).items ?? [];
console.log(`${items.length} prospetos em data/prospects.json; destino: ${process.env.VOUGA_STORAGE === "supabase" ? "Supabase" : ".local/prospects.json"}.`);
if (!process.argv.includes("--apply")) {
  console.log("Pré-visualização; nada foi gravado. Corre com --apply depois de executar supabase/migrations/20261007_routes_prospects.sql.");
  process.exit(0);
}
const saved = await saveToBase(items);
console.log(`Gravados ${saved.written}; ${saved.kept} já corrigidos na app foram mantidos. Depois de confirmares no mapa, data/prospects.json pode sair do Git.`);
