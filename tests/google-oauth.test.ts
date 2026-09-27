import { describe, it, expect, vi } from "vitest";
import { createSeed } from "../src/persistence/seed";
import {
  beginGoogleOAuth,
  completeGoogleOAuth,
} from "../src/services/calendar-service";
import type { ServiceContext } from "../src/services/runtime";
function fixture() {
  const data = createSeed("test-only-password");
  const fetchMock = vi
    .fn()
    .mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          access_token: "test-access",
          refresh_token: "test-refresh",
        }),
      ),
    )
    .mockResolvedValueOnce(
      new Response(JSON.stringify({ id: "office@vouga-agency.pt" })),
    );
  const ctx: ServiceContext = {
    repo: {
      read: async () => structuredClone(data),
      transact: async (fn) => fn(data),
    },
    fetch: fetchMock,
    now: () => new Date().toISOString(),
    env: {
      INTEGRATION_ENCRYPTION_KEY: Buffer.alloc(32, 1).toString("base64"),
      GOOGLE_CLIENT_ID: "test",
      GOOGLE_CLIENT_SECRET: "test",
    },
  };
  return {
    data,
    ctx,
    fetchMock,
    me: data.members.find((m) => m.id === "miguel")!,
  };
}
describe("Google OAuth completion", () => {
  it("replays a completed callback without reusing the Google code or adding another sync", async () => {
    const { data, ctx, fetchMock, me } = fixture();
    const state = new URL(
      await beginGoogleOAuth(ctx, me, "office"),
    ).searchParams.get("state")!;
    await completeGoogleOAuth(ctx, me, state, "test-code");
    await completeGoogleOAuth(ctx, me, state, "test-code");
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(
      data.externalConnections.filter((c) => c.id === "google:office"),
    ).toHaveLength(1);
    expect(
      data.integrationJobs.filter((j) => j.kind === "calendar.pull"),
    ).toHaveLength(1);
    expect(data.oauthStates[0]).toMatchObject({
      status: "completed",
      verifier: "",
    });
  });
  it("rejects another user and expired state before contacting Google", async () => {
    const { data, ctx, fetchMock, me } = fixture();
    const state = new URL(
      await beginGoogleOAuth(ctx, me, "office"),
    ).searchParams.get("state")!;
    await expect(
      completeGoogleOAuth(ctx, { ...me, id: "other" }, state, "code"),
    ).rejects.toThrow("inválido");
    data.oauthStates[0].expiresAt = "2000-01-01T00:00:00Z";
    await expect(completeGoogleOAuth(ctx, me, state, "code")).rejects.toThrow(
      "expirado",
    );
    expect(fetchMock).not.toHaveBeenCalled();
  });
  it("does not exchange a code twice after failure", async () => {
    const { data, ctx, fetchMock, me } = fixture();
    fetchMock
      .mockReset()
      .mockResolvedValue(new Response("{}", { status: 400 }));
    const state = new URL(
      await beginGoogleOAuth(ctx, me, "office"),
    ).searchParams.get("state")!;
    await expect(completeGoogleOAuth(ctx, me, state, "code")).rejects.toThrow();
    expect(data.oauthStates[0]).toMatchObject({
      status: "failed",
      verifier: "",
    });
    await expect(completeGoogleOAuth(ctx, me, state, "code")).rejects.toThrow(
      "nova ligação",
    );
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
  it("blocks a simultaneous callback while the first exchange is running", async () => {
    const { ctx, fetchMock, me } = fixture();
    let release!: (r: Response) => void;
    fetchMock
      .mockReset()
      .mockImplementationOnce(
        () =>
          new Promise<Response>((r) => {
            release = r;
          }),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ id: "office@vouga-agency.pt" })),
      );
    const state = new URL(
      await beginGoogleOAuth(ctx, me, "office"),
    ).searchParams.get("state")!;
    const first = completeGoogleOAuth(ctx, me, state, "code");
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    await expect(completeGoogleOAuth(ctx, me, state, "code")).rejects.toThrow(
      "já está",
    );
    release(
      new Response(
        JSON.stringify({
          access_token: "test-access",
          refresh_token: "test-refresh",
        }),
      ),
    );
    await first;
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});
