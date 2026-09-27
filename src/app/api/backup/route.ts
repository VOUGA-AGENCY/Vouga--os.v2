import { requireMember } from "@/application/auth";
import { allow } from "@/domain/permissions";
import { repository } from "@/persistence/store";
import { workspaceFor } from "@/projections/workspace";
import { errorResponse } from "@/foundation/http";
export async function GET(request: Request) {
  try {
    const me = await requireMember(request);
    allow(me.role === "admin");
    const snapshot = workspaceFor(
      await repository().read(),
      me,
      new Date().toISOString(),
    );
    return Response.json(
      {
        format: "vouga-workspace-export",
        version: 1,
        exportedAt: snapshot.now,
        data: snapshot,
      },
      {
        headers: {
          "Content-Disposition": "attachment; filename=vouga-workspace.json",
          "Cache-Control": "no-store",
        },
      },
    );
  } catch (error) {
    return errorResponse(error);
  }
}
