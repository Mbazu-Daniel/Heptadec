import type { IAiProviderSpec } from "./catalog";
import { providerSpec } from "./catalog";
import { BadRequestException } from "../../common/exceptions";

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

export interface IProviderEndpoint {
  spec: IAiProviderSpec;
  baseUrl: string;
}

/**
 * Resolve a provider to the endpoint it answers on: its spec found and its
 * base URL normalised. Every call to an AI Provider — the streamed answers
 * and the model listing — resolves through this one interface, so the two
 * cannot end up talking to different places. It refuses an unknown provider
 * or one without an address.
 */
export function providerEndpointFor(
  provider: string,
  baseUrl: string | null,
): IProviderEndpoint {
  const spec = providerSpec(provider);
  if (spec === null) {
    throw new BadRequestException(`Unknown AI provider ${provider}`);
  }
  const url = baseUrlFor(spec, baseUrl);
  if (url === null) {
    throw new BadRequestException(`${spec.label} needs a base URL`);
  }
  return { spec, baseUrl: url };
}
