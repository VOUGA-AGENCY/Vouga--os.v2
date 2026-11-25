import { createHash } from "node:crypto";
import { afterEach, expect, it, vi } from "vitest";
import { GET } from "@/app/api/files/route";
import { SupabaseAttachmentStorage } from "@/persistence/attachment-storage";
import { createSeed } from "@/persistence/seed";

const state = vi.hoisted(() => ({
  read: vi.fn(),
  fullRead: vi.fn(),
  scope: vi.fn(),
}));

vi.mock("@/persistence/store", () => ({
  repository: () => ({
    read: state.fullRead,
    scoped: state.scope,
  }),
}));

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
});

it("signs a stored attachment only after checking the requesting member can see its task", async () => {
  vi.stubEnv("VOUGA_LOCAL_MODE", "1");
  vi.stubEnv("VOUGA_STORAGE", "supabase");
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://demo.supabase.co");
  vi.stubEnv("SUPABASE_SECRET_KEY", "test-key");
  const data = createSeed("test-password");
  const task = data.tasks[0]!;
  Object.assign(task, { visibility: "private", ownerId: "miguel", assigneeIds: ["miguel"] });
  data.taskAttachments.push({
    id: "attachment", taskId: task.id, name: "Medições.pdf", storageName: "existing-file",
    size: 10, mimeType: "application/pdf", createdBy: "miguel", version: 1,
    createdAt: "2026-11-25", updatedAt: "2026-11-25",
  });
  const makeRequest = (memberId: string) => {
    const token = createHash("sha256").update(memberId).digest("hex");
    data.sessions.push({ hash: createHash("sha256").update(token).digest("hex"), memberId, expiresAt: "2099-01-01" });
    return new Request("http://127.0.0.1:3001/api/files?id=attachment", {
      headers: { host: "127.0.0.1:3001", cookie: `vouga_local_session=${token}` },
    });
  };
  state.scope.mockReturnValue({ read: state.read });
  state.read.mockResolvedValue(data);
  const url = "https://demo.supabase.co/storage/v1/object/sign/download";
  const sign = vi.spyOn(SupabaseAttachmentStorage.prototype, "signedUrl").mockResolvedValue(url);

  expect((await GET(makeRequest("vasco"))).status).toBe(404);
  expect(sign).not.toHaveBeenCalled();

  const result = await GET(makeRequest("miguel"));
  expect(result.status).toBe(302);
  expect(result.headers.get("location")).toBe(url);
  expect(result.headers.get("cache-control")).toBe("private, no-store");
  expect(sign).toHaveBeenCalledWith("existing-file", false, "Medições.pdf");
  expect(state.fullRead).not.toHaveBeenCalled();
});
