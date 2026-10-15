import { BadGatewayException } from "../../common/exceptions";
import { endpointAddress } from "./connection";
import type { IStoredConnection } from "./connection";

/** How long Quickwit has to answer before the request is given up on. */
export const QUICKWIT_TIMEOUT_MS = 30_000;

/**
 * One call to a Quickwit node, and the only place its wire format is known.
 *
 * Two callers reach Quickwit — listing what a source holds, and running a search
 * over one of its indexes — so this is a seam rather than a helper: the paths,
 * the bearer token and the shape of a hit are settled here and nowhere else.
 */
export async function quickwitFetch(
  connection: IStoredConnection,
  path: string,
  init?: RequestInit,
): Promise<unknown> {
  const { url, token } = endpointAddress(connection);
  const headers = new Headers(init?.headers);
  if (!headers.has("content-type")) {
    headers.set("content-type", "application/json");
  }
  if (token !== null) {
    headers.set("authorization", `Bearer ${token}`);
  }

  const response = await fetch(`${url.replace(/\/$/, "")}${path}`, {
    ...init,
    headers,
    signal: AbortSignal.timeout(QUICKWIT_TIMEOUT_MS),
  });
  if (!response.ok) {
    throw new BadGatewayException(`Quickwit answered ${response.status}`);
  }
  return (await response.json()) as unknown;
}

/** The indexes a source holds, by id. */
export async function quickwitIndexes(
  connection: IStoredConnection,
): Promise<string[]> {
  const indexes = (await quickwitFetch(
    connection,
    "/api/v1/indexes",
  )) as Array<{ index_config: { index_id: string } }>;
  return indexes.map((index) => index.index_config.index_id);
}

/**
 * The documents a search matched, as the rows of a Grid. Quickwit answers with
 * at most `limit` hits and says nothing about how many exist beyond it, so
 * hitting the limit is the only evidence available that there were more.
 */
export async function quickwitSearch(
  connection: IStoredConnection,
  index: string,
  query: string,
  limit: number,
): Promise<{ documents: Record<string, unknown>[]; truncated: boolean }> {
  const body = (await quickwitFetch(
    connection,
    `/api/v1/${encodeURIComponent(index)}/search`,
    { method: "POST", body: JSON.stringify({ query, max_hits: limit }) },
  )) as { hits: Array<{ _source: Record<string, unknown> }> };

  return {
    documents: body.hits.map((hit) => hit._source),
    truncated: body.hits.length >= limit,
  };
}