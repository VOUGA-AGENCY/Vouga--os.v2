export class AppError extends Error {
  constructor(
    message: string,
    public status = 400,
  ) {
    super(message);
    this.name = "AppError";
  }
}
export function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new AppError("Invalid request.");
  return value as Record<string, unknown>;
}
export function text(
  value: unknown,
  label: string,
  max = 200,
  required = true,
): string {
  if (typeof value !== "string") {
    if (!required && value == null) return "";
    throw new AppError(`${label}: invalid text.`);
  }
  const clean = value.trim();
  if (required && !clean) throw new AppError(`${label} is required.`);
  if (clean.length > max)
    throw new AppError(`${label}: maximum ${max} characters.`);
  return clean;
}
export function choice<T extends string>(
  value: unknown,
  values: readonly T[],
  label: string,
): T {
  if (typeof value !== "string" || !values.includes(value as T))
    throw new AppError(`${label} is invalid.`);
  return value as T;
}
export function boolean(value: unknown, fallback = false) {
  if (value === undefined) return fallback;
  if (typeof value !== "boolean") throw new AppError("Invalid value.");
  return value;
}
export function stringList(value: unknown): string[] {
  if (
    !Array.isArray(value) ||
    value.length > 50 ||
    value.some((x) => typeof x !== "string")
  )
    throw new AppError("Invalid list.");
  return [...new Set(value)] as string[];
}
export function version(entity: { version: number }, input: unknown) {
  if (entity.version !== input)
    throw new AppError(
      "This record was changed in the meantime. Close and reopen it to use the current version.",
      409,
    );
}
