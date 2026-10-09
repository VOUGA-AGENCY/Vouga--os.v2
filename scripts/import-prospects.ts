// Imports prospects from a CSV (a purchased list, an export from a directory, or the leads.csv of a Google Maps
// scraper — whoever produces the file is responsible for having the right to use it). Recognised columns
// (any of the names): name/title/nome/empresa · nif/contribuinte · cae · category/categoria/atividade ·
// address/complete_address/morada/endereço · latitude/lat · longitude/lng/lon · website/site · phone/telefone ·
// email/emails · place_id · review_count · status · input_id (gosom). Rows outside the priority sectors are
// skipped unless --all is passed. Closed businesses, shops/services and repeated places are always left out.
// Without turnover/headcount columns, each company gets a "likely size" score (src/domain/prospect-size.ts) and
// only those at or above --min (default 40) are kept; with real accounts, the ICP decides instead.
// Usage: bun run prospects:import <file.csv> [--all] [--min=40] [--relatorio]
//   --relatorio  prints the result and a sample per size band with its reasons, without saving anything.
import { readFile } from "node:fs/promises";
import { caeGroups, classify, groupForCae, icpFit, type CaeGroup, type Prospect } from "../src/domain/prospects";
import { likelySize, outsideByName, outsideTarget } from "../src/domain/prospect-size";
import { saveToBase } from "./prospect-base";
import { locateMunicipality, municipalities, nearestMunicipality } from "../src/domain/municipalities";

const source = process.argv[2];
if (!source) throw new Error("Indica o ficheiro: bun run prospects:import leads.csv");
const all = process.argv.includes("--all");
const report = process.argv.includes("--relatorio");
const minScore = Number(process.argv.find((arg) => arg.startsWith("--min="))?.split("=")[1] ?? 40);
const raw = (await readFile(source, "utf8")).replace(/^﻿/, "");

function parse(text: string) {
  const firstLine = text.slice(0, text.indexOf("\n"));
  const delimiter = (firstLine.match(/;/g)?.length ?? 0) > (firstLine.match(/,/g)?.length ?? 0) ? ";" : ",";
  const rows: string[][] = [];
  let row: string[] = [], field = "", quoted = false;
  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    if (quoted) {
      if (char === '"' && text[i + 1] === '"') { field += '"'; i++; }
      else if (char === '"') quoted = false;
      else field += char;
    } else if (char === '"') quoted = true;
    else if (char === delimiter) { row.push(field); field = ""; }
    else if (char === "\n" || char === "\r") {
      if (char === "\r" && text[i + 1] === "\n") i++;
      row.push(field); field = "";
      if (row.some((cell) => cell.trim())) rows.push(row);
      row = [];
    } else field += char;
  }
  row.push(field);
  if (row.some((cell) => cell.trim())) rows.push(row);
  return rows;
}

const [header, ...rows] = parse(raw);
const norm = (v: string) => v.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase().trim();
const columns = header.map(norm);
const pick = (row: string[], ...names: string[]) => {
  for (const name of names) {
    const index = columns.indexOf(name);
    if (index >= 0 && row[index]?.trim()) return row[index].trim();
  }
  return "";
};
// gosom's complete_address is a JSON object; turn it into a readable line.
const readableAddress = (value: string) => {
  if (!value.startsWith("{")) return value;
  try {
    const a = JSON.parse(value) as Record<string, string>;
    return [a.street, [a.postal_code, a.city].filter(Boolean).join(" ")].filter(Boolean).join(", ");
  } catch { return value; }
};

