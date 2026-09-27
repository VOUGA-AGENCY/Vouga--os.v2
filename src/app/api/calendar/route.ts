import { requireMember } from "@/application/auth";
import { repository } from "@/persistence/store";
import { workspaceFor } from "@/projections/workspace";
import { calendarExport } from "@/projections/calendar-export";
import { errorResponse } from "@/foundation/http";
export async function GET(request: Request) {
  try {
    const me = await requireMember(request);
    const now = new Date().toISOString();
    const snapshot = workspaceFor(await repository().read(), me, now);
    return new Response(calendarExport(snapshot.meetings, now), {
      headers: {
        "Content-Type": "text/calendar; charset=utf-8",
        "Content-Disposition": "attachment; filename=vouga-agenda.ics",
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    return errorResponse(error);
  }
}
