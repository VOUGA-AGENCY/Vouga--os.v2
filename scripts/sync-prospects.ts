// Builds the prospect base from OpenStreetMap (ODbL): named industrial companies in the priority districts,
// classified into the Start Here CAE groups, and checks every position before it reaches the map:
//   1. municipality and parish from the official boundaries (OSM admin areas, imported from CAOP), not from the
//      nearest centroid — via Nominatim reverse geocoding, cached in .local/geo-cache.json (1 request/second);
//   2. consistency with the address recorded in OSM (city / municipality);
//   3. the company's own website: the municipality of the addresses it publishes;
//   4. closed or disused companies are dropped and duplicates (same name within 500 m) merged.
// Each prospect gets check.status "verificado" | "provavel" | "a-confirmar" with the evidence.
// Replaces the OSM part of .local/prospects.json; CSV imports stay.
// Usage: bun run prospects:sync [district ...]   (default: Porto Aveiro Braga)
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { classify, type LocationCheck, type Prospect } from "../src/domain/prospects";
import { locateMunicipality, nearestMunicipality } from "../src/domain/municipalities";

const districts = process.argv.slice(2).filter((a) => !a.startsWith("--"));
const targets = districts.length ? districts : ["Porto", "Aveiro", "Braga"];
const dataDir = path.resolve(process.env.VOUGA_DATA_DIR || ".local");
const ua = "VougaOS-CRM/1.0 (prospect sync and location verification)";
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const norm = (v = "") => v.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase().trim();

// 1. OpenStreetMap companies -------------------------------------------------------------------------------
const areas = targets.map((d) => `area["boundary"="administrative"]["admin_level"="6"]["name"="${d.replace(/"/g, "")}"];`).join("");
const query = `[out:json][timeout:240];(${areas})->.d;(
  nwr["name"]["man_made"="works"](area.d);
  nwr["name"]["industrial"](area.d);
  nwr["name"]["craft"](area.d);
  nwr["name"]["office"="company"](area.d);
);out tags center;`;
type Element = { type: string; id: number; lat?: number; lon?: number; center?: { lat: number; lon: number }; tags: Record<string, string> };
let elements: Element[] | null = null;
for (const endpoint of ["https://overpass-api.de/api/interpreter", "https://overpass.kumi.systems/api/interpreter"]) {
  try {
    const response = await fetch(endpoint, { method: "POST", headers: { "User-Agent": ua, "Content-Type": "application/x-www-form-urlencoded" }, body: new URLSearchParams({ data: query }), signal: AbortSignal.timeout(300_000) });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    elements = (await response.json()).elements;
    break;
  } catch (error) {
    console.warn(`Overpass ${endpoint}: ${(error as Error).message}`);
  }
}
if (!elements) throw new Error("OpenStreetMap indisponível; tenta mais tarde.");

const closed = (tags: Record<string, string>) =>
  Object.keys(tags).some((k) => /^(disused|abandoned|was|demolished|removed):/.test(k)) || !!tags.end_date || tags.opening_hours === "closed";
type Draft = Prospect & { tagCount: number; osmPlace?: string };
const drafts: Draft[] = [];
for (const element of elements) {
  const tags = element.tags;
  const point = element.center ?? (element.lat !== undefined ? { lat: element.lat, lon: element.lon! } : null);
  if (!point || closed(tags)) continue;
  const category = tags.craft ?? tags.industrial ?? tags.product ?? tags.man_made ?? tags.office ?? "";
  const group = classify(tags.name, `${category} ${tags.description ?? ""} ${tags.product ?? ""}`);
  if (!group) continue;
  const street = [tags["addr:street"], tags["addr:housenumber"]].filter(Boolean).join(", ");
  const place = [tags["addr:postcode"], tags["addr:city"] ?? tags["addr:place"]].filter(Boolean).join(" ");
  drafts.push({
    id: `osm:${element.type}/${element.id}`, name: tags.name, source: "osm", category, group,
    address: [street, place].filter(Boolean).join(", "), location: "", lat: Number(point.lat.toFixed(6)), lng: Number(point.lon.toFixed(6)),
    website: tags.website ?? tags["contact:website"], phone: tags.phone ?? tags["contact:phone"], email: tags.email ?? tags["contact:email"],
    tagCount: Object.keys(tags).length, osmPlace: tags["addr:municipality"] ?? tags["addr:city"],
  });
}
// Same company mapped twice (a point and its building): keep the richer record.
const km = (a: Draft, b: Draft) => Math.hypot((a.lat - b.lat) * 111, (a.lng - b.lng) * 111 * Math.cos((a.lat * Math.PI) / 180));
const merged: Draft[] = [];
for (const draft of drafts.sort((a, b) => b.tagCount - a.tagCount)) {
  if (!merged.some((kept) => norm(kept.name) === norm(draft.name) && km(kept, draft) < 0.5)) merged.push(draft);
}

