import { NextResponse } from "next/server";
import {
  assertLocalRequest,
  login,
  changePassword,
  secureSessionCookie,
  logout,
  SESSION_AGE,
  SESSION_COOKIE,
  tokenFrom,
} from "@/application/auth";
import { AppError, record, text } from "@/domain/validation";
import { errorResponse, jsonBody } from "@/foundation/http";
export async function POST(request: Request) {
  try {
    assertLocalRequest(request, true);
    const input = record(await jsonBody(request));
    const { token, mustChangePassword } = await login(
      text(input.email, "Email", 200),
      text(input.password, "Palavra-passe", 200),
    );
    const response = NextResponse.json({ ok: true, mustChangePassword });
    response.cookies.set(SESSION_COOKIE, token, {
      httpOnly: true,
      sameSite: "strict",
      path: "/",
      maxAge: mustChangePassword ? 600 : SESSION_AGE,
      secure: secureSessionCookie(),
    });
    return response;
  } catch (error) {
    return errorResponse(error);
  }
}
export async function DELETE(request: Request) {
  try {
    assertLocalRequest(request, true);
    await logout(tokenFrom(request));
    const response = NextResponse.json({ ok: true });
    response.cookies.delete(SESSION_COOKIE);
    return response;
  } catch (error) {
    return errorResponse(error);
  }
}

export async function PATCH(request: Request) {
  try {
    assertLocalRequest(request, true);
    const input = record(await jsonBody(request));
    const password = text(input.password, "Palavra-passe", 200);
    if (password !== input.confirmation)
      throw new AppError("Passwords do not match.");
    const token = await changePassword(tokenFrom(request), password);
    const response = NextResponse.json({ ok: true });
    response.cookies.set(SESSION_COOKIE, token, {
      httpOnly: true,
      sameSite: "strict",
      path: "/",
      maxAge: SESSION_AGE,
      secure: secureSessionCookie(),
    });
    return response;
  } catch (error) {
    return errorResponse(error);
  }
}
