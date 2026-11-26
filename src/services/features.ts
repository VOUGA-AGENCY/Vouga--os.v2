/** An explicit kill switch takes precedence over the existing bot configuration. */
export function telegramEnabled(
  env: Record<string, string | undefined> = process.env,
): boolean {
  if (env.TELEGRAM_ENABLED !== undefined)
    return env.TELEGRAM_ENABLED === "true";
  return (
    !!env.TELEGRAM_BOT_TOKEN &&
    env.VOUGA_LOCAL_MODE !== "1" &&
    (!env.VERCEL_ENV || env.VERCEL_ENV === "production")
  );
}
