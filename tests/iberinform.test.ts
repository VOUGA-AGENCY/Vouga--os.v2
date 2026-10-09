import { describe, expect, it, vi } from "vitest";
import { icpFit, parseBracket, parseSizePage } from "@/domain/prospects";

vi.mock("server-only", () => ({}));

const page = (turnover: string, employees: string, trend: string, nif = "516626159") => `
  <h2 class="nif">${nif}</h2>
  <div class="datos-text"><h3> Volume de negócios </h3> <p> ${turnover} </p></div>
  <div class="datos-text"><h3> Capital social </h3> <p> 25.001 - 100.000€ </p></div>
  <div class="datos-text"><h3> Evolução volume de negócios </h3> <p> ${trend} </p></div>
  <div class="datos-text"><h3> Empregados </h3> <p> ${employees} </p></div>`;

describe("Iberinform brackets", () => {
  it("reads ranges, open-ended brackets and Portuguese numbers", () => {
    expect(parseBracket("2.000.000 - 10.000.000€")).toMatchObject({ min: 2_000_000, max: 10_000_000 });
    expect(parseBracket("> 50.000.000€")).toMatchObject({ min: 50_000_000 });
    expect(parseBracket("< 6")).toMatchObject({ max: 5 });
    expect(parseBracket("")).toBeUndefined();
  });
  it("reads the company page, its NIF and the trend", () => {
    const size = parseSizePage(page("2.000.000 - 10.000.000€", "26 - 50", "Aumenta"), "https://www.iberinform.pt/empresa/24976641/x", "2026-09-29T10:00:00.000Z");
    expect(size).toMatchObject({ nif: "516626159", trend: "aumenta", turnover: { min: 2_000_000 }, employees: { min: 26, max: 50 }, capital: { max: 100_000 } });
  });
  it("uses brackets for the ICP when there are no exact figures", () => {
    const at = "2026-09-29T10:00:00.000Z", url = "https://www.iberinform.pt/empresa/1/x";
    expect(icpFit(undefined, parseSizePage(page("2.000.000 - 10.000.000€", "26 - 50", "Igual"), url, at))).toBe("dentro");
    expect(icpFit(undefined, parseSizePage(page("1 - 2.000.000€", "11 - 15", "Diminui"), url, at))).toBe("fora");
    expect(icpFit(undefined, parseSizePage(page("> 50.000.000€", "26 - 50", "Diminui"), url, at))).toBe("fora");
    expect(icpFit(undefined, parseSizePage(page("2.000.000 - 10.000.000€", "< 6", "Igual"), url, at))).toBe("fora");
    // Exact yearly figures win over brackets.
    expect(icpFit([{ year: 2024, turnover: 3_000_000, employees: 30 }], parseSizePage(page("1 - 2.000.000€", "< 6", "Igual"), url, at))).toBe("dentro");
  });
});

describe("Iberinform service", () => {
  it("accepts only Iberinform company pages", async () => {
    const { iberinformUrl } = await import("@/services/iberinform-service");
    expect(iberinformUrl("https://www.iberinform.pt/empresa/24976641/acrs-metal-solutions-lda")).toBe("https://www.iberinform.pt/empresa/24976641/x");
    expect(() => iberinformUrl("https://www.racius.com/acrs/")).toThrow("Iberinform");
    expect(() => iberinformUrl("não é um link")).toThrow("link completo");
  });
  it("reads a page through the injected fetcher", async () => {
    const { fetchCompanySize } = await import("@/services/iberinform-service");
    const fetcher = vi.fn(async () => new Response(page("2.000.000 - 10.000.000€", "26 - 50", "Aumenta"), { status: 200 }));
    const size = await fetchCompanySize("https://www.iberinform.pt/empresa/24976641/acrs", fetcher as unknown as typeof fetch, "2026-09-29T10:00:00.000Z");
    expect(size.turnover?.label).toBe("2.000.000 - 10.000.000€");
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
});
