import "server-only";
import { AppError } from "@/domain/validation";

type PasswordGrantResponse = {
  user?: { email?: string | null };
};

export async function verifySupabasePassword(
  email: string,
  password: string,
): Promise<string | null> {
  const origin = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!origin || !key)
    throw new AppError("Configura o Supabase Auth no servidor.", 503);

  let response: Response;
  try {
    response = await fetch(
      `${new URL(origin).origin}/auth/v1/token?grant_type=password`,
      {
        method: "POST",
        cache: "no-store",
        signal: AbortSignal.timeout(15_000),
        headers: { apikey: key, "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      },
    );
  } catch {
    throw new AppError("The authentication service is unavailable.", 503);
  }

  if ([400, 401].includes(response.status)) return null;
  if (!response.ok)
    throw new AppError("The authentication service rejected the request.", 503);

  const payload = (await response.json()) as PasswordGrantResponse;
  return payload.user?.email?.trim().toLowerCase() || null;
}
