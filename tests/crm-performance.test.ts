import { describe, expect, it, vi } from "vitest";
import { knownIndex, type Prospect } from "@/domain/prospects";
import { SupabaseProspectRepository, type ProspectCache } from "@/persistence/prospects";

vi.mock("server-only", () => ({}));

const prospect = (values: Partial<Prospect>): Prospect =>
  ({ id: "p", name: "Empresa", source: "csv", category: "", group: "metal", address: "", location: "Maia", lat: 41.2, lng: -8.6, ...values });

describe("known-company index", () => {
  const known = knownIndex([
    { name: "Norte Metal, Lda", nif: "500000001" },
    { name: "Fábrica do Vale S.A.", website: "https://www.vale.pt/contactos" },
  ]);
  it("matches by NIF, website domain or normalised name, as before", () => {
    expect(known(prospect({ name: "Outro nome", nif: "500000001" }))).toBe(true);
    expect(known(prospect({ name: "Outro nome", website: "vale.pt" }))).toBe(true);
    expect(known(prospect({ name: "NORTE METAL LIMITADA" }))).toBe(true);
    expect(known(prospect({ name: "Fabrica do Vale" }))).toBe(true);
  });
  it("does not match unrelated companies or very short names", () => {
    expect(known(prospect({ name: "Metalúrgica Sul", nif: "500000002", website: "sul.pt" }))).toBe(false);
    expect(knownIndex([{ name: "A&B" }])(prospect({ name: "A B" }))).toBe(false);
  });
});

describe("prospect base cache", () => {
  const response = (data: unknown) => new Response(JSON.stringify(data), { status: 200 });
  const options = (fetcher: ReturnType<typeof vi.fn>) => ({ url: "https://test.supabase.co", secret: "sb_secret_test", fetch: fetcher as unknown as typeof fetch });
  it("downloads the base once and answers every map area from memory", async () => {
    const porto = prospect({ id: "porto", lat: 41.15, lng: -8.61 }), leiria = prospect({ id: "leiria", lat: 39.74, lng: -8.8 });
    const fetcher = vi.fn().mockResolvedValueOnce(response([porto, leiria]));
    const cache: ProspectCache = {};
    const base = () => new SupabaseProspectRepository(options(fetcher), undefined, cache);
    expect((await base().query({ area: { minLat: 41, maxLat: 41.3, minLng: -8.7, maxLng: -8.5 } })).map((p) => p.id)).toEqual(["porto"]);
    expect((await base().query({ ids: ["leiria", "nenhum"] })).map((p) => p.id)).toEqual(["leiria"]);
    expect((await base().query({})).map((p) => p.id)).toEqual(["leiria", "porto"]);
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
  it("keeps its own writes in memory, so they show at once", async () => {
    const fetcher = vi.fn().mockResolvedValueOnce(response([prospect({ id: "a" })])).mockResolvedValueOnce(response(1)).mockResolvedValueOnce(response(1));
    const cache: ProspectCache = {};
    const base = () => new SupabaseProspectRepository(options(fetcher), undefined, cache);
    await base().query({});
    await base().upsert([prospect({ id: "b", name: "Nova" })]);
    await base().remove(["a"]);
    expect((await base().query({})).map((p) => p.id)).toEqual(["b"]);
    expect(fetcher).toHaveBeenCalledTimes(3);
  });
});
