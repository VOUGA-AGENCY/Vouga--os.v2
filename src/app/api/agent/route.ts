import { requireMember } from "@/application/auth";
import { runtime } from "@/services/runtime";
import {
  runAgent,
  decideAction,
  summarizeMyWork,
} from "@/services/agent-service";
import { errorResponse, jsonBody } from "@/foundation/http";
import { record, text } from "@/domain/validation";
export async function POST(request: Request) {
  try {
    const me = await requireMember(request),
      body = record(await jsonBody(request)),
      ctx = runtime();
    if (body.summary === true)
      return Response.json(await summarizeMyWork(ctx, me));
    if (body.pendingId)
      return Response.json(
        await decideAction(
          ctx,
          me,
          text(body.pendingId, "Action", 100),
          body.confirm === true,
        ),
      );
    const context = record(body.context ?? {});
    return Response.json(
      await runAgent(
        ctx,
        me,
        text(body.text, "Mensagem", 8000),
        text(body.key, "Pedido", 150),
        {
          projectId:
            typeof context.projectId === "string"
              ? context.projectId
              : undefined,
          companyId:
            typeof context.companyId === "string"
              ? context.companyId
              : undefined,
          taskId:
            typeof context.taskId === "string" ? context.taskId : undefined,
        },
      ),
    );
  } catch (error) {
    return errorResponse(error);
  }
}
