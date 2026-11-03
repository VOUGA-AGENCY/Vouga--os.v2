/** Server-side, opt-in. Missing configuration must never start Telegram work. */
export function telegramEnabled(env: Record<string, string | undefined> = process.env): boolean {
  return env.TELEGRAM_ENABLED === "true";
}
