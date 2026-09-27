import { requireMember } from "@/application/auth";
import { executeCommand } from "@/application/commands";
import { repository } from "@/persistence/store";
import { workspaceFor } from "@/projections/workspace";
import { errorResponse, jsonBody } from "@/foundation/http";
export async function GET(request: Request) {
  try {
    const me = await requireMember(request);
    return Response.json(
      workspaceFor(await repository().read(), me, new Date().toISOString()),
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    return errorResponse(error);
  }
}
export async function POST(request: Request) {
  try {
    const me = await requireMember(request);
    const input = await jsonBody(request);
    const result = await repository().transact((data) =>
      executeCommand(data, me, input),
    );
    return Response.json(
      {
        ...result,
        snapshot: workspaceFor(
          await repository().read(),
          me,
          new Date().toISOString(),
        ),
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    return errorResponse(error);
  }
}
