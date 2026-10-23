import type { IAiProviderSpec } from "./catalog";

/**
 * How a provider is reached.
 *
 * A provider speaks a protocol, and a protocol knows its base URL and how to
 * list its models. The answer lives here so the model listing and the answer
 * itself cannot end up talking to different places.
 */
export type AiProtocol = "openai-compatible";

const PROTOCOLS: Record<AiProtocol, true> = {
  "openai-compatible": true,
};

/**
 * Whether this app can talk to a provider at all.
 *
 * A provider whose protocol has no adapter is not one the form offers: it
 * would save a key and then fail on the first question, which reads as a
 * broken key rather than an unsupported provider.
 */
export function speaksProtocol(spec: IAiProviderSpec): boolean {
  return spec.protocol in PROTOCOLS;
}

/**
 * The base URL a provider talks to: its own, unless it takes one from the
 * request. The URL is trimmed of its trailing slashes so the listing and the
 * answer build the same address from it.
 */
export function baseUrlFor(
  spec: IAiProviderSpec,
  given: string | null,
): string | null {
  if (!spec.needsBaseUrl) {
    return spec.baseUrl === "" ? null : spec.baseUrl.replace(/\/+$/, "");
  }
  if (given === null || given === "") {
    return null;
  }
  return given.replace(/\/+$/, "");
}
