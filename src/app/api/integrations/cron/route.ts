import { runtime, equal, required } from "@/services/runtime";
import { runIntegrationTick } from "@/services/integration-worker";
import { errorResponse } from "@/foundation/http";
import { AppError } from "@/domain/validation";
export async function POST(request: Request) {
  try {
    const ctx = runtime();
    if (
      !equal(
        `Bearer ${required(ctx.env, "INTEGRATION_CRON_SECRET")}`,
        request.headers.get("Authorization") || "",
      )
    )
      throw new AppError("Sem autorização.", 403);
    await runIntegrationTick(ctx);
    return Response.json({ ok: true });
  } catch (error) {
    return errorResponse(error);
  }
}
