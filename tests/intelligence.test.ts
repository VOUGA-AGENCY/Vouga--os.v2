import { describe, it, expect, vi, afterEach } from "vitest";
import {
  parseHeader,
  folders,
  streams,
  intelligenceAccess,
  notificationText,
} from "@/domain/intelligence";
import {
  driveReader,
  docMime,
  sheetMime,
  sheetPreview,
} from "@/services/intelligence-drive";
import {
  deliverIntelligence,
  syncFolder,
} from "@/services/intelligence-service";
import { telegramEnabled } from "@/services/features";
import * as calendar from "@/services/calendar-service";
import type { ServiceContext } from "@/services/runtime";

const header = {
  schema_version: 1,
  task_key: "manage_leads" as const,
  task_name: "Nome alterado",
  audience: "commercial",
  summary: "Há 7 novas empresas.",
  item_count: 7,
  status: "ready",
  delivered_at: "2026-11-27T08:15:00+00:00",
};
const file = {
  id: "source",
  name: "Outro nome | 2026-11-27 0815 | Porto",
  mimeType: docMime,
  modifiedTime: "2026-11-27T08:15:00Z",
  parents: [folders.contacto.id],
};
const pending = {
  id: file.id,
  name: file.name,
  mime: docMime,
  modified_at: file.modifiedTime,
};
function context(fetch: ReturnType<typeof vi.fn>) {
  return {
    fetch,
    env: {
      TELEGRAM_ENABLED: "true",
      TELEGRAM_BOT_TOKEN: "test",
      VOUGA_PUBLIC_URL: "https://os.example.org",
    },
    now: () => file.modifiedTime,
  } as unknown as ServiceContext;
}
afterEach(() => vi.restoreAllMocks());
describe("Intelligence contracts and membership", () => {
  it("maps all thirteen permanent keys and rejects incompatible folder, state and incomplete headers", () => {
    expect(Object.keys(streams)).toHaveLength(13);
    expect(parseHeader(JSON.stringify(header), "contacto").task_name).toBe(
      "Nome alterado",
    );
    for (const changed of [
      { audience: "founders" },
      { task_key: "board_report" },
      { task_key: "toString" },
      { schema_version: 2 },
      { status: "draft" },
      { item_count: -1 },
      { item_count: 1.5 },
      { item_count: undefined },
      { summary: "x".repeat(351) },
      { delivered_at: "2026-11-27T08:15:00" },
      { delivered_at: "2026-02-31T08:15:00Z" },
    ]) {
      expect(() =>
        parseHeader(JSON.stringify({ ...header, ...changed }), "contacto"),
      ).toThrow();
    }
    expect(() =>
      parseHeader(JSON.stringify(header, null, 2), "contacto"),
    ).toThrow();
    expect(() => parseHeader(JSON.stringify(header), "office")).toThrow();
    expect(
      parseHeader(JSON.stringify({ ...header, item_count: null }), "contacto")
        .item_count,
    ).toBeNull();
  });
  it("limits founders to board identities and grants the commercial streams to active engineers", () => {
    expect(intelligenceAccess({ id: "afonso", role: "admin" })).toBe(
      "founders",
    );
    expect(intelligenceAccess({ id: "new-member", role: "engineer" })).toBe(
      "commercial",
    );
    for (const id of ["engineer", "patrick"])
      expect(intelligenceAccess({ id, role: "engineer" })).toBeNull();
    expect(
      intelligenceAccess({ id: "miguel", role: "admin", archived: true }),
    ).toBeNull();
    expect(intelligenceAccess({ id: "other", role: "admin" })).toBeNull();
  });
});
describe("Drive import", () => {
  it("renders all text tabs, preserves links and validates the first paragraph even when split into runs", async () => {
    const h = JSON.stringify(header);
    const doc = {
      tabs: [
        {
          tabProperties: { title: "Resumo" },
          documentTab: {
            body: {
              content: [
                { sectionBreak: {} },
                {
                  paragraph: {
                    elements: [
                      { textRun: { content: h.slice(0, 8) } },
                      { textRun: { content: h.slice(8) + "\n" } },
                    ],
                  },
                },
                {
                  paragraph: {
                    elements: [
                      {
                        textRun: {
                          content: "Site",
                          textStyle: { link: { url: "https://example.com" } },
                        },
                      },
                    ],
                  },
                },
              ],
            },
          },
          childTabs: [
            {
              tabProperties: { title: "Fontes" },
              documentTab: {
                body: {
                  content: [
                    {
                      paragraph: {
                        elements: [{ textRun: { content: "Fonte B" } }],
                      },
                    },
                  ],
                },
              },
            },
          ],
        },
      ],
    };
    const fetch = vi
      .fn()
      .mockResolvedValueOnce(Response.json(doc))
      .mockResolvedValueOnce(Response.json(file));
    const result = await driveReader(context(fetch), "token", "contacto").read(
      pending,
    );
    expect(result.content).toContain("Site (https://example.com)");
    expect(result.content).toContain("Fonte B");
    expect(result.content).not.toContain("schema_version");
    expect(result.title).toBe("Porto");
  });
  it("skips cumulative sheets at A1 and reads every tab of completed workbooks", async () => {
    const sheets = {
      sheets: [
        { properties: { index: 1, title: "B" } },
        { properties: { index: 0, title: "A's" } },
      ],
    };
    const fetch = vi
      .fn()
      .mockResolvedValueOnce(Response.json(sheets))
      .mockResolvedValueOnce(Response.json({ values: [["Company"]] }));
    const drive = driveReader(context(fetch), "token", "contacto");
    await expect(drive.read({ ...pending, mime: sheetMime })).rejects.toThrow();
    expect(fetch).toHaveBeenCalledTimes(2);
    fetch
      .mockResolvedValueOnce(Response.json(sheets))
      .mockResolvedValueOnce(
        Response.json({ values: [[JSON.stringify(header)]] }),
      )
      .mockResolvedValueOnce(
        Response.json({
          values: [
            [JSON.stringify(header), "Outra célula"],
            ["Empresa", "A"],
          ],
        }),
      )
      .mockResolvedValueOnce(Response.json({ values: [["Porto"]] }))
      .mockResolvedValueOnce(Response.json({ ...file, mimeType: sheetMime }));
    const result = await drive.read({ ...pending, mime: sheetMime });
    expect(result.content).toContain("Outra célula");
    expect(result.content).toContain("Porto");
    expect(result.content).not.toContain("schema_version");
  });
  it("checkpoints incremental changes and retries the same unfinished file on a later scan with no new changes", async () => {
    vi.spyOn(calendar, "accessToken").mockResolvedValue("token");
    const fetch = vi.fn();
    let ready = false,
      invalid = false,
      processed = false,
      cursor: string | null = null;
    const rpc = vi.fn(async (_name, params) => {
      switch (params.operation) {
        case "begin":
          processed = false;
          return { cursor, started: file.modifiedTime };
        case "index":
          cursor = params.args.cursor;
          return true;
        case "pending":
          return !ready && !processed ? [pending] : [];
        case "invalid":
          invalid = true;
          processed = true;
          return true;
        case "import":
          ready = true;
          return true;
        default:
          return true;
      }
    });
    fetch.mockImplementation(async (input: string) => {
      if (input.includes("startPageToken"))
        return Response.json({ startPageToken: "start" });
      if (input.includes("/changes?"))
        return Response.json({ changes: [], newStartPageToken: "next" });
      if (input.includes("/files?")) return Response.json({ files: [file] });
      if (input.includes("/files/source")) return Response.json(file);
      return Response.json({
        tabs: [
          {
            tabProperties: { title: "Doc" },
            documentTab: {
              body: {
                content: [
                  {
                    paragraph: {
                      elements: [
                        {
                          textRun: {
                            content: invalid
                              ? JSON.stringify(header)
                              : "pending",
                          },
                        },
                      ],
                    },
                  },
                ],
              },
            },
          },
        ],
      });
    });
    const db = { rpc } as unknown as Parameters<typeof syncFolder>[1];
    expect(await syncFolder(context(fetch), db, "contacto")).toMatchObject({
      invalid: 1,
      imported: 0,
    });
    expect(await syncFolder(context(fetch), db, "contacto")).toMatchObject({
      invalid: 0,
      imported: 1,
    });
    expect(await syncFolder(context(fetch), db, "contacto")).toMatchObject({
      imported: 0,
    });
    expect(
      fetch.mock.calls.filter(([url]) => url.includes("/files?")),
    ).toHaveLength(1);
  });
});
describe("Telegram notification delivery", () => {
  it.each([
    [200, "sent"],
    [429, "pending"],
    [403, "failed"],
    [502, "uncertain"],
  ])("records HTTP %s independently of import", async (status, state) => {
    const send = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ ok: true, result: { message_id: 1 } }), {
        status: Number(status),
      }),
    );
    let claimed = false;
    const rpc = vi.fn(async (_name, p) => {
      if (p.operation === "claim" && !claimed) {
        claimed = true;
        return { ...header, id: "abc", chat: "1" };
      }
      return null;
    });
    await deliverIntelligence(context(send), { rpc } as unknown as Parameters<
      typeof syncFolder
    >[1]);
    expect(send).toHaveBeenCalledTimes(1);
    expect(
      JSON.parse(send.mock.calls[0][1].body).reply_markup.inline_keyboard[0][0]
        .url,
    ).toBe("https://os.example.org/intelligence?report=abc");
    expect(
      rpc.mock.calls.some(
        ([, p]) => p.operation === "finish" && p.args.state === state,
      ),
    ).toBe(true);
  });
  it("reuses the existing configured bot and respects its kill switch", () => {
    expect(telegramEnabled({ TELEGRAM_BOT_TOKEN: "configured" })).toBe(true);
    expect(
      telegramEnabled({
        TELEGRAM_BOT_TOKEN: "configured",
        TELEGRAM_ENABLED: "false",
      }),
    ).toBe(false);
    expect(notificationText(header)).not.toContain("Resultados:");
    expect(
      notificationText({ ...header, summary: "Relatório pronto." }),
    ).toContain("Resultados: 7");
  });
});

