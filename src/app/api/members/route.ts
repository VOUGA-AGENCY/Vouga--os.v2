import { randomUUID } from "node:crypto";
import { identityFromStore, requireMember, tokenFrom } from "@/application/auth";
import type { Member, Store } from "@/domain/model";
import { isActiveMember } from "@/domain/team";
import { AppError, text } from "@/domain/validation";
import { errorResponse } from "@/foundation/http";
import { attachmentStorage } from "@/persistence/attachment-storage";
import { hashPassword } from "@/persistence/password";
import { repository } from "@/persistence/store";
import { boundedBody } from "@/services/runtime";

const photoLimit = 2 * 1024 * 1024;
const photoSignatures = {
  "image/jpeg": (bytes: Buffer) => bytes.subarray(0, 3).equals(Buffer.from([0xff, 0xd8, 0xff])),
  "image/png": (bytes: Buffer) => bytes.subarray(0, 8).equals(Buffer.from("89504e470d0a1a0a", "hex")),
  "image/webp": (bytes: Buffer) => bytes.toString("ascii", 0, 4) === "RIFF" && bytes.toString("ascii", 8, 12) === "WEBP",
};

function memberRepository() {
  const repo = repository();
  return repo.scoped?.(["members", "accounts", "sessions"]) ?? repo;
}

function assertNewEmail(data: Store, email: string) {
  const localPart = email.split("@")[0];
  if (data.members.some((member) =>
    member.email.toLowerCase() === email ||
    (!data.accounts.some((account) => account.memberId === member.id && account.workspaceEmailLogin) &&
      [member.id.toLowerCase(), member.name.toLowerCase()].includes(localPart)),
  )) throw new AppError("Este email já está associado a um membro.", 409);
}

export async function POST(request: Request) {
  try {
    const repo = memberRepository();
    const data = await repo.read();
    const me = await requireMember(request, data);
    if (me.role !== "admin") throw new AppError("Só um administrador pode criar membros.", 403);
    const contentType = request.headers.get("content-type") ?? "";
    if (!contentType.startsWith("multipart/form-data;")) throw new AppError("Formulário inválido.");
    const body = Buffer.from(await boundedBody(request, photoLimit + 32_768));
    const form = await new Request(request.url, {
      method: "POST", headers: { "Content-Type": contentType }, body,
    }).formData().catch(() => { throw new AppError("Não foi possível ler o formulário."); });
    const name = text(form.get("name"), "Nome", 120);
    const email = text(form.get("email"), "Email", 200).toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new AppError("Introduz um email válido.");
    assertNewEmail(data, email);
    const photo = form.get("photo");
    if (!(photo instanceof File) || !photo.size || photo.size > photoLimit)
      throw new AppError("Escolhe uma foto até 2 MB.");
    const bytes = Buffer.from(await photo.arrayBuffer());
    const mime = photo.type as keyof typeof photoSignatures;
    if (!Object.hasOwn(photoSignatures, mime) || !photoSignatures[mime](bytes))
      throw new AppError("Escolhe uma foto JPG, PNG ou WebP.");

    const password = process.env.VOUGA_ENGINEER_TEMP_PASSWORD;
    if (!password || password.length < 10 || password.length > 200 || password.trim() !== password)
      throw new AppError("Configura VOUGA_ENGINEER_TEMP_PASSWORD no servidor.", 503);
    const passwordHash = hashPassword(password);
    const temporaryExpiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
    const member: Member = { id: randomUUID(), name, email, role: "engineer", avatarMimeType: mime };
    const storage = attachmentStorage();
    await storage.put(member.id, bytes, mime);
    try {
      await repo.transact((current) => {
        const identity = identityFromStore(current, tokenFrom(request));
        if (identity?.member.role !== "admin" || identity.mustChangePassword)
          throw new AppError("Só um administrador pode criar membros.", 403);
        assertNewEmail(current, email);
        current.members.push(member);
        current.accounts.push({
          memberId: member.id, passwordHash, workspaceEmailLogin: true,
          mustChangePassword: true, temporaryExpiresAt,
        });
      });
    } catch (error) {
      // An uncertain database response can follow a successful commit.
      if (error instanceof AppError && [403, 409].includes(error.status))
        await storage.remove(member.id).catch(() => undefined);
      throw error;
    }
    return Response.json({ id: member.id, name, email, temporaryExpiresAt }, { status: 201 });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function GET(request: Request) {
  try {
    const data = await memberRepository().read();
    await requireMember(request, data);
    const id = new URL(request.url).searchParams.get("avatar");
    const member = data.members.find((item) => item.id === id && isActiveMember(item));
    if (!member?.avatarMimeType || !Object.hasOwn(photoSignatures, member.avatarMimeType))
      throw new AppError("Foto indisponível.", 404);
    const bytes = await attachmentStorage().get(member.id);
    return new Response(Buffer.from(bytes), { headers: {
      "Content-Type": member.avatarMimeType,
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
    } });
  } catch (error) {
    return errorResponse(error);
  }
}
