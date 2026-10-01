// Imports prospects from a CSV (a purchased list, an export from a directory, or the leads.csv of a Google Maps
// scraper — whoever produces the file is responsible for having the right to use it). Recognised columns
// (any of the names): name/title/nome/empresa · nif/contribuinte · cae · category/categoria/atividade ·
// address/complete_address/morada/endereço · latitude/lat · longitude/lng/lon · website/site · phone/telefone ·
// email/emails · place_id. Rows outside the priority sectors are skipped unless --all is passed.
// Usage: bun run prospects:import <file.csv> [--all]
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { classify, groupForCae, type Prospect } from "../src/domain/prospects";
import { locateMunicipality, municipalities, nearestMunicipality } from "../src/domain/municipalities";

const source = process.argv[2];
if (!source) throw new Error("Indica o ficheiro: bun run prospects:import leads.csv");
const all = process.argv.includes("--all");
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

const imported: Prospect[] = [];
let skipped = 0, approximate = 0;
for (const row of rows) {
  const name = pick(row, "name", "title", "nome", "empresa", "denominacao", "denominacao social");
  if (!name) { skipped++; continue; }
  const cae = pick(row, "cae", "cae principal", "cae_principal");
  const category = pick(row, "category", "categoria", "atividade", "actividade", "descricao cae");
  const group = groupForCae(cae) ?? classify(name, category);
  if (!group && !all) { skipped++; continue; }
  const address = readableAddress(pick(row, "complete_address", "address", "morada", "endereco", "morada completa"));
  let lat = Number(pick(row, "latitude", "lat").replace(",", "."));
  let lng = Number(pick(row, "longitude", "lng", "lon").replace(",", "."));
  const municipality = locateMunicipality(pick(row, "concelho", "municipio", "city", "localidade") || address)?.municipality;
  let approximatePosition = false;
  if (!Number.isFinite(lat) || !Number.isFinite(lng) || !lat || !lng) {
    // No coordinates in the file: place it at its municipality centroid, flagged as approximate.
    if (!municipality) { skipped++; continue; }
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
  imported.push({
    id: `csv:${placeId || norm(`${name}|${address}`).replace(/[^a-z0-9|]+/g, "-")}`,
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
    website: pick(row, "website", "site", "web") || undefined,
    phone: pick(row, "phone", "telefone", "telemovel", "contacto") || undefined,
    email: pick(row, "emails", "email", "e-mail").split(/[,;\s]+/)[0] || undefined,
    financials: financials(row),
    check: { status, evidence },
  });
}

const file = path.resolve("data", "prospects.json");
await mkdir(path.dirname(file), { recursive: true });
let existing: { items: Prospect[]; attribution?: string } = { items: [] };
try { existing = JSON.parse(await readFile(file, "utf8")); } catch { /* first import */ }
const byId = new Map(existing.items.map((p) => [p.id, p]));
for (const prospect of imported) byId.set(prospect.id, prospect);
await writeFile(file, JSON.stringify({ ...existing, updatedAt: new Date().toISOString(), items: [...byId.values()] }, null, 1));
console.log(`Importadas ${imported.length} empresas (${approximate} colocadas no centro do concelho por falta de coordenadas); ${skipped} linhas ignoradas.`);
