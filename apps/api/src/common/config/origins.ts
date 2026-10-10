import { config } from "./env";

function ownOrigins(request: Request): string[] {
  const host = request.headers.get("x-forwarded-host") ?? request.headers.get("host");
  if (host === null || host.trim() === "") {
    return [];
  }
  const name = host.trim();
  const forwarded = request.headers.get("x-forwarded-proto")?.split(",")[0]?.trim();
  if (forwarded === "http" || forwarded === "https") {
    return [`${forwarded}://${name}`];
  }
  return [`http://${name}`, `https://${name}`];
}

export function requestOrigins(request: Request | undefined): string[] {
  return [
    ...(request === undefined ? [] : ownOrigins(request)),
    new URL(config.betterAuthUrl).origin,
    ...config.extraOrigins,
  ];
}