// 2. Municipality and parish from the official boundaries (cached reverse geocoding) -------------------------
const cacheFile = path.join(dataDir, "geo-cache.json");
let cache: Record<string, { municipality: string; parish?: string } | null> = {};
try { cache = JSON.parse(await readFile(cacheFile, "utf8")); } catch { /* first run */ }
let lookups = 0;
async function boundaries(lat: number, lng: number) {
  const key = `${lat.toFixed(5)},${lng.toFixed(5)}`;
  if (key in cache) return cache[key];
  await sleep(1100);
  lookups++;
  try {
    const response = await fetch(`https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lng}&format=jsonv2&zoom=14&addressdetails=1`, { headers: { "User-Agent": ua, "Accept-Language": "pt" }, signal: AbortSignal.timeout(20_000) });
    if (!response.ok) throw new Error(String(response.status));
    const address = ((await response.json()) as { address?: Record<string, string> }).address ?? {};
    const municipality = [address.municipality, address.city, address.town, address.county].map((v) => locateMunicipality(v)?.municipality).find(Boolean);
    cache[key] = municipality ? { municipality, parish: address.village ?? address.suburb ?? address.city_district ?? address.town } : null;
  } catch {
    return null; // not cached: retried on the next sync
  }
  if (lookups % 25 === 0) await writeFile(cacheFile, JSON.stringify(cache));
  return cache[key];
}

// 3. The company's own website ----------------------------------------------------------------------------
async function siteMunicipalities(site: string) {
  const found = new Set<string>();
  let origin: string;
  try { origin = new URL(/^https?:/.test(site) ? site : `https://${site}`).origin; } catch { return found; }
  for (const target of [origin, `${origin}/contactos`, `${origin}/contacto`, `${origin}/contacts`, `${origin}/contact`]) {
    try {
      const response = await fetch(target, { headers: { "User-Agent": `Mozilla/5.0 (compatible; ${ua})` }, redirect: "follow", signal: AbortSignal.timeout(10_000) });
      if (!response.ok || !(response.headers.get("content-type") ?? "").includes("html")) continue;
      const text = (await response.text()).replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>/gi, " ").replace(/<[^>]+>/g, " ").replace(/&nbsp;/g, " ").replace(/\s+/g, " ");
      for (const m of text.matchAll(/\d{4}\s?[-–]\s?\d{3}\s+([A-Za-zÀ-ÿ .'-]{3,40})/g)) {
        const words = m[1].split(/\s+/);
        for (let n = Math.min(4, words.length); n >= 1; n--) {
          const hit = locateMunicipality(words.slice(0, n).join(" "));
          if (hit) { found.add(hit.municipality); break; }
        }
      }
      if (found.size) break;
    } catch { /* unreachable site: no evidence */ }
  }
  return found;
}

// 4. Verdict per prospect -----------------------------------------------------------------------------------
const prospects: Prospect[] = [];
let index = 0;
for (const draft of merged) {
  index++;
  if (index % 50 === 0) console.log(`  ${index}/${merged.length}…`);
  const official = await boundaries(draft.lat, draft.lng);
  const evidence: string[] = [];
  let status: LocationCheck["status"] = "provavel";
  const municipality = official?.municipality ?? nearestMunicipality(draft.lat, draft.lng);
  if (official) evidence.push(`Ponto dentro do concelho de ${official.municipality}${official.parish ? ` (${official.parish})` : ""}, pelos limites oficiais.`);
  else { evidence.push("Concelho estimado pelo centro mais próximo (limites oficiais indisponíveis)."); status = "a-confirmar"; }
  // The OSM address may name the parish ("Gavião", "Oleiros"), which can share its name with another municipality.
  const recorded = locateMunicipality(draft.osmPlace)?.municipality;
  const isParish = !!official?.parish && norm(draft.osmPlace) === norm(official.parish);
  if (recorded && recorded !== municipality && !isParish) { evidence.push(`A morada no OpenStreetMap diz ${recorded}.`); status = "a-confirmar"; }
  evidence.push(draft.id.startsWith("osm:node/") ? "Marcada no OpenStreetMap como um ponto." : "Instalações desenhadas no OpenStreetMap (edifício ou terreno): posição exata.");
  if (draft.website) {
    const onSite = await siteMunicipalities(draft.website);
    if (onSite.has(municipality)) { evidence.push(`O site da empresa confirma ${municipality}.`); if (status === "provavel") status = "verificado"; }
    else if (onSite.size) { evidence.push(`O site da empresa indica ${[...onSite].join(" / ")}.`); status = "a-confirmar"; }
  }
  if (status === "provavel" && !draft.website) evidence.push("Sem site para confirmar; confirma no Racius antes da visita.");
  prospects.push({
    id: draft.id, name: draft.name, source: "osm", category: draft.category, group: draft.group, address: draft.address,
    location: municipality, parish: official?.parish, lat: draft.lat, lng: draft.lng,
    website: draft.website, phone: draft.phone, email: draft.email, check: { status, evidence },
  });
}
await mkdir(dataDir, { recursive: true });
await writeFile(cacheFile, JSON.stringify(cache));

const file = path.join(dataDir, "prospects.json");
let kept: Prospect[] = [];
try { kept = (JSON.parse(await readFile(file, "utf8")).items as Prospect[]).filter((p) => p.source !== "osm"); } catch { /* first run */ }
await writeFile(file, JSON.stringify({ updatedAt: new Date().toISOString(), attribution: "© OpenStreetMap contributors (ODbL)", items: [...kept, ...prospects] }, null, 1));
const count = (s: string) => prospects.filter((p) => p.check?.status === s).length;
console.log(`OpenStreetMap: ${prospects.length} prospetos em ${targets.join(", ")} (${drafts.length - merged.length} duplicados juntos).`);
console.log(`Localização: ${count("verificado")} verificados, ${count("provavel")} prováveis, ${count("a-confirmar")} a confirmar.`);
