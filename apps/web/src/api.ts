import type {
  IMe,
  IProvider,
  IProvidersResponse,
} from "@heptadec/api/auth-contracts";

async function request<T>(path: string, method = "GET"): Promise<T> {
  const res = await fetch(path, {
    method,
    headers: { "content-type": "application/json" },
  });
  const body: unknown = await res.json();
  if (!res.ok) {
    const message =
      (body as { error?: { message?: string } }).error?.message ?? res.statusText;
    throw new Error(message);
  }
  return body as T;
}

export function fetchMe(): Promise<IMe> {
  return request<IMe>("/api/me");
}

export async function completeOnboarding(): Promise<void> {
  await request("/api/onboarding/complete", "POST");
}

export async function listProviders(): Promise<IProvider[]> {
  const res = await fetch("/api/providers");
  if (!res.ok) {
    return [];
  }
  const body = (await res.json()) as IProvidersResponse;
  return Array.isArray(body.providers) ? body.providers : [];
}