import { beforeEach, describe, it, expect, vi } from "vitest";
import { createSeed } from "../src/persistence/seed";
import { hashPassword } from "../src/persistence/password";
const state = vi.hoisted(() => ({
  data: null as unknown as ReturnType<typeof createSeed>,
}));
vi.mock("../src/persistence/store", () => ({
  repository: () => ({
    read: async () => structuredClone(state.data),
    transact: async (fn: (d: typeof state.data) => unknown) => {
      const copy = structuredClone(state.data);
      const result = fn(copy);
      state.data = copy;
      return result;
    },
  }),
}));
import {
  login,
  changePassword,
  sessionIdentity,
  authenticatedMember,
  requireMember,
  assertLocalRequest,
  secureSessionCookie,
} from "../src/application/auth";
beforeEach(() => {
  vi.unstubAllEnvs();
  vi.stubEnv("VOUGA_LOCAL_MODE", "1");
  state.data = createSeed("temporary-secret");
  const a = state.data.accounts.find((a) => a.memberId === "miguel")!;
  a.passwordHash = hashPassword("miguel123");
  a.mustChangePassword = true;
  a.temporaryExpiresAt = new Date(Date.now() + 86400000).toISOString();
});
describe("team access", () => {
  it("restricts temporary sessions, rotates all sessions on change and unlocks access", async () => {
    const first = await login("miguel", "miguel123");
    const second = await login("miguel", "miguel123");
    expect(first.mustChangePassword).toBe(true);
    expect(await authenticatedMember(first.token)).toBeNull();
    await expect(
      requireMember(
        new Request("http://127.0.0.1:3100/api/workspace", {
          headers: {
            host: "127.0.0.1:3100",
            cookie: `vouga_local_session=${first.token}`,
          },
        }),
      ),
    ).rejects.toThrow("Altera");
    await expect(changePassword(first.token, "short")).rejects.toThrow("12");
    const token = await changePassword(first.token, "a-new-private-password");
    expect(await sessionIdentity(first.token)).toBeNull();
    expect(await sessionIdentity(second.token)).toBeNull();
    expect((await authenticatedMember(token))?.id).toBe("miguel");
    await expect(login("miguel", "miguel123")).rejects.toThrow();
    expect(
      (await login("miguel", "a-new-private-password")).mustChangePassword,
    ).toBe(false);
  });
  it("persists failed attempts and rejects blocked, disabled and expired accounts", async () => {
    for (let i = 0; i < 5; i++)
      await expect(login("miguel", "incorrect")).rejects.toThrow();
    await expect(login("miguel", "miguel123")).rejects.toThrow("15 minutos");
    const account = state.data.accounts.find((a) => a.memberId === "miguel")!;
    delete account.lockedUntil;
    account.temporaryExpiresAt = "2000-01-01";
    await expect(login("miguel", "miguel123")).rejects.toThrow("expirou");
    state.data.accounts.find(a => a.memberId === "miguel")!.disabled = true;
    await expect(login("miguel", "miguel123")).rejects.toThrow("incorretos");
  });
  it("requires explicit HTTPS origin and rejects foreign host/origin", () => {
    vi.stubEnv("VOUGA_LOCAL_MODE", "0");
    vi.stubEnv("VOUGA_APP_ORIGIN", "https://os.vouga-agency.pt");
    expect(secureSessionCookie()).toBe(true);
    expect(() =>
      assertLocalRequest(
        new Request("http://localhost/api/session", {
          headers: {
            host: "os.vouga-agency.pt",
            origin: "https://os.vouga-agency.pt",
          },
        }),
        true,
      ),
    ).not.toThrow();
    expect(() =>
      assertLocalRequest(
        new Request("http://localhost/api/session", {
          headers: { host: "evil.test", origin: "https://os.vouga-agency.pt" },
        }),
        true,
      ),
    ).toThrow("Host");
    expect(() =>
      assertLocalRequest(
        new Request("http://localhost/api/session", {
          headers: { host: "os.vouga-agency.pt", origin: "https://evil.test" },
        }),
        true,
      ),
    ).toThrow("Origem");
  });
});
