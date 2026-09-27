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
    return errorResponse(new AppError("Autorização Google cancelada."));
  const state = url.searchParams.get("state") || "",
    code = url.searchParams.get("code") || "";
  if (!/^[a-f0-9]{64}$/.test(state) || !code || code.length > 4096)
    return errorResponse(new AppError("Resposta OAuth inválida."));
  return new Response(
    `<!doctype html><html lang="pt"><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>Ligar Google Calendar · Vouga OS</title><body><main><h1>Concluir ligação ao Google Calendar</h1><p>Continua com a tua sessão Vouga OS. As permissões da conta não mudam.</p><form method="post" action="/api/integrations/google/callback"><input type="hidden" name="state" value="${escape(state)}"><input type="hidden" name="code" value="${escape(code)}"><button type="submit">Concluir ligação</button></form></main></body></html>`,
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
        : "Não foi possível concluir a ligação. Consulta o estado em Settings.";
    return new Response(
      `<!doctype html><html lang="pt"><meta charset="utf-8"><title>Ligação Google · Vouga OS</title><body><main><h1>Ligação ao Google Calendar</h1><p>${escape(message)}</p><p>Se já concluíste este pedido, a ligação pode estar ativa.</p><a href="/settings">Voltar a Settings e verificar ligação</a></main></body></html>`,
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
