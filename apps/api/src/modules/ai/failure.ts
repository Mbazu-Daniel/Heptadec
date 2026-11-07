import { driverFailure, logDriverFailure } from "../../common/driver-error";

export function failureMessage(
  caught: unknown,
  action: string,
  fallback: string,
): string {
  const provider = providerFailure(caught);
  if (provider !== null) {
    logDriverFailure(caught, action);
    return provider;
  }
  return driverFailure(caught, action) ?? fallback;
}

function providerFailure(caught: unknown): string | null {
  if (!isRecord(caught)) {
    return null;
  }
  const name = typeof caught.name === "string" ? caught.name : "";
  if (name === "EmptyResponseBodyError" || name === "NoContentGeneratedError") {
    return "That provider returned no answer. Check the model id and the base URL.";
  }
  const status = readStatus(caught);
  if (status === null) {
    return null;
  }
  return providerStatusSentence(status, messageOf(caught));
}

function readStatus(value: Record<string, unknown>): number | null {
  const code = value.statusCode ?? value.status;
  return typeof code === "number" && Number.isInteger(code) ? code : null;
}

function messageOf(value: Record<string, unknown>): string {
  if (typeof value.message === "string") {
    return value.message;
  }
  const body = value.responseBody;
  if (typeof body !== "string") {
    return "";
  }
  try {
    const parsed: unknown = JSON.parse(body);
    if (isRecord(parsed)) {
      const error = parsed.error;
      if (isRecord(error) && typeof error.message === "string") {
        return error.message;
      }
    }
  } catch {
    return "";
  }
  return "";
}

export function providerStatusSentence(
  status: number | undefined,
  detail: string,
): string | null {
  if (status === 401 || status === 403) {
    return "That provider rejected the API key.";
  }
  if (status === 404) {
    return "That model id was not found at that provider.";
  }
  if (
    status === 402 ||
    /insufficient (?:quota|credit)|out of (?:credit|fund|budget)|exceeded your current quota|credit balance/i.test(
      detail,
    )
  ) {
    return "That provider is out of credits.";
  }
  if (status === 429) {
    return "That provider is rate-limited or out of credits. Try again shortly.";
  }
  if (status === 408 || (status !== undefined && status >= 500)) {
    return "That provider could not be reached. Try again shortly.";
  }
  return null;
}

export function readJsonObject(text: string): Record<string, unknown> | null {
  const cleaned = text.replace(/```[a-z]*/gi, "").trim();
  const start = cleaned.indexOf("{");
  const end = cleaned.lastIndexOf("}");
  if (start < 0 || end <= start) {
    return null;
  }
  try {
    const parsed: unknown = JSON.parse(cleaned.slice(start, end + 1));
    return isRecord(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
