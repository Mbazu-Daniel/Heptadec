import { BadRequestException } from "../../common/exceptions/index";
import { providerSpec } from "./catalog";
import type { IAiProviderSpec, IProviderEndpoint } from "./types";

const PROTOCOLS: Record<IAiProviderSpec["protocol"], boolean> = {
  "openai-compatible": true,
  anthropic: false,
};

export const speaksProtocol = (spec: IAiProviderSpec): boolean =>
  PROTOCOLS[spec.protocol];

export const baseUrlFor = (
  spec: IAiProviderSpec,
  given: string | null,
): string | null => {
  if (!spec.needsBaseUrl) {
    return spec.baseUrl === "" ? null : spec.baseUrl.replace(/\/+$/, "");
  }
  if (given === null || given === "") {
    return null;
  }
  return given.replace(/\/+$/, "");
};

export const providerEndpointFor = (
  provider: string,
  baseUrl: string | null,
): IProviderEndpoint => {
  const spec = providerSpec(provider);
  if (spec === null) {
    throw new BadRequestException(`Unknown AI provider ${provider}`);
  }
  const url = baseUrlFor(spec, baseUrl);
  if (url === null) {
    throw new BadRequestException(`${spec.label} needs a base URL`);
  }
  return { spec, baseUrl: url };
};
