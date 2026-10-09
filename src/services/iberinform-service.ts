import "server-only";
import { AppError } from "@/domain/validation";
import { parseSizePage, type CompanySize } from "@/domain/prospects";

// Iberinform public company pages (robots.txt allows /empresa/): free brackets for turnover, its trend and
// headcount. Exact yearly figures are paid and are not read or inferred.
export function iberinformUrl(value: string) {
  let url: URL;
  try { url = new URL(value.trim()); } catch { throw new AppError("Cola o link completo da página da empresa no Iberinform."); }
  const id = url.pathname.match(/^\/empresa\/(\d{5,12})(\/|$)/)?.[1];
  if (!/(^|\.)iberinform\.pt$/.test(url.hostname) || !id) throw new AppError("O link tem de ser uma página de empresa do Iberinform (iberinform.pt/empresa/…).");
  return `https://www.iberinform.pt/empresa/${id}/x`;
}

export async function fetchCompanySize(value: string, fetcher: typeof fetch = fetch, now = new Date().toISOString()): Promise<CompanySize> {
  const url = iberinformUrl(value);
  let response: Response;
  try {
    response = await fetcher(url, { headers: { "User-Agent": "Mozilla/5.0 (compatible; VougaOS-CRM/1.0; company size lookup)" }, redirect: "follow", signal: AbortSignal.timeout(20_000) });
  } catch {
    throw new AppError("O Iberinform não respondeu; tenta daqui a pouco.", 503);
  }
  if (!response.ok) throw new AppError(`O Iberinform respondeu ${response.status}.`, 502);
  const size = parseSizePage(await response.text(), response.url || url, now);
  if (!size.turnover && !size.employees) throw new AppError("A página não tem os escalões de volume de negócios nem de empregados.");
  return size;
}