// "1.234.567,89 €", "1 234 567", "1234567.5" → number; empty or non-numeric → undefined.
const amount = (value: string) => {
  const clean = value.replace(/[€\s]/g, "");
  if (!clean) return undefined;
  const normalized = /,\d{1,2}$/.test(clean) ? clean.replace(/\./g, "").replace(",", ".") : clean.replace(/[.,](?=\d{3}(\D|$))/g, "");
  const number = Number(normalized);
  return Number.isFinite(number) ? number : undefined;
};
// Turnover and employee columns, per year when the header carries one ("Vendas 2024", "Empregados 2023").
const financialColumns = columns.flatMap((column, index) => {
  const kind = /vendas|volume de negocios|faturacao|facturacao|turnover|revenue/.test(column) ? "turnover" : /empregados|trabalhadores|colaboradores|employees|n\.? ?pessoas/.test(column) ? "employees" : null;
  if (!kind) return [];
  const year = Number(column.match(/(19|20)\d{2}/)?.[0] ?? 0);
  return [{ index, kind, year }];
});
function financials(row: string[]) {
  const byYear = new Map<number, { year: number; turnover?: number; employees?: number }>();
  const fallbackYear = new Date().getFullYear() - 1;
  for (const { index, kind, year } of financialColumns) {
    const value = amount(row[index] ?? "");
    if (value === undefined) continue;
    const y = year || fallbackYear;
    const entry = byYear.get(y) ?? { year: y };
    if (kind === "turnover") entry.turnover = value;
    else entry.employees = Math.round(value);
    byYear.set(y, entry);
  }
  return byYear.size ? [...byYear.values()].sort((a, b) => a.year - b.year) : undefined;
}

// The same company found at several places (plants, warehouses) hints at a larger business.
const nameKey = (value: string) => norm(value).replace(/[^a-z0-9]+/g, " ").replace(/\b(lda|sa|s a|unipessoal)\b/g, "").trim();
const placesByName = new Map<string, Set<string>>();
for (const row of rows) {
  const name = pick(row, "name", "title", "nome", "empresa", "denominacao", "denominacao social");
  if (!name) continue;
  const places = placesByName.get(nameKey(name)) ?? new Set<string>();
  places.add(pick(row, "place_id", "cid", "data_id") || pick(row, "complete_address", "address", "morada"));
  placesByName.set(nameKey(name), places);
}

