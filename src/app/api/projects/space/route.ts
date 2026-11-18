import { randomUUID } from "node:crypto";
import { extractRawText } from "mammoth";
import { identityFromStore, requireMember, tokenFrom } from "@/application/auth";
import type { Member, ProjectDocument, Store } from "@/domain/model";
import { canSeeProject } from "@/domain/permissions";
import { AppError, record, text } from "@/domain/validation";
import { errorResponse, jsonBody } from "@/foundation/http";
import { attachmentStorage } from "@/persistence/attachment-storage";
import { repository } from "@/persistence/store";
import { boundedBody } from "@/services/runtime";

const docx = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
const mimeTypes: Record<string, string> = {
  pdf: "application/pdf", txt: "text/plain", png: "image/png",
  jpg: "image/jpeg", jpeg: "image/jpeg", webp: "image/webp", gif: "image/gif", docx,
};
const privateHeaders = { "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" };

function verifyDocxSize(bytes: Buffer) {
  // Read the central directory before decompression. Ordinary DOCX files use a single ZIP disk.
  const floor = Math.max(0, bytes.length - 65_557);
  let end = bytes.length - 22;
  while (end >= floor && bytes.readUInt32LE(end) !== 0x06054b50) end--;
  if (end < floor || bytes.readUInt16LE(end + 4) !== 0 || bytes.readUInt16LE(end + 6) !== 0)
    throw new AppError("Invalid DOCX archive.");
  const entries = bytes.readUInt16LE(end + 10);
  let offset = bytes.readUInt32LE(end + 16);
  let unpacked = 0;
  if (entries > 2000) throw new AppError("This DOCX has too many entries.");
  for (let i = 0; i < entries; i++) {
    if (offset + 46 > end || bytes.readUInt32LE(offset) !== 0x02014b50)
      throw new AppError("Invalid DOCX archive.");
    unpacked += bytes.readUInt32LE(offset + 24);
    if (unpacked > 24 * 1024 * 1024) throw new AppError("This DOCX is too large to preview.");
    offset += 46 + bytes.readUInt16LE(offset + 28) + bytes.readUInt16LE(offset + 30) + bytes.readUInt16LE(offset + 32);
  }
}

function currentMember(data: Store, request: Request) {
  const identity = identityFromStore(data, tokenFrom(request));
  if (!identity || identity.mustChangePassword) throw new AppError("Please sign in again.", 401);
  return identity.member;
}

function projectFor(data: Store, me: Member, id: unknown) {
  const project = data.projects.find((item) => item.id === id);
  if (!project || !canSeeProject(me, project)) throw new AppError("Project not found.", 404);
  return project;
}

function contextDocument(body: string): ProjectDocument {
  return { id: "context", title: "context.md", revisions: [{ body, authorId: "", authorName: "", at: "" }] };
}

function documentsFor(project: ReturnType<typeof projectFor>) {
  const docs = project.documents ?? [];
  return docs.some(doc => doc.id === "context") ? docs : [contextDocument(project.objective), ...docs];
}

export async function GET(request: Request) {
  try {
    const params = new URL(request.url).searchParams;
    const repo = repository();
    const data = await (repo.scoped?.(["members", "accounts", "sessions", "projects"]) ?? repo).read();
    const me = await requireMember(request, data);
    const project = projectFor(data, me, params.get("project"));
    const id = params.get("doc");
    if (!id) return Response.json(documentsFor(project).map(({ id, title }) => ({ id, title })), { headers: privateHeaders });
    const doc = documentsFor(project).find(item => item.id === id);
    if (!doc) throw new AppError("File not found.", 404);
    const mode = params.get("mode");
    if (mode === "preview" || mode === "download") {
      const file = doc.file;
      if (mode === "preview" && file && !file.mimeType.startsWith("image/") && file.mimeType !== "application/pdf")
        throw new AppError("Unsupported inline format.", 400);
      const bytes = file ? Buffer.from(await attachmentStorage().get(file.storageName)) : doc.revisions.at(-1)?.body ?? "";
      const name = doc.title.replace(/[^a-zA-Z0-9._ -]/g, "_") || "download";
      return new Response(bytes, { headers: {
        ...privateHeaders,
        "Content-Type": mode === "download" ? "application/octet-stream" : file?.mimeType ?? "text/plain; charset=utf-8",
        "Content-Disposition": `${mode === "download" ? "attachment" : "inline"}; filename="${name}"; filename*=UTF-8''${encodeURIComponent(doc.title).replace(/'/g, "%27")}`,
      } });
    }
    return Response.json({
      id: doc.id, title: doc.title, mimeType: doc.file?.mimeType ?? null,
      body: doc.file?.previewText ?? doc.revisions.at(-1)?.body ?? "",
      version: doc.id === "context" && !project.documents?.some(item => item.id === "context") ? 0 : doc.revisions.length,
      history: doc.revisions.filter(entry => entry.at).map(({ authorName, at }) => ({ authorName, at })).reverse(),
    }, { headers: privateHeaders });
  } catch (error) { return errorResponse(error); }
}

