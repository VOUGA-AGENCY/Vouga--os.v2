import { describe, expect, it } from "vitest";
import { raciusPage, raciusSlug } from "@/domain/racius";

describe("Racius links", () => {
  it("builds the company page slug the way Racius does", () => {
    expect(raciusSlug("Capela & Filhos Lda")).toBe("capela-filhos-lda");
    expect(raciusSlug("ACRS Metal Solutions, Lda")).toBe("acrs-metal-solutions-lda");
    expect(
      raciusSlug("Almep - Alojamentos Metálicos Pré-Fabricados Lda"),
    ).toBe("almep-alojamentos-metalicos-pre-fabricados-lda");
    expect(raciusPage("Capela & Filhos Lda")).toBe(
      "https://www.racius.com/capela-filhos-lda/",
    );
  });
});
