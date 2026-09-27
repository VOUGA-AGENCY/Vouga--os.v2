import { randomUUID } from "node:crypto";
import { attachmentStorage } from "@/persistence/attachment-storage";
import { requireMember } from "@/application/auth";
import { canSeeTask } from "@/domain/permissions";
import { AppError } from "@/domain/validation";
import { errorResponse } from "@/foundation/http";
import { repository } from "@/persistence/store";

const allowedTypes = new Set([
  "image/png", "image/jpeg", "image/webp", "application/pdf", "text/plain",
  "application/msword", "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.ms-excel", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
]);

export async function POST(request: Request) {

  try {
    const me = await requireMember(request);
    const form = await request.formData();
    const taskId = form.get("taskId");
    const file = form.get("file");
    if (typeof taskId !== "string" || !(file instanceof File)) throw new AppError("Escolhe a tarefa e o ficheiro.");
    if (!file.size || file.size > 20 * 1024 * 1024) throw new AppError("O ficheiro deve ter até 20 MB.");
    if (!allowedTypes.has(file.type)) throw new AppError("Formato de ficheiro não suportado.");
    const data = await repository().read();
    const task = data.tasks.find((item) => item.id === taskId);
    if (!task || !canSeeTask(me, task, data)) throw new AppError("Tarefa não encontrada.", 404);
    const storageName = randomUUID();
    await attachmentStorage().put(storageName, new Uint8Array(await file.arrayBuffer()), file.type);
    const now = new Date().toISOString();
    await repository().transact((store) => {
      const current = store.tasks.find((item) => item.id === taskId);
      if (!current || !canSeeTask(me, current, store)) throw new AppError("Tarefa não encontrada.", 404);
      store.taskAttachments.push({ id: randomUUID(), version: 1, createdAt: now,
        updatedAt: now, createdBy: me.id, taskId, name: file.name.slice(0, 200),
        mimeType: file.type, size: file.size, storageName });
      current.version++;
      current.updatedAt = now;
    });
    return Response.json({ ok: true });
  } catch (error) {
    // A failed response may follow a committed transaction. Keep the uploaded
    // object until reconciliation instead of deleting an attachment in use.
    return errorResponse(error);
  }
}

export async function GET(request: Request) {
  try {
    const me = await requireMember(request);
    const id = new URL(request.url).searchParams.get("id");
    const data = await repository().read();
    const attachment = data.taskAttachments.find((item) => item.id === id);
    const task = data.tasks.find((item) => item.id === attachment?.taskId);
    if (!attachment || !task || !canSeeTask(me, task, data)) throw new AppError("Ficheiro não encontrado.", 404);
    const bytes = await attachmentStorage().get(attachment.storageName);
    const safeName = attachment.name.replace(/[\r\n"\\]/g, "_");
    return new Response(Buffer.from(bytes), { headers: {
      "Content-Type": attachment.mimeType,
      "Content-Disposition": `attachment; filename="${safeName}"`,
      "Cache-Control": "private, no-store",
    } });
  } catch (error) { return errorResponse(error); }
}
