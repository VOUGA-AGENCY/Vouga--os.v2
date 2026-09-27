import "server-only";
import {
  createCipheriv,
  createDecipheriv,
  randomBytes,
  createHash,
  timingSafeEqual,
} from "node:crypto";
import { AppError } from "@/domain/validation";
import { repository, type WorkspaceRepository } from "@/persistence/store";
export interface ServiceContext {
  repo: WorkspaceRepository;
  fetch: typeof fetch;
  now: () => string;
  env: Record<string, string | undefined>;
}
export const runtime = (): ServiceContext => ({
  repo: repository(),
  fetch,
  now: () => new Date().toISOString(),
  env: process.env,
});
export function required(env: Record<string, string | undefined>, key: string) {
  const value = env[key];
  if (!value) throw new AppError(`Configura ${key} no servidor.`, 503);
  return value;
}
export const hash = (value: string) =>
  createHash("sha256").update(value).digest("hex");
export function equal(a: string, b: string) {
  const x = Buffer.from(a),
    y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}
export function seal(value: unknown, env: Record<string, string | undefined>) {
  const key = Buffer.from(
    required(env, "INTEGRATION_ENCRYPTION_KEY"),
    "base64",
  );
  if (key.length !== 32)
    throw new AppError(
      "INTEGRATION_ENCRYPTION_KEY deve conter 32 bytes em base64.",
      503,
    );
  const iv = randomBytes(12),
    cipher = createCipheriv("aes-256-gcm", key, iv);
  const encrypted = Buffer.concat([
    cipher.update(JSON.stringify(value)),
    cipher.final(),
  ]);
  return [iv, cipher.getAuthTag(), encrypted]
    .map((part) => part.toString("base64"))
    .join(".");
}
export function unseal<T>(
  value: string,
  env: Record<string, string | undefined>,
): T {
  const [iv, tag, encrypted] = value
    .split(".")
    .map((part) => Buffer.from(part, "base64"));
  const decipher = createDecipheriv(
    "aes-256-gcm",
    Buffer.from(required(env, "INTEGRATION_ENCRYPTION_KEY"), "base64"),
    iv,
  );
  decipher.setAuthTag(tag);
  return JSON.parse(
    Buffer.concat([decipher.update(encrypted), decipher.final()]).toString(),
  );
}
export class ProviderError extends Error {
  constructor(
    public provider: string,
    public status: number,
  ) {
    super(`${provider}: HTTP ${status}`);
  }
}
export async function api<T>(
  ctx: ServiceContext,
  provider: string,
  url: string,
  options: RequestInit = {},
): Promise<T> {
  const response = await ctx.fetch(url, {
    ...options,
    signal: AbortSignal.timeout(25000),
  });
  if (!response.ok) throw new ProviderError(provider, response.status);
  if (response.status === 204) return undefined as T;
  return response.json() as Promise<T>;
}
export async function connectionError(
  ctx: ServiceContext,
  id: string,
  error: unknown,
) {
  const message =
    error instanceof ProviderError
      ? error.message
      : "Falha de ligação. Tenta novamente.";
  console.error(JSON.stringify({ service: id, error: message, at: ctx.now() }));
  await ctx.repo.transact((data) => {
    const connection = data.externalConnections.find((item) => item.id === id);
    if (connection) {
      connection.lastError = message;
      connection.status = "error";
    }
  });
}
export function publicOrigin(env: Record<string, string | undefined>) {
  const origin = required(env, "VOUGA_PUBLIC_URL");
  const url = new URL(origin);
  if (url.protocol !== "https:" || url.pathname !== "/")
    throw new AppError(
      "VOUGA_PUBLIC_URL precisa de uma origem HTTPS pública.",
      503,
    );
  return url.origin;
}
export async function boundedBody(request: Request, maximum: number) {
  const reader = request.body?.getReader();
  if (!reader) return new Uint8Array();
  const parts: Uint8Array[] = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.length;
    if (size > maximum) {
      await reader.cancel();
      throw new AppError("Pedido demasiado grande.", 413);
    }
    parts.push(value);
  }
  return Buffer.concat(parts);
}
