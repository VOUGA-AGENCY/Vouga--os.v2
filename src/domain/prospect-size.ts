// Likely size of a company found on Google Maps, which publishes no turnover or headcount. The score only
// combines public signals that tend to separate an industrial SME (the ICP: 2–50 M€, 10–250 people) from a
// workshop, a shop or a one-person business. It is an estimate to sort and filter the list, never a fact:
// the size is confirmed per company (Racius / Iberinform) before it counts as inside the ICP.

export type SizeBand = "alta" | "media" | "baixa";
export interface LikelySize {
  score: number;
  band: SizeBand;
  reasons: string[];
}
export interface MapsListing {
  name: string;
  category: string;
  website?: string;
  email?: string;
  reviews?: number;
  /** Times the same company name appears at different places in the whole list (plants, warehouses, shops). */
  places?: number;
}

const normalize = (value: string) => value.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase();

/** Businesses that are not industrial producers, whatever their sector words (shops, traders, services). */
export const outsideTarget =
  /\b(loja|store|shop|sapataria|retalh|comercio|revenda|atacadista|grossista|distribuidor|armazem|importacao e exportacao|stand|reparacao automovel|oficina auto|car repair|auto repair|pneus|restaurante|cafe|snack|pastelaria|padaria|talho|mercearia|supermercado|cabeleireiro|imobiliaria|escola|instituicao escolar|clinica|farmacia|hotel|alojamento|igreja|associacao|junta de freguesia|camara municipal|bomba de gasolina|posto de abastecimento|construtor civil|empreiteiro|agencia de emprego|escritorio|engenheiro|textil|vestuario|confecao|confeccao|eletricista|instalacoes eletricas|instalacoes electricas)\b/;
/** Clear non-target activities that show in the company name even when the Maps category does not say so. */
export const outsideByName = /\b(textil|texteis|vestuario|confecao|confeccao|confecoes|instalacoes eletricas|instalacoes electricas)\b/;
// Word stems, so plurals and variants count too (fábrica/fabricante, cortiça/cortiças, molde/moldes).
const producer =
  /\b(fabric|manufactur|factory|industri|metalurg|metalomecan|fundic|estampag|molde|injec|maquinaria|maquinas industriais|equipamentos industriais|caldeirar|estruturas metalicas|tratamento de superficies|galvaniz|conservas|transformac|cortic|serrac|palete|calcad|componentes)/;
const smallTrade = /\b(serralharia|serralheiro|carpintaria|oficina|tornearia|ferramenteiro|reparacao|manutencao|instalacoes|trabalho em aluminio|finalizador)\b/;
// "Fornecedor de …" on Maps is mostly resale, not production.
const trader = /\bfornecedor/;
const personalMail = /@(gmail|hotmail|outlook|live|sapo|yahoo|icloud|mail)\./;

// Calibrated on a pilot of 156 industrial results from Norte and Centro (October 2026): searches are already for
// industry, so a production category only separates a little; legal form, own website and reviews separate more
// (reviews: median 8, top quarter ≥19, top tenth ≥35).
export function likelySize(listing: MapsListing): LikelySize {
  const name = normalize(listing.name);
  const category = normalize(listing.category);
  const reasons: string[] = [];
  let score = 25;
  const add = (points: number, reason: string) => { score += points; reasons.push(reason); };

  if (producer.test(category) && !trader.test(category)) add(10, "categoria de produção industrial");
  else if (producer.test(name)) add(5, "nome de empresa industrial");
  if (smallTrade.test(category) && !producer.test(category)) add(-10, "categoria típica de oficina pequena");
  if (trader.test(category)) add(-10, "categoria de fornecedor (revenda)");

  if (/\bs\.?\s?a\.?$|\bs\.a\.?\b|\bsa\b$/.test(name.replace(/[,.]\s*$/, ""))) add(20, "sociedade anónima (S.A.)");
  else if (/unipessoal/.test(name)) add(-15, "unipessoal");
  if (/\b(grupo|group)\b/.test(name)) add(10, "grupo empresarial");
  else if (/\b(industria|industrias|industrial|international|internacional|portugal)\b/.test(name)) add(5, "nome de indústria");
  if (/\bcomercio\b/.test(name)) add(-10, "comércio no nome (revenda)");

  if (listing.website) add(10, "site próprio");
  else add(-10, "sem site");
  if (listing.email) {
    if (personalMail.test(normalize(listing.email))) add(-10, "email pessoal (gmail, sapo…)");
    else add(5, "email de domínio próprio");
  }

  const reviews = listing.reviews ?? 0;
  // Factories collect a few reviews from staff and visitors; very few suggests a tiny business.
  if (reviews >= 35) add(10, `${reviews} avaliações`);
  else if (reviews >= 15) add(5, `${reviews} avaliações`);
  else if (reviews <= 2) add(-5, "quase sem avaliações");

  if ((listing.places ?? 1) > 1) add(10, `${listing.places} locais com o mesmo nome`);

  score = Math.max(0, Math.min(100, score));
  return { score, band: score >= 65 ? "alta" : score >= 45 ? "media" : "baixa", reasons };
}

export const sizeBands: Record<SizeBand, string> = { alta: "Dimensão provável alta", media: "Dimensão provável média", baixa: "Dimensão provável baixa" };
