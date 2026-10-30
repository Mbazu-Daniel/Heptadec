import { BadRequestException } from "../exceptions";

export function isJsonObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function readBody(payload: unknown, message: string): Record<string, unknown> {
  if (!isJsonObject(payload)) {
    throw new BadRequestException(message);
  }
  return payload;
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

export function readStringOrKeep(
  body: Record<string, unknown>,
  field: string,
  keep: string,
  message: string,
  max?: number,
): string {
  const value = body[field];
  if (value === undefined || value === null || value === "") {
    return keep;
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
  return value.map((entry) => {
    if (typeof entry !== "string" || entry.length === 0 || entry.length > max) {
      throw new BadRequestException(message);
    }
    return entry;
  });
}
