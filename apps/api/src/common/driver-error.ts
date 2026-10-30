
export function logDriverFailure(caught: unknown, attempted: string): void {
  const words =
    caught instanceof Error
      ? `${caught.name}: ${caught.message}`
      : String(caught);
  console.error(`[api] could not ${attempted}: ${words}`);
}

export function driverFailure(
  caught: unknown,
  attempted: string,
): string | null {
  logDriverFailure(caught, attempted);
  const message = caught instanceof Error ? caught.message : "";
  if (
    message.includes("ECONNREFUSED") ||
    message.includes("Server selection timed out")
  ) {
    return "Nothing is listening on that host and port";
  }
  if (
    message.includes("password authentication failed") ||
    message.includes("Access denied") ||
    message.includes("Authentication failed")
  ) {
    return "That username and password were rejected";
  }
  return null;
}

export function structureFailure(caught: unknown): string {
  const refused = driverFailure(caught, "read that source's structure");
  if (refused !== null) {
    return refused;
  }
  const message = caught instanceof Error ? caught.message : "";
  if (message.includes("does not exist")) {
    return "That database does not exist";
  }
  if (message.includes("timeout")) {
    return "Reading the structure of that database took too long";
  }
  return "That data source's structure could not be read";
}
