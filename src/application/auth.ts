import "server-only";
import { createHash, randomBytes } from "node:crypto";
import type { Member } from "@/domain/model";
import { AppError } from "@/domain/validation";
import { repository } from "@/persistence/store";
import { hashPassword, verifyPassword } from "@/persistence/password";
export const SESSION_COOKIE = "vouga_local_session";
export const SESSION_AGE = 60 * 60 * 24 * 7;
const digest = (token: string) =>
  createHash("sha256").update(token).digest("hex");
export function appOrigin(env = process.env) {
  if (env.VOUGA_LOCAL_MODE === "1") return null;
  const origin = new URL(env.VOUGA_APP_ORIGIN || "https://invalid.invalid");
  if (
    !env.VOUGA_APP_ORIGIN ||
    origin.protocol !== "https:" ||
    origin.username ||
    origin.password ||
    origin.pathname !== "/" ||
    origin.search ||
    origin.hash
  )
    throw new AppError("Configura a origem HTTPS da aplicação.", 503);
  return origin.origin;
}
export function assertLocalRequest(request: Request, mutation = false) {
  const url = new URL(request.url),
    host = request.headers.get("host");
  const publicOrigin = appOrigin();
  let expected: string;
  if (publicOrigin) {
    if (host !== new URL(publicOrigin).host)
      throw new AppError("Host inválido.", 403);
    expected = publicOrigin;
  } else {
    if (
      !host ||
      !["localhost", "127.0.0.1"].includes(host.split(":")[0]) ||
      !["localhost", "127.0.0.1"].includes(url.hostname)
    )
      throw new AppError("Host local inválido.", 403);
    expected = `${url.protocol}//${host}`;
  }
  if (mutation && request.headers.get("origin") !== expected)
    throw new AppError("Origem do pedido inválida.", 403);
}
export function secureSessionCookie() {
  return appOrigin() !== null;
}
export function tokenFrom(request: Request) {
  return (
    request.headers
      .get("cookie")
      ?.split(";")
      .map((s) => s.trim())
      .find((s) => s.startsWith(`${SESSION_COOKIE}=`))
      ?.slice(SESSION_COOKIE.length + 1) ?? ""
  );
}
export async function sessionIdentity(
  token: string,
): Promise<{ member: Member; mustChangePassword: boolean } | null> {
  if (!/^[a-f0-9]{64}$/.test(token)) return null;
  const data = await repository().read();
  const now = new Date().toISOString();
  const session = data.sessions.find(
    (s) => s.hash === digest(token) && s.expiresAt > now,
  );
  if (!session) return null;
  const account = data.accounts.find((a) => a.memberId === session.memberId);
  const member = data.members.find((m) => m.id === session.memberId);
  if (
    !account ||
    account.disabled ||
    !member ||
    (account.mustChangePassword &&
      account.temporaryExpiresAt &&
      account.temporaryExpiresAt <= now)
  )
    return null;
  return { member, mustChangePassword: !!account.mustChangePassword };
}
export async function authenticatedMember(
  token: string,
): Promise<Member | null> {
  const identity = await sessionIdentity(token);
  return identity && !identity.mustChangePassword ? identity.member : null;
}
export async function requireMember(request: Request) {
  assertLocalRequest(request, request.method !== "GET");
  const identity = await sessionIdentity(tokenFrom(request));
  if (!identity) throw new AppError("A sessão terminou. Volta a entrar.", 401);
  if (identity.mustChangePassword)
    throw new AppError(
      "Altera a palavra-passe antes de aceder ao workspace.",
      403,
    );
  return identity.member;
}
export async function login(identifier: string, password: string) {
  const key = identifier.trim().toLowerCase();
  const token = randomBytes(32).toString("hex");
  const outcome = await repository().transact((data) => {
    const me = data.members.find(
      (m) => m.email.toLowerCase() === key || m.name.toLowerCase() === key,
    );
    const account = data.accounts.find((a) => a.memberId === me?.id);
    const now = Date.now();
    if (!me || !account || account.disabled)
      return { error: "Utilizador ou palavra-passe incorretos.", status: 401 };
    if (account.lockedUntil && Date.parse(account.lockedUntil) > now)
      return {
        error: "Demasiadas tentativas. Aguarda 15 minutos.",
        status: 429,
      };
    if (account.lockedUntil) {
      account.failedAttempts = 0;
      delete account.lockedUntil;
    }
    if (!verifyPassword(password, account.passwordHash)) {
      account.failedAttempts = (account.failedAttempts || 0) + 1;
      if (account.failedAttempts >= 5)
        account.lockedUntil = new Date(now + 15 * 60000).toISOString();
      return { error: "Utilizador ou palavra-passe incorretos.", status: 401 };
    }
    if (
      account.mustChangePassword &&
      account.temporaryExpiresAt &&
      Date.parse(account.temporaryExpiresAt) <= now
    )
      return {
        error:
          "A password temporária expirou. Pede um novo acesso ao administrador.",
        status: 401,
      };
    account.failedAttempts = 0;
    delete account.lockedUntil;
    const mustChangePassword = !!account.mustChangePassword;
    data.sessions = data.sessions.filter(
      (s) => s.expiresAt > new Date(now).toISOString(),
    );
    data.sessions.push({
      hash: digest(token),
      memberId: me.id,
      expiresAt: new Date(
        now + (mustChangePassword ? 600 : SESSION_AGE) * 1000,
      ).toISOString(),
    });
    return { mustChangePassword };
  });
  if ("error" in outcome) throw new AppError(outcome.error!, outcome.status);
  return { token, mustChangePassword: outcome.mustChangePassword! };
}
export async function changePassword(token: string, password: string) {
  if (!/^[a-f0-9]{64}$/.test(token)) throw new AppError("Volta a entrar.", 401);
  if (password.length < 12 || password.length > 200)
    throw new AppError("Usa entre 12 e 200 caracteres.");
  const replacement = randomBytes(32).toString("hex");
  const passwordHash = hashPassword(password);
  await repository().transact((data) => {
    const now = new Date().toISOString();
    const session = data.sessions.find(
      (s) => s.hash === digest(token) && s.expiresAt > now,
    );
    const account = data.accounts.find((a) => a.memberId === session?.memberId);
    if (
      !account ||
      account.disabled ||
      !account.mustChangePassword ||
      (account.temporaryExpiresAt && account.temporaryExpiresAt <= now)
    )
      throw new AppError("Pedido inválido. Volta a entrar.", 401);
    if (verifyPassword(password, account.passwordHash))
      throw new AppError("Escolhe uma password diferente da temporária.");
    account.passwordHash = passwordHash;
    account.mustChangePassword = false;
    account.failedAttempts = 0;
    delete account.lockedUntil;
    delete account.temporaryExpiresAt;
    data.sessions = data.sessions.filter(
      (s) => s.memberId !== account.memberId,
    );
    data.sessions.push({
      hash: digest(replacement),
      memberId: account.memberId,
      expiresAt: new Date(Date.now() + SESSION_AGE * 1000).toISOString(),
    });
  });
  return replacement;
}
export async function logout(token: string) {
  await repository().transact((data) => {
    data.sessions = data.sessions.filter((s) => s.hash !== digest(token));
  });
}
