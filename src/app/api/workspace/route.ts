import {
  assertLocalRequest,
  identityFromStore,
  requireMember,
  tokenFrom,
} from "@/application/auth";
import { executeCommand } from "@/application/commands";
import { repository } from "@/persistence/store";
import { workspaceFor } from "@/projections/workspace";
import { snapshotChanges } from "@/projections/changes";
import { AppError } from "@/domain/validation";
import { errorResponse, jsonBody } from "@/foundation/http";
export async function GET(request: Request) {
  try {
    assertLocalRequest(request);
    if (!/^[a-f0-9]{64}$/.test(tokenFrom(request)))
      throw new AppError("Please sign in again.", 401);
    const data = await repository().read();
    const me = await requireMember(request, data);
    const etag = `"${me.id}:${data.revision}"`;
    const headers = {
      "Cache-Control": "private, no-cache",
      ETag: etag,
      Vary: "Cookie",
    };
    if (request.headers.get("if-none-match") === etag)
      return new Response(null, { status: 304, headers });
    return Response.json(workspaceFor(data, me, new Date().toISOString()), {
      headers,
    });
  } catch (error) {
    return errorResponse(error);
  }
}
export async function POST(request: Request) {
  try {
    assertLocalRequest(request, true);
    const token = tokenFrom(request);
    if (!/^[a-f0-9]{64}$/.test(token))
      throw new AppError("Please sign in again.", 401);
    const input = await jsonBody(request);
    const baseRevision = Number(
      request.headers.get("x-workspace-revision") ?? -1,
    );
    const result = await repository().transact((data) => {
      const identity = identityFromStore(data, token);
      if (!identity)
        throw new AppError("The session ended. Please sign in again.", 401);
      if (identity.mustChangePassword)
        throw new AppError(
          "Change your password before accessing the workspace.",
          403,
        );
      const now = new Date().toISOString();
      const before =
        baseRevision === data.revision
          ? structuredClone(workspaceFor(data, identity.member, now))
          : null;
      const result = executeCommand(data, identity.member, input, now);
      // Both repositories increment revision once on commit. No second read: the
      // returned projection belongs to this exact successful transaction.
      const snapshot = workspaceFor(
        { ...data, revision: data.revision + 1 },
        identity.member,
        now,
      );
      return before
        ? { ...result, patch: snapshotChanges(before, snapshot) }
        : { ...result, snapshot };
    });
    return Response.json(result, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return errorResponse(error);
  }
}
