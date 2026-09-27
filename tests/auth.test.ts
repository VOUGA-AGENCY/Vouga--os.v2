import { afterEach, expect, it } from "vitest";
import { assertLocalRequest } from "@/application/auth";
import { hashPassword, verifyPassword } from "@/persistence/password";
const prior = process.env.VOUGA_LOCAL_MODE;
afterEach(() => {
  if (prior === undefined) delete process.env.VOUGA_LOCAL_MODE;
  else process.env.VOUGA_LOCAL_MODE = prior;
});
it("supports Next URL normalization while validating browser origin against host and port", () => {
  process.env.VOUGA_LOCAL_MODE = "1";
  expect(() =>
    assertLocalRequest(
      new Request("http://localhost:3100/api/session", {
        method: "POST",
        headers: { host: "127.0.0.1:3100", origin: "http://127.0.0.1:3100" },
      }),
      true,
    ),
  ).not.toThrow();
});
it("rejects cross-origin, absent origin, remote host and disabled local mode", () => {
  process.env.VOUGA_LOCAL_MODE = "1";
  for (const origin of ["https://evil.example", "http://127.0.0.1:9999", ""])
    expect(() =>
      assertLocalRequest(
        new Request("http://localhost:3100/api/session", {
          method: "POST",
          headers: { host: "127.0.0.1:3100", origin },
        }),
        true,
      ),
    ).toThrow();
  expect(() =>
    assertLocalRequest(
      new Request("http://remote.example/api/workspace", {
        headers: { host: "remote.example" },
      }),
    ),
  ).toThrow();
  process.env.VOUGA_LOCAL_MODE = "0";
  expect(() =>
    assertLocalRequest(
      new Request("http://localhost:3100/api/workspace", {
        headers: { host: "localhost:3100" },
      }),
    ),
  ).toThrow();
});
it("salts password hashes and rejects an incorrect password", () => {
  const encoded = hashPassword("local-passphrase");
  expect(encoded).not.toBe(hashPassword("local-passphrase"));
  expect(verifyPassword("local-passphrase", encoded)).toBe(true);
  expect(verifyPassword("wrong", encoded)).toBe(false);
});
