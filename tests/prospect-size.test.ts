import { describe, expect, it } from "vitest";
import { likelySize, outsideTarget } from "@/domain/prospect-size";

describe("likely company size from Google Maps signals", () => {
  it("ranks an industrial S.A. with several plants and its own site as high", () => {
    const size = likelySize({ name: "Moldes Águeda, S.A.", category: "Fabricante de moldes", website: "https://moldes.pt", email: "geral@moldes.pt", reviews: 64, places: 2 });
    expect(size.band).toBe("alta");
    expect(size.reasons).toEqual(expect.arrayContaining(["categoria de produção industrial", "sociedade anónima (S.A.)", "2 locais com o mesmo nome"]));
  });
  it("ranks a one-person workshop with a personal email and no site as low", () => {
    const size = likelySize({ name: "Serralharia do Zé Unipessoal Lda", category: "Serralharia", email: "ze@gmail.com", reviews: 1 });
    expect(size.band).toBe("baixa");
    expect(size.reasons).toEqual(expect.arrayContaining(["unipessoal", "email pessoal (gmail, sapo…)", "sem site"]));
  });
  it("recognises plurals and variants of production words", () => {
    expect(likelySize({ name: "Cortiças Feira Lda", category: "Empresa", website: "x.pt", reviews: 20 }).reasons).toContain("nome de empresa industrial");
    expect(likelySize({ name: "X", category: "Fábrica de calçado" }).reasons).toContain("categoria de produção industrial");
  });
  it("stays within 0–100", () => {
    const big = likelySize({ name: "Indústrias Grupo Portugal S.A.", category: "Fabricante industrial", website: "a.pt", email: "a@a.pt", reviews: 900, places: 9 });
    expect(big.score).toBe(100);
    expect(likelySize({ name: "Zé Unipessoal", category: "Oficina", email: "z@hotmail.com" }).score).toBeGreaterThanOrEqual(0);
  });
  it("leaves shops, traders and services out of the target", () => {
    for (const category of ["loja de ferragens", "oficina auto", "restaurante", "supermercado", "atacadista de produtos eletricos", "distribuidor de aco", "construtor civil", "agencia de emprego"]) expect(outsideTarget.test(category)).toBe(true);
    expect(outsideTarget.test("fabricante de moldes")).toBe(false);
  });
  it("scores resale below production, and groups above single companies (pilot calibration)", () => {
    const base = { website: "x.pt", reviews: 20 };
    expect(likelySize({ name: "Metal Lda", category: "Fornecedor de Equipamentos Industriais", ...base }).score)
      .toBeLessThan(likelySize({ name: "Metal Lda", category: "Fabricante", ...base }).score);
    expect(likelySize({ name: "Grupo Erofio", category: "Fabricante", email: "info@erofio.pt", ...base }).band).toBe("alta");
    expect(likelySize({ name: "Metal Comércio de Máquinas Lda", category: "Fabricante", ...base }).band).not.toBe("alta");
  });
});
