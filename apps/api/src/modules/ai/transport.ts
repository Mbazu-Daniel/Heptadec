import type { IAiProviderSpec } from "./catalog";
import { providerSpec } from "./catalog";
import { BadRequestException } from "../../common/exceptions";

export type AiProtocol = "openai-compatible";

const PROTOCOLS: Record<AiProtocol, true> = {
  "openai-compatible": true,
};

export function speaksProtocol(spec: IAiProviderSpec): boolean {
  return spec.protocol in PROTOCOLS;
}

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
