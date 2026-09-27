import { requireMember } from "@/application/auth";
import { runtime } from "@/services/runtime";
import { beginGoogleOAuth } from "@/services/calendar-service";
import { errorResponse, jsonBody } from "@/foundation/http";
import { choice, record } from "@/domain/validation";
export async function POST(request: Request) {
  try {
    const me = await requireMember(request),
      body = record(await jsonBody(request)),
      key = choice(
        body.calendarKey,
        ["office", "contacto"] as const,
        "Calendário",
      );
    return Response.json({ url: await beginGoogleOAuth(runtime(), me, key) });
  } catch (error) {
    return errorResponse(error);
  }
}