export async function POST(request: Request) {
  try {
    const repo = repository();
    const me = await requireMember(request);
    const projectId = new URL(request.url).searchParams.get("project");
    const now = new Date().toISOString();
    const id = randomUUID();
    const revision = (body: string) => ({ body, at: now, authorId: me.id, authorName: me.name });
    if (request.headers.get("content-type")?.startsWith("multipart/form-data")) {
      projectFor(await repo.read(), me, projectId);
      const multipart = Buffer.from(await boundedBody(request, 4 * 1024 * 1024 + 32_768));
      const form = await new Response(multipart, {
        headers: { "Content-Type": request.headers.get("content-type")! },
      }).formData();
      const file = form.get("file");
      if (!(file instanceof File) || !file.size || file.size > 4 * 1024 * 1024)
        throw new AppError("Choose a file up to 4 MB.");
      const ext = file.name.split(".").at(-1)?.toLowerCase() ?? "";
      const mimeType = Object.hasOwn(mimeTypes, ext) ? mimeTypes[ext] : undefined;
      if (!mimeType) throw new AppError("Unsupported file format.");
      const bytes = Buffer.from(await file.arrayBuffer());
      const title = text(form.get("title"), "Title", 150);
      let previewText: string | undefined;
      if (mimeType === "text/plain") previewText = bytes.toString("utf8").slice(0, 120_000);
      if (mimeType === docx) {
        verifyDocxSize(bytes);
        try { previewText = (await extractRawText({ buffer: bytes })).value.slice(0, 120_000); }
        catch { throw new AppError("Could not read this DOCX."); }
      }
      await attachmentStorage().put(id, bytes, mimeType);
      await repo.transact(data => {
        const project = projectFor(data, currentMember(data, request), projectId);
        (project.documents ??= []).push({ id, title: title.toLowerCase().endsWith(`.${ext}`) ? title : `${title}.${ext}`,
          file: { name: file.name, storageName: id, mimeType, previewText }, revisions: [revision("")] });
      });
      return Response.json({ id });
    }
    const input = record(await jsonBody(request));
    const result = await repo.transact(data => {
      const project = projectFor(data, currentMember(data, request), projectId);
      if (input.action !== "markdown") throw new AppError("Unknown action.");
      const docs = project.documents ??= [];
      const body = text(input.body, "Markdown", 60_000, false);
      const existing = docs.find(item => item.id === input.id);
      if (input.id && (!existing && input.id !== "context" || existing?.file)) throw new AppError("Document not found.", 404);
      if (input.id && Number(input.version) !== (existing?.revisions.length ?? 0))
        throw new AppError("This document changed. Reopen it before saving.", 409);
      if (existing) {
        existing.revisions.push(revision(body));
        return { id: existing.id };
      }
      const rawTitle = input.id === "context" ? "context.md" : text(input.title, "Title", 150);
      const title = rawTitle.toLowerCase().endsWith(".md") ? rawTitle : `${rawTitle}.md`;
      if (!input.id && (title.toLowerCase() === "context.md" || docs.some(item => item.title.toLowerCase() === title.toLowerCase())))
        throw new AppError("A document already uses this name.", 409);
      docs.push({ id: input.id === "context" ? "context" : id, title, revisions: [revision(body)] });
      return { id: input.id === "context" ? "context" : id };
    });
    return Response.json(result);
  } catch (error) { return errorResponse(error); }
}
