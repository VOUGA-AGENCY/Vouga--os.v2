/** Where visits start and end: the Vouga office at PORTIC (P.Porto, Asprela). */
export const vougaBase = {
  name: "Vouga · PORTIC",
  address: "Rua Arquitecto Lobão Vital, 172, 4200-375 Porto",
  lat: 41.1752,
  lng: -8.6059,
} as const;

/** Priority sectors from the Start Here guide (CAE divisions). */
export const caeGroups = {
  metal: "Metalomecânica (CAE 25)",
  maquinas: "Máquinas e equipamentos (CAE 28)",
  borracha: "Borracha e plásticos (CAE 22)",
  eletrico: "Equipamento elétrico (CAE 27)",
  alimentar: "Indústrias alimentares (CAE 10)",
  calcado: "Calçado (CAE 15)",
  madeira: "Madeira e cortiça (CAE 16)",
} as const;
export type CaeGroup = keyof typeof caeGroups;

/** One year of company accounts, as reported by a paid source (purchased list) or entered by the team. */
export interface FinancialYear {
  year: number;
  /** Volume de negócios in euros. */
  turnover?: number;
  employees?: number;
}

/** How much we trust a prospect's position, and why. */
export interface LocationCheck {
  status: "verificado" | "provavel" | "a-confirmar";
  evidence: string[];
}

/** A published bracket, e.g. "2.000.000 - 10.000.000€" → { min: 2e6, max: 1e7 }; "< 6" → { max: 5 }. */
export interface Bracket { label: string; min?: number; max?: number }
/** Free size information from a public company page (Iberinform): brackets and the direction of turnover. */
export interface CompanySize {
  source: "Iberinform";
  url: string;
  nif?: string;
  turnover?: Bracket;
  trend?: "aumenta" | "diminui" | "igual";
  employees?: Bracket;
  capital?: Bracket;
  checkedAt: string;
}

const numberPt = (value: string) => Number(value.replace(/\./g, "").replace(",", "."));
export function parseBracket(label: string): Bracket | undefined {
  const text = label.replace(/€/g, "").trim();
  if (!text) return undefined;
  const range = text.match(/^([\d.,]+)\s*-\s*([\d.,]+)$/);
  if (range) return { label, min: numberPt(range[1]), max: numberPt(range[2]) };
  const above = text.match(/^>\s*([\d.,]+)$/);
  if (above) return { label, min: numberPt(above[1]) };
  const below = text.match(/^<\s*([\d.,]+)$/);
  if (below) return { label, max: numberPt(below[1]) - 1 };
  const single = text.match(/^([\d.,]+)$/);
  if (single) return { label, min: numberPt(single[1]), max: numberPt(single[1]) };
  return undefined;
}

/** Reads the "label → value" pairs of an Iberinform company page. */
export function parseSizePage(html: string, url: string, checkedAt: string): CompanySize {
  const clean = (s: string) => s.replace(/<[^>]+>/g, " ").replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/\s+/g, " ").trim();
  const fields: Record<string, string> = {};
  for (const m of html.matchAll(/<h3[^>]*>([\s\S]{1,80}?)<\/h3>\s*<p[^>]*>([\s\S]{0,120}?)<\/p>/g)) {
    const label = clean(m[1]).toLowerCase(), value = clean(m[2]);
    if (label && value && !(label in fields)) fields[label] = value;
  }
  const trend = (fields["evolução volume de negócios"] ?? "").toLowerCase();
  return {
    source: "Iberinform",
    url,
    nif: html.match(/nif">\s*(\d{9})\s*</)?.[1],
    turnover: parseBracket(fields["volume de negócios"] ?? ""),
    trend: trend.startsWith("aument") ? "aumenta" : trend.startsWith("diminu") ? "diminui" : trend.startsWith("igual") ? "igual" : undefined,
    employees: parseBracket(fields["empregados"] ?? ""),
    capital: parseBracket(fields["capital social"] ?? ""),
    checkedAt,
  };
}

/** Start Here ICP hypothesis: €2M–€50M turnover and 10–250 employees. */
export const icp = { turnoverMin: 2_000_000, turnoverMax: 50_000_000, employeesMin: 10, employeesMax: 250 } as const;

export function latestFinancials(financials: FinancialYear[] | undefined) {
  const years = [...(financials ?? [])].sort((a, b) => b.year - a.year);
  const latest = years[0];
  if (!latest) return null;
  const previous = years.find((item) => item.year < latest.year && item.turnover);
  const change = latest.turnover && previous?.turnover ? (latest.turnover - previous.turnover) / previous.turnover : null;
  return { latest, previous, change, series: [...years].reverse() };
}

/** A bracket fits when it lies inside [min, max]; it is out when it lies entirely below or above. */
function bracketFits(bracket: Bracket | undefined, min: number, max: number): boolean | undefined {
  if (!bracket) return undefined;
  if (bracket.max !== undefined && bracket.max <= min) return false;
  if (bracket.min !== undefined && bracket.min >= max) return false;
  return true;
}

/**
 * ICP fit: exact yearly figures when known, otherwise the published brackets.
 * "dentro", "fora", or "sem-dados" when nothing is known.
 */
