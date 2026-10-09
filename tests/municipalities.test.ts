import { describe, expect, it } from "vitest";
import {
  locateMunicipality,
  municipalities,
  placeCompanies,
} from "@/domain/municipalities";

describe("municipality lookup", () => {
  it("covers every Portuguese municipality", () => {
    expect(Object.keys(municipalities)).toHaveLength(308);
  });
  it("resolves names regardless of case and accents", () => {
    expect(locateMunicipality("Maia")?.municipality).toBe("Maia");
    expect(locateMunicipality("oliveira de azemeis")?.municipality).toBe(
      "Oliveira de Azeméis",
    );
    expect(locateMunicipality(" Albergaria-a-velha ")?.municipality).toBe(
      "Albergaria-a-Velha",
    );
  });
  it("prefers the municipality after the comma over a parish name", () => {
    // "Macieira da Maia" is a parish of Vila do Conde, not Maia.
    expect(
      locateMunicipality("Macieira da Maia, Vila do Conde")?.municipality,
    ).toBe("Vila do Conde");
    expect(locateMunicipality("Zona Industrial da Maia")?.municipality).toBe(
      "Maia",
    );
  });
  it("returns null for empty or unknown locations", () => {
    expect(locateMunicipality("")).toBeNull();
    expect(locateMunicipality(undefined)).toBeNull();
    expect(locateMunicipality("Sem localização")).toBeNull();
  });
  it("keeps Funchal on the island", () => {
    const funchal = locateMunicipality("Funchal")!;
    expect(funchal.lat).toBeGreaterThan(32.6);
    expect(funchal.lng).toBeLessThan(-16.8);
  });
});

describe("pin placement", () => {
  it("uses the exact coordinates when the address is known", () => {
    const { placed } = placeCompanies([
      { id: "a", location: "Maia", coordinates: { lat: 41.257, lng: -8.646 } },
    ]);
    expect(placed[0]).toMatchObject({ lat: 41.257, lng: -8.646, precise: true, dx: 0, dy: 0 });
  });
  it("spreads companies that share a municipality and lists the rest", () => {
    const { placed, unplaced } = placeCompanies([
      { id: "a", location: "Maia" },
      { id: "b", location: "Maia" },
      { id: "c", location: "Trofa" },
      { id: "d", location: "" },
    ]);
    expect(placed).toHaveLength(3);
    expect(unplaced.map((company) => company.id)).toEqual(["d"]);
    const [a, b] = placed.filter((pin) => pin.company.location === "Maia");
    // Same centroid, different on-screen offsets.
    expect([a.lat, a.lng]).toEqual([b.lat, b.lng]);
    expect([a.dx, a.dy]).not.toEqual([b.dx, b.dy]);
    const trofa = placed.find((pin) => pin.company.id === "c")!;
    expect([trofa.lat, trofa.lng, trofa.dx, trofa.dy]).toEqual([...municipalities.Trofa, 0, 0]);
  });
});
