import { createHmac } from "node:crypto";
import { runtime, equal, required, boundedBody } from "@/services/runtime";
import { enqueue } from "@/services/activity-service";
import { errorResponse } from "@/foundation/http";
import { AppError } from "@/domain/validation";
export async function POST(request: Request) {
  try {
    const ctx = runtime(),
      raw = await boundedBody(request, 2 * 1024 * 1024),
      signature = `sha256=${createHmac("sha256", required(ctx.env, "GITHUB_WEBHOOK_SECRET")).update(raw).digest("hex")}`;
    if (!equal(signature, request.headers.get("X-Hub-Signature-256") || ""))
      throw new AppError("Assinatura inválida.", 403);
    const event = request.headers.get("X-GitHub-Event") || "",
      delivery = request.headers.get("X-GitHub-Delivery") || "";
    if (!/^[\w-]{1,100}$/.test(delivery))
      throw new AppError("Entrega inválida.");
    if (["push", "pull_request", "pull_request_review"].includes(event)) {
      const body = JSON.parse(Buffer.from(raw).toString());
      if (String(body.installation?.id) !== ctx.env.GITHUB_INSTALLATION_ID)
        throw new AppError("Instalação não autorizada.", 403);
      await ctx.repo.transact((data) =>
        enqueue(
          data,
          `github:${delivery}`,
          "github.event",
          { delivery, event, body },
          ctx.now(),
        ),
      );
    }
    return Response.json({ accepted: true }, { status: 202 });
  } catch (error) {
    return errorResponse(error);
  }
}