export function icpFit(financials: FinancialYear[] | undefined, size?: CompanySize): "dentro" | "fora" | "sem-dados" {
  const summary = latestFinancials(financials);
  const turnover = summary?.latest.turnover;
  const employees = [...(financials ?? [])].sort((a, b) => b.year - a.year).find((item) => item.employees !== undefined)?.employees;
  const turnoverOk = turnover !== undefined ? turnover >= icp.turnoverMin && turnover <= icp.turnoverMax : bracketFits(size?.turnover, icp.turnoverMin, icp.turnoverMax);
  const employeesOk = employees !== undefined ? employees >= icp.employeesMin && employees <= icp.employeesMax : bracketFits(size?.employees, icp.employeesMin, icp.employeesMax);
  if (turnoverOk === undefined && employeesOk === undefined) return "sem-dados";
  return turnoverOk !== false && employeesOk !== false ? "dentro" : "fora";
}

export interface Prospect {
  /** Stable id from the source ("osm:node/123", "csv:<place_id or name+address>"). */
  id: string;
  name: string;
  source: "osm" | "csv";
  /** Source category, e.g. OSM craft=metal_construction or the Google Maps category text. */
  category: string;
  group: CaeGroup;
  cae?: string;
  nif?: string;
  address: string;
  location: string;
  lat: number;
  lng: number;
  website?: string;
  phone?: string;
  email?: string;
  /** Parish (freguesia) from the official boundaries, when known. */
  parish?: string;
  financials?: FinancialYear[];
  check?: LocationCheck;
}

// Order matters: footwear before rubber (soles), rubber before metal (moulds for plastics).
const rules: [CaeGroup, RegExp][] = [
  ["calcado", /cal[çc]ad|sapat|shoe|footwear|\bsolas?\b|palmilh/],
  ["madeira", /madeir|corti[çc]|\bcork|serra[çc]|sawmill|carpint|carpenter|joiner|marcenar|mobili[aá]ri|furniture|\bwood/],
  ["alimentar", /aliment|food|conserv|charcut|carnes|\bmeat|l[aá]cte|latic|queijo|panifica|bakery|bolach|biscoit|slaughter|matadour|past(a|as) aliment/],
  ["borracha", /borrach|rubber|pl[aá]stic|pol[ií]mer|poliure|espuma|\bfoam|termoform|inje[cç][aã]o de pl/],
  ["eletrico", /el[eé]c?tric|electrician|quadros el|cablag|\bcabos\b|transformador|ilumina[cç]|lighting/],
  ["maquinas", /m[aá]quinas|machine|machinery|equipamentos industriais|automa[cç][aã]o|robot|hidr[aá]ulic|pneum[aá]tic/],
  ["metal", /metal|inox|serralh|soldad|welder|weld|blacksmith|caldeir|boiler|\bferro|\ba[çc]o\b|steel|tornear|maquina[çg]|\bcnc\b|fundi[çc]|foundry|galvaniz|estampag|corte laser|laser cutting|cutelar|moldes|\bmould|\bmold|estruturas met|forj|chapa|tubagem|piping/],
];
const normalize = (value: string) => value.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase();
// Installers, retail and logistics share words with the target sectors but are outside the ICP
// (e.g. electricians are CAE 43, not CAE 27 manufacturers).
const outside = /\b(electrician|eletricista|electricista|bakery|padaria|pastelaria|port|recycling|reciclag|scrap_yard|sucata|gas|depot|logistics|warehouse|textil|textile|fabric_mill|retail|shop|loja|restaurante)\b/;
// Place names that would otherwise match a sector ("São João da Madeira" is not the wood industry).
const places = /sao joao da madeira|ilha da madeira|oliveira de azemeis/g;

/** Maps a company to one of the priority sectors from its category and name; null when it does not fit. */
export function classify(name: string, category: string): CaeGroup | null {
  const text = normalize(`${category} ${name}`).replace(places, " ");
  if (outside.test(text)) return null;
  for (const [group, pattern] of rules) if (pattern.test(text)) return group;
  return null;
}

/** First digits of a CAE code to its priority group, when the source gives the code (e.g. purchased lists). */
export function groupForCae(cae: string | undefined): CaeGroup | null {
  const division = (cae ?? "").replace(/\D/g, "").slice(0, 2);
  return ({ "25": "metal", "28": "maquinas", "22": "borracha", "27": "eletrico", "10": "alimentar", "15": "calcado", "16": "madeira" } as Record<string, CaeGroup>)[division] ?? null;
}

const domain = (website?: string) => {
  if (!website) return "";
  try { return new URL(/^https?:/.test(website) ? website : `https://${website}`).hostname.replace(/^www\./, ""); } catch { return ""; }
};
const key = (name: string) => normalize(name).replace(/\b(lda|limitada|s\.?a|unipessoal|sociedade|industria|industrias|de|e|&)\b/g, " ").replace(/[^a-z0-9]+/g, " ").trim();

/** True when the prospect is already a CRM company (same NIF, same website, or same name). */
export function isKnown(prospect: Pick<Prospect, "name" | "nif" | "website">, companies: { name: string; nif?: string; website?: string }[]) {
  const site = domain(prospect.website);
  const name = key(prospect.name);
  return companies.some((company) =>
    (!!prospect.nif && company.nif === prospect.nif) ||
    (!!site && domain(company.website) === site) ||
    (name.length > 3 && key(company.name) === name));
}
