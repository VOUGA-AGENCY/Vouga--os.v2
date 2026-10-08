import { requireMember } from "@/application/auth";
import { runtime } from "@/services/runtime";
import { completeGoogleOAuth } from "@/services/calendar-service";
import { errorResponse } from "@/foundation/http";
import { AppError } from "@/domain/validation";
const escape = (value: string) =>
  value
    .replaceAll("&", "&amp;")
    .replaceAll('"', "&quot;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
// Keep the existing SameSite=Strict session. The cross-site OAuth redirect only
// renders a form; its same-origin POST receives the session and verifies state.
export async function GET(request: Request) {
  const url = new URL(request.url);
  if (url.searchParams.has("error"))
    return errorResponse(new AppError("Google authorization canceled."));
  const state = url.searchParams.get("state") || "",
    code = url.searchParams.get("code") || "";
  if (!/^[a-f0-9]{64}$/.test(state) || !code || code.length > 4096)
    return errorResponse(new AppError("Invalid OAuth response."));
  return new Response(
    `<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>Connect Google Calendar · Vouga OS</title><body><main><h1>Complete Google Calendar connection</h1><p>Continue with your Vouga OS session. Account permissions will not change.</p><form method="post" action="/api/integrations/google/callback"><input type="hidden" name="state" value="${escape(state)}"><input type="hidden" name="code" value="${escape(code)}"><button type="submit">Complete connection</button></form></main></body></html>`,
    {
      headers: {
        "Content-Type": "text/html; charset=utf-8",
        "Cache-Control": "no-store",
        "Referrer-Policy": "no-referrer",
        "Content-Security-Policy":
          "default-src 'none'; form-action 'self'; frame-ancestors 'none'; base-uri 'none'",
      },
    },
  );
}
export async function POST(request: Request) {
  try {
    const me = await requireMember(request);
    const form = await request.formData();
    await completeGoogleOAuth(
      runtime(),
      me,
      String(form.get("state") || ""),
      String(form.get("code") || ""),
    );
    return Response.redirect(new URL("/settings", request.headers.get("origin")!), 303);
  } catch (error) {
    const message =
      error instanceof AppError
        ? error.message
        : "Could not complete the connection. Check its status in Settings.";
    return new Response(
      `<!doctype html><html lang="en"><meta charset="utf-8"><title>Google connection · Vouga OS</title><body><main><h1>Google Calendar connection</h1><p>${escape(message)}</p><p>If you already completed this request, the connection may be active.</p><a href="/settings">Return to Settings and check the connection</a></main></body></html>`,
      {
        status: error instanceof AppError ? error.status : 500,
        headers: {
          "Content-Type": "text/html; charset=utf-8",
          "Cache-Control": "no-store",
          "Referrer-Policy": "no-referrer",
          "Content-Security-Policy":
            "default-src 'none'; frame-ancestors 'none'; base-uri 'none'",
        },
      },
    );
  }
}