describe("Intelligence sheet preview", () => {
  const source = {
    folderId: folders.contacto.id,
    id: file.id,
    modified: file.modifiedTime,
  };
  const meta = { ...file, mimeType: sheetMime };
  const tabs = {
    sheets: [
      { properties: { index: 0, title: "Leads" } },
      { properties: { index: 1, title: "D'ouro" } },
    ],
  };
  function sheetFetch(values: string[][], finalMeta: { parents: string[] } = meta) {
    return vi
      .fn()
      .mockResolvedValueOnce(Response.json(meta))
      .mockResolvedValueOnce(Response.json(tabs))
      .mockResolvedValueOnce(Response.json({ values }))
      .mockResolvedValueOnce(Response.json(finalMeta));
  }
  it("hides the contract in A1 and keeps the displayed currency and all tabs", async () => {
    const f = sheetFetch([
      [JSON.stringify(header)],
      ["Empresa", "Valor"],
      ["ACME", "1 200,50 €"],
    ]);
    expect(await sheetPreview(context(f), "test", source, 0)).toEqual({
      tabs: ["Leads", "D'ouro"],
      rows: [
        ["Empresa", "Valor"],
        ["ACME", "1 200,50 €"],
      ],
    });
    expect(f.mock.calls[2][0]).toContain("valueRenderOption=FORMATTED_VALUE");
  });
  it("preserves A1 on other tabs, including names with quotes", async () => {
    const f = sheetFetch([["Empresa"], ["Porto"]]);
    expect((await sheetPreview(context(f), "test", source, 1)).rows[0]).toEqual(
      ["Empresa"],
    );
    expect(decodeURIComponent(f.mock.calls[2][0])).toContain(
      "/values/'D''ouro'?",
    );
  });
  it("rejects a sheet moved during the read", async () => {
    const f = sheetFetch([["x"]], { ...meta, parents: [folders.office.id] });
    await expect(sheetPreview(context(f), "test", source, 0)).rejects.toThrow(
      "mudou",
    );
  });
});