const imported: Prospect[] = [];
const seen = new Set<string>();
const dropped = { semNome: 0, fechadas: 0, foraDoAlvo: 0, semSetor: 0, duplicadas: 0, foraDoIcp: 0, dimensaoBaixa: 0, semPosicao: 0 };
let approximate = 0;
for (const row of rows) {
  const name = pick(row, "name", "title", "nome", "empresa", "denominacao", "denominacao social");
  if (!name) { dropped.semNome++; continue; }
  const cae = pick(row, "cae", "cae principal", "cae_principal");
  const category = pick(row, "category", "categoria", "atividade", "actividade", "descricao cae");
  if (/closed|fechad|encerrad/i.test(pick(row, "status"))) { dropped.fechadas++; continue; }
  if (outsideTarget.test(norm(category)) || outsideByName.test(norm(name))) { dropped.foraDoAlvo++; continue; }
  // gosom repeats the search id; "metal:Águeda" names the sector that was searched for.
  const searched = pick(row, "input_id").split(":")[0];
  const group = groupForCae(cae) ?? classify(name, category) ?? (searched in caeGroups ? (searched as CaeGroup) : null);
  if (!group && !all) { dropped.semSetor++; continue; }
  const address = readableAddress(pick(row, "complete_address", "address", "morada", "endereco", "morada completa"));
  let lat = Number(pick(row, "latitude", "lat").replace(",", "."));
  let lng = Number(pick(row, "longitude", "lng", "lon").replace(",", "."));
  const municipality = locateMunicipality(pick(row, "concelho", "municipio", "city", "localidade") || address)?.municipality;
  let approximatePosition = false;
  if (!Number.isFinite(lat) || !Number.isFinite(lng) || !lat || !lng) {
    // No coordinates in the file: place it at its municipality centroid, flagged as approximate.
    if (!municipality) { dropped.semPosicao++; continue; }
    [lat, lng] = municipalities[municipality];
    approximate++;
    approximatePosition = true;
  }
  const nearest = nearestMunicipality(lat, lng);
  const evidence = approximatePosition
    ? [`Sem coordenadas na lista: colocada no centro de ${municipality}. Confirma a morada antes da visita.`]
    : municipality && municipality !== nearest
      ? [`A morada da lista diz ${municipality}, mas as coordenadas ficam junto a ${nearest}.`]
      : [`Coordenadas da lista importada${municipality ? `, coerentes com ${municipality}` : ""}.`];
  const status = approximatePosition || (municipality && municipality !== nearest) ? "a-confirmar" : "provavel";
  const placeId = pick(row, "place_id", "cid", "data_id");
  const id = `csv:${placeId || norm(`${name}|${address}`).replace(/[^a-z0-9|]+/g, "-")}`;
  // The same place comes back from several searches (neighbouring municipalities, similar terms).
  if (seen.has(id)) { dropped.duplicadas++; continue; }
  seen.add(id);
  const website = pick(row, "website", "site", "web") || undefined;
  const email = pick(row, "emails", "email", "e-mail").replace(/[[\]"']/g, "").split(/[,;\s]+/).find((value) => value.includes("@"));
  const accounts = financials(row);
  // Real accounts decide; without them, the public Maps signals give an estimate.
  if (accounts && icpFit(accounts) === "fora") { dropped.foraDoIcp++; continue; }
  const size = accounts ? undefined : likelySize({
    name, category, website, email,
    reviews: Number(pick(row, "review_count", "reviews", "avaliacoes")) || 0,
    places: placesByName.get(nameKey(name))?.size ?? 1,
  });
  if (size && size.score < minScore) { dropped.dimensaoBaixa++; continue; }
  imported.push({
    id,
    name,
    source: "csv",
    category: category || (cae ? `CAE ${cae}` : ""),
    group: group ?? "metal",
    cae: cae || undefined,
    nif: pick(row, "nif", "contribuinte", "nipc").replace(/\D/g, "") || undefined,
    address,
    location: municipality ?? nearestMunicipality(lat, lng),
    lat: Number(lat.toFixed(6)),
    lng: Number(lng.toFixed(6)),
    website,
    phone: pick(row, "phone", "telefone", "telemovel", "contacto") || undefined,
    email,
    financials: accounts,
    likelySize: size,
    check: { status, evidence },
  });
}

const bands = { alta: 0, media: 0, baixa: 0 };
for (const item of imported) if (item.likelySize) bands[item.likelySize.band]++;
console.log(`${rows.length} linhas → ${imported.length} empresas a importar (${approximate} no centro do concelho por falta de coordenadas).`);
console.log(`Dimensão provável: ${bands.alta} alta, ${bands.media} média, ${bands.baixa} baixa; ${imported.length - bands.alta - bands.media - bands.baixa} com contas reais.`);
console.log(`Ignoradas: ${Object.entries(dropped).filter(([, n]) => n).map(([reason, n]) => `${n} ${reason}`).join(", ") || "nenhuma"}.`);
if (report) {
  // Calibration: a sample per band with its reasons, to check the score against what the team knows.
  for (const band of ["alta", "media", "baixa"] as const) {
    console.log(`\n${band.toUpperCase()}`);
    for (const item of imported.filter((p) => p.likelySize?.band === band).sort((a, b) => b.likelySize!.score - a.likelySize!.score).slice(0, 15))
      console.log(`  ${item.likelySize!.score.toString().padStart(3)}  ${item.name} (${item.location}) — ${item.likelySize!.reasons.join("; ")}`);
  }
  console.log("\nRelatório apenas: nada foi gravado. Repete sem --relatorio para gravar na base partilhada.");
} else {
  const saved = await saveToBase(imported);
  console.log(`Base partilhada: ${saved.written} gravadas; ${saved.kept} mantidas por terem sido corrigidas na app ou já estarem no CRM.`);
}
