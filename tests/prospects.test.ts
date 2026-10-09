import { describe, expect, it } from "vitest";
import { classify, groupForCae, icpFit, isKnown, latestFinancials } from "@/domain/prospects";

describe("prospect classification", () => {
  it("maps companies to the Start Here sectors", () => {
    expect(classify("Metalomecânica Agrela", "metal_construction")).toBe("metal");
    expect(classify("Sotebor", "rubber goods")).toBe("borracha");
    expect(classify("Solas M.H.B.", "company")).toBe("calcado");
    expect(classify("Olicork - Produtos de Cortiça", "company")).toBe("madeira");
    expect(classify("Lactogal", "food_industry")).toBe("alimentar");
  });
  it("leaves out installers, retail and place-name false positives", () => {
    expect(classify("Electro Creixomil", "electrician")).toBeNull();
    expect(classify("Padaria São Tomé", "bakery")).toBeNull();
    expect(classify("Cooperativa Agrícola de São João da Madeira", "company")).toBeNull();
  });
  it("uses the CAE division when a list provides it", () => {
    expect(groupForCae("25110")).toBe("metal");
    expect(groupForCae("22190")).toBe("borracha");
    expect(groupForCae("47410")).toBeNull();
  });
  it("recognises companies already in the CRM", () => {
    const crm = [{ name: "Capela & Filhos Lda", nif: "502541865", website: "https://www.capelaefilhos.com/index.html" }];
    expect(isKnown({ name: "Capela e Filhos", website: undefined }, crm)).toBe(true);
    expect(isKnown({ name: "Outra", website: "capelaefilhos.com" }, crm)).toBe(true);
    expect(isKnown({ name: "Outra", nif: "502541865" }, crm)).toBe(true);
    expect(isKnown({ name: "Neves & Neves" }, crm)).toBe(false);
  });
});

describe("company size", () => {
  it("summarises the latest turnover and its change", () => {
    const summary = latestFinancials([
      { year: 2023, turnover: 4_000_000, employees: 40 },
      { year: 2024, turnover: 5_000_000, employees: 45 },
    ])!;
    expect(summary.latest.year).toBe(2024);
    expect(summary.change).toBeCloseTo(0.25);
    expect(latestFinancials(undefined)).toBeNull();
  });
  it("checks the Start Here ICP without inventing missing figures", () => {
    expect(icpFit([{ year: 2024, turnover: 5_000_000, employees: 45 }])).toBe("dentro");
    expect(icpFit([{ year: 2024, turnover: 800_000, employees: 6 }])).toBe("fora");
    expect(icpFit([{ year: 2024, employees: 300 }])).toBe("fora");
    expect(icpFit(undefined)).toBe("sem-dados");
  });
});
