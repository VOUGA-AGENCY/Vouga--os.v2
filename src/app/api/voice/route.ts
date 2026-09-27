import { requireMember } from "@/application/auth";
import { runtime, boundedBody } from "@/services/runtime";
import { transcribe } from "@/services/transcription-service";
import { runAgent } from "@/services/agent-service";
import { errorResponse } from "@/foundation/http";
export async function POST(request: Request) {
  try {
    const me = await requireMember(request),
      ctx = runtime();
    const bytes = await boundedBody(request, 24 * 1024 * 1024),
      transcript = await transcribe(
        ctx,
        new Blob([new Uint8Array(bytes)], {
          type: request.headers.get("Content-Type") || "audio/webm",
        }),
      );
    const params = new URL(request.url).searchParams;
    const result = await runAgent(
      ctx,
      me,
      transcript,
      request.headers.get("X-Request-Id") || crypto.randomUUID(),
      {
        projectId: params.get("projectId") || undefined,
        companyId: params.get("companyId") || undefined,
        taskId: params.get("taskId") || undefined,
      },
    );
    return Response.json({ ...result, transcript });
  } catch (error) {
    return errorResponse(error);
  }
}
