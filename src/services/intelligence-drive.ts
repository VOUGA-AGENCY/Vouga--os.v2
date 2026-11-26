import {
  folders,
  InvalidReport,
  parseHeader,
  type Folder,
} from "@/domain/intelligence";
import { api, ProviderError, type ServiceContext } from "./runtime";

const drive = "https://www.googleapis.com/drive/v3";
export const docMime = "application/vnd.google-apps.document";
export const sheetMime = "application/vnd.google-apps.spreadsheet";
type FileMeta = {
  id: string;
  name: string;
  mimeType: string;
  modifiedTime: string;
  parents?: string[];
  trashed?: boolean;
};
const fields = "id,name,mimeType,modifiedTime,parents,trashed";
export interface PendingFile {
  id: string;
  name: string;
  mime: string;
  modified_at: string;
}

export function driveReader(
  ctx: ServiceContext,
  token: string,
  folder: Folder,
) {
  const headers = { Authorization: "Bearer " + token };
  const get = <T>(url: string, params: URLSearchParams) =>
    api<T>(ctx, "google", url + "?" + params, { headers });
  const folderId = folders[folder].id;
  const eligible = (f: FileMeta) =>
    !f.trashed &&
    f.parents?.includes(folderId) &&
    [docMime, sheetMime].includes(f.mimeType);
  return {
    async snapshot() {
      // Capture token before listing, so concurrent writes are replayed.
      const { startPageToken: cursor } = await get<{ startPageToken: string }>(
        drive + "/changes/startPageToken",
        new URLSearchParams({ supportsAllDrives: "true" }),
      );
      const files: FileMeta[] = [];
      let page = "";
      do {
        const params = new URLSearchParams({
          q:
            "'" +
            folderId +
            "' in parents and trashed=false and (mimeType='" +
            docMime +
            "' or mimeType='" +
            sheetMime +
            "')",
          fields: "nextPageToken,incompleteSearch,files(" + fields + ")",
          pageSize: "1000",
          supportsAllDrives: "true",
          includeItemsFromAllDrives: "true",
        });
        if (page) params.set("pageToken", page);
        const list = await get<{
          files: FileMeta[];
          nextPageToken?: string;
          incompleteSearch?: boolean;
        }>(drive + "/files", params);
        if (list.incompleteSearch)
          throw new Error("Pesquisa incompleta no Drive.");
        files.push(...list.files.filter(eligible));
        page = list.nextPageToken ?? "";
      } while (page);
      return { snapshot: true, files, cursor };
    },
    async changes(cursor: string) {
      const params = new URLSearchParams({
        pageToken: cursor,
        pageSize: "1000",
        supportsAllDrives: "true",
        includeItemsFromAllDrives: "true",
        fields:
          "nextPageToken,newStartPageToken,changes(fileId,removed,file(" +
          fields +
          "))",
      });
      const page = await get<{
        nextPageToken?: string;
        newStartPageToken?: string;
        changes: { fileId: string; removed?: boolean; file?: FileMeta }[];
      }>(drive + "/changes", params);
      const next = page.nextPageToken || page.newStartPageToken;
      if (!next) throw new Error("Cursor do Drive em falta.");
      return {
        snapshot: false,
        cursor: next,
        more: !!page.nextPageToken,
        files: page.changes.map((change) =>
          change.file && !change.removed && eligible(change.file)
            ? change.file
            : { id: change.fileId, removed: true },
        ),
      };
    },
    async read(file: PendingFile) {
      const id = encodeURIComponent(file.id);
      let header, content: string;
      if (file.mime === sheetMime) {
        const url = "https://sheets.googleapis.com/v4/spreadsheets/" + id;
        const book = await get<{
          sheets: { properties: { index: number; title: string } }[];
        }>(
          url,
          new URLSearchParams({ fields: "sheets(properties(index,title))" }),
        );
        const tabs = book.sheets
          .sort((a, b) => a.properties.index - b.properties.index)
          .map((s) => s.properties.title);
        const range = (tab: string) => "'" + tab.replaceAll("'", "''") + "'";
        const cell = await get<{ values?: string[][] }>(
          url + "/values/" + encodeURIComponent(range(tabs[0]) + "!A1"),
          new URLSearchParams(),
        );
        header = parseHeader(cell.values?.[0]?.[0] ?? "", folder);
        const sections: string[] = [];
        for (const [index, tab] of tabs.entries()) {
          const data = await get<{ values?: string[][] }>(
            url + "/values/" + encodeURIComponent(range(tab)),
            new URLSearchParams(),
          );
          const rows = data.values ?? [];
          if (!index && rows[0]) rows[0] = ["", ...rows[0].slice(1)];
          sections.push(
            tab + "\n" + rows.map((row) => row.join("\t")).join("\n"),
          );
        }
        content = sections.join("\n\n");
      } else {
        const doc = await get<{ tabs: DocTab[] }>(
          "https://docs.googleapis.com/v1/documents/" + id,
          new URLSearchParams({ includeTabsContent: "true" }),
        );
        const tabs = flattenTabs(doc.tabs);
        const blocks = tabs[0]?.documentTab?.body?.content ?? [];
        const first = blocks.findIndex(
          (b) => !!b.paragraph || !!b.table || !!b.tableOfContents,
        );
        const paragraph = blocks[first]?.paragraph;
        header = parseHeader(
          paragraph
            ? paragraph.elements
                .map((e) => e.textRun?.content ?? "")
                .join("")
                .replace(/\n$/, "")
            : "",
          folder,
        );
        content = tabs
          .map(
            (tab, i) =>
              (tabs.length > 1 ? tab.tabProperties.title + "\n" : "") +
              blockText(
                i === 0
                  ? blocks.slice(first + 1)
                  : (tab.documentTab?.body?.content ?? []),
              ),
          )
          .join("\n\n");
      }
      // Do not publish bytes read across a move or a concurrent edit.
      const meta = await get<FileMeta>(
        drive + "/files/" + id,
        new URLSearchParams({ fields, supportsAllDrives: "true" }),
      );
      if (
        !eligible(meta) ||
        Date.parse(meta.modifiedTime) !== Date.parse(file.modified_at)
      )
        throw new InvalidReport("Ficheiro alterado durante a leitura.");
      return {
        header,
        content: content.trim(),
        title: file.name.split("|").slice(2).join("|").trim() || file.name,
        url:
          "https://docs.google.com/" +
          (file.mime === sheetMime ? "spreadsheets" : "document") +
          "/d/" +
          id +
          "/edit",
      };
    },
  };
}
interface DocBlock {
  paragraph?: {
    elements: {
      textRun?: { content: string; textStyle?: { link?: { url?: string } } };
      richLink?: { richLinkProperties: { title?: string; uri?: string } };
      person?: { personProperties: { name?: string } };
    }[];
  };
  table?: { tableRows: { tableCells: { content: DocBlock[] }[] }[] };
  tableOfContents?: { content: DocBlock[] };
}
interface DocTab {
  tabProperties: { title: string };
  documentTab?: { body: { content: DocBlock[] } };
  childTabs?: DocTab[];
}
function flattenTabs(tabs: DocTab[]): DocTab[] {
  return tabs.flatMap((tab) => [tab, ...flattenTabs(tab.childTabs ?? [])]);
}
function blockText(blocks: DocBlock[]): string {
  return blocks
    .map((b) => {
      if (b.table)
        return (
          b.table.tableRows
            .map((row) =>
              row.tableCells
                .map((cell) => blockText(cell.content).trim())
                .join("\t"),
            )
            .join("\n") + "\n"
        );
      if (b.tableOfContents) return blockText(b.tableOfContents.content);
      return (
        b.paragraph?.elements
          .map((e) => {
            if (e.richLink)
              return [
                e.richLink.richLinkProperties.title,
                e.richLink.richLinkProperties.uri,
              ]
                .filter(Boolean)
                .join(" ");
            const value =
                e.textRun?.content ?? e.person?.personProperties.name ?? "",
              url = e.textRun?.textStyle?.link?.url;
            return url && value !== url ? value + " (" + url + ")" : value;
          })
          .join("") ?? ""
      );
    })
    .join("");
}

// PDF export is on demand, for charts, images and original page layout.
export async function exportReport(
  ctx: ServiceContext,
  token: string,
  folderId: string,
  id: string,
  modified: string,
) {
  const url = drive + "/files/" + encodeURIComponent(id),
    headers = { Authorization: "Bearer " + token };
  async function verifySource() {
    const meta = await api<FileMeta>(
      ctx,
      "google",
      url + "?fields=" + fields + "&supportsAllDrives=true",
      { headers },
    );
    if (
      meta.trashed ||
      !meta.parents?.includes(folderId) ||
      Date.parse(meta.modifiedTime) !== Date.parse(modified)
    )
      throw new InvalidReport(
        "O documento mudou. Sincroniza antes de consultar a versão original.",
      );
  }
  await verifySource();
  const response = await ctx.fetch(url + "/export?mimeType=application%2Fpdf", {
    headers,
    signal: AbortSignal.timeout(25000),
  });
  if (!response.ok) throw new ProviderError("google", response.status);
  const bytes = await response.arrayBuffer();
  await verifySource();
  return bytes;
}
