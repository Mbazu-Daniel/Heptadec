/**
 * What to do with an error a driver hands back.
 *
 * The rule is that the driver's own words go to the operator's log and are never
 * handed to the caller: they name hosts, users, certificates and internal states
 * the caller has no business seeing. It was re-decided at every catch site,
 * which is how three of them came to keep only the caller-facing half — a
 * notification channel whose sealed config would not parse was reported as
 * unreachable, with nothing logged at all — and how two of them came to hold the
 * same sentences, so a fix to the wording had to be made twice.
 */

/**
 * The driver's own words, written for the operator.
 *
 * An answer that is a status rather than a sentence — a model listing that could
 * not be fetched, say — owes the operator this much before it returns.
 */
export function logDriverFailure(caught: unknown, attempted: string): void {
  console.error(`[api] could not ${attempted}:`, caught);
}

/**
 * The app's sentence for the driver's error, or nothing when the message names
 * no condition the app has words for — in which case the caller's own sentence
 * about what it was attempting stands.
 *
 * Only conditions that read the same whatever was attempted are answered here.
 * "does not exist" is deliberately not one of them: an absent database and an
 * absent table are the same words to a driver and different news to a caller.
 */
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

/**
 * What the caller is told when a source's structure could not be read. One
 * function rather than one per reader, because every reader is asked the same
 * question and answers with the same sentences.
 */
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
