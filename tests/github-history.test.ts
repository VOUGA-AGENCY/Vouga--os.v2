import { expect, it, vi } from "vitest";
import { generateKeyPairSync } from "node:crypto";
import { createSeed } from "@/persistence/seed";
import { linkRepository } from "@/services/github-service";
import type { ServiceContext } from "@/services/runtime";
it("imports existing commits on linking a repository and does not duplicate them on refresh", async () => {
  const now = "2026-09-27T10:00:00Z",
    data = createSeed("isolated-password", now);
  const key = generateKeyPairSync("rsa", { modulusLength: 2048 })
    .privateKey.export({ type: "pkcs8", format: "pem" })
    .toString();
  const ctx: ServiceContext = {
    repo: {
      read: async () => structuredClone(data),
      transact: async (fn) => fn(data),
    },
    now: () => now,
    env: {
      GITHUB_APP_ID: "123",
      GITHUB_INSTALLATION_ID: "456",
      GITHUB_APP_PRIVATE_KEY: key,
    },
    fetch: vi.fn(async (input) => {
      const url = String(input);
      let body: unknown;
      if (url.includes("access_tokens")) body = { token: "synthetic" };
      else if (url.includes("installation/repositories"))
        body = {
          repositories: [
            {
              id: 1,
              full_name: "test/repo",
              html_url: "https://github.com/test/repo",
            },
          ],
        };
      else if (url.includes("/pulls")) body = [];
      else if (url.includes("/commits"))
        body = [
          {
            sha: "abc1234567",
            html_url: "https://github.com/test/repo/commit/abc1234567",
            author: { login: "test" },
            commit: {
              message: "Existing commit",
              author: { name: "Test", date: now },
            },
          },
        ];
      else throw new Error("Unexpected request");
      return new Response(JSON.stringify(body), { status: 200 });
    }) as typeof fetch,
  };
  await linkRepository(ctx, data.members[0], "operations", 1);
  await linkRepository(ctx, data.members[0], "operations", 1);
  expect(data.activity.filter((a) => a.source === "github")).toHaveLength(1);
  expect(data.activity[0].summary).toContain("Existing commit");
  expect(data.activity[0].projectId).toBe("operations");
});
