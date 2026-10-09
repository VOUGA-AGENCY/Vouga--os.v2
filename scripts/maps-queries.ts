// Writes the Google Maps searches for gosom/google-maps-scraper: every sector term in every municipality of the
// chosen area (default: mainland Norte and Centro, i.e. north of latitude 39.2). Each line carries an id
// "<sector>:<term>:<municipality>" that gosom returns as input_id, so the import knows which search found a company.
// Usage: bun run prospects:queries [--sul=39.2] [--setores=metal,calcado]   → .local/maps-queries.txt
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { municipalities } from "../src/domain/municipalities";
import { caeGroups, type CaeGroup } from "../src/domain/prospects";

// The terms that returned industrial companies in the October 2026 pilot; each search takes about a minute, so
// fewer, broader terms cover the area in hours instead of days (Maps also returns related businesses nearby).
const terms: Record<CaeGroup, string[]> = {
  metal: ["metalomecânica", "fábrica de moldes"],
  maquinas: ["fabricante de máquinas industriais"],
  borracha: ["injeção de plásticos"],
  eletrico: ["fabricante de quadros elétricos"],
  alimentar: ["indústria alimentar"],
  calcado: ["fábrica de calçado"],
  madeira: ["indústria de cortiça", "serração de madeira"],
};

const option = (name: string) => process.argv.find((arg) => arg.startsWith(`--${name}=`))?.split("=")[1];
const south = Number(option("sul") ?? 39.2);
const sectors = (option("setores")?.split(",") ?? Object.keys(caeGroups)).filter((s): s is CaeGroup => s in caeGroups);
// Mainland only: the islands sit far west of -9.6.
const area = Object.entries(municipalities).filter(([, [lat, lng]]) => lat >= south && lng > -9.6).map(([name]) => name).sort((a, b) => a.localeCompare(b, "pt"));

// The id is unique per search (sector, term number, municipality); the import reads the sector from its first part.
const lines = sectors.flatMap((sector) => terms[sector].flatMap((term, index) => area.map((municipality) => `${term} em ${municipality} #!# ${sector}:${index + 1}:${municipality}`)));
const file = path.resolve(process.env.VOUGA_DATA_DIR || ".local", "maps-queries.txt");
await mkdir(path.dirname(file), { recursive: true });
await writeFile(file, `${lines.join("\n")}\n`);
console.log(`${lines.length} pesquisas (${sectors.length} setores, ${area.length} concelhos a norte de ${south}) em ${path.relative(process.cwd(), file)}.`);
// On Windows the browser inside the binary closes at once; the Docker image works. -email visits every website
// and makes the run several times slower, so it is left out (email weighs little in the size score).
console.log('Exemplo (Docker): docker run -d --name vouga-maps -v "<pasta .local>:/data" gosom/google-maps-scraper:v1.18.1 -input /data/maps-queries.txt -results /data/maps.csv -depth 2 -lang pt -c 4 -exit-on-inactivity 5m');
