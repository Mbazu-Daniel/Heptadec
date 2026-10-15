import { BadRequestException } from "../exceptions";

export function readBody(payload: unknown, message: string): Record<string, unknown> {
  if (typeof payload !== "object" || payload === null) {
    throw new BadRequestException(message);
  }
  return payload as Record<string, unknown>;
}

export function readString(
  body: Record<string, unknown>,
  field: string,
  message: string,
  max?: number,
): string {
  const value = body[field];
  if (typeof value !== "string" || value.length === 0) {
    throw new BadRequestException(message);
  }
  if (max !== undefined && value.length > max) {
    throw new BadRequestException(message);
  }
  return value;
}

export function readOptionalString(
  body: Record<string, unknown>,
  field: string,
  message: string,
  max: number,
): string | undefined {
  const value = body[field];
  if (value === undefined || value === null) {
    return undefined;
  }
  return readString(body, field, message, max);
}

export function readStringList(
  body: Record<string, unknown>,
  field: string,
  message: string,
  max: number,
): string[] {
  const value = body[field];
  if (!Array.isArray(value) || value.length === 0) {
    throw new BadRequestException(message);
  }
  for (const entry of value) {
    if (typeof entry !== "string" || entry.length === 0 || entry.length > max) {
      throw new BadRequestException(message);
    }
  }
  return value as string[];
}
