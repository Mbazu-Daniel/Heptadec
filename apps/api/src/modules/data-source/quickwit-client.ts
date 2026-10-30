import { BadGatewayException } from "../../common/exceptions";
import { endpointAddress } from "./connection";
import type { IStoredConnection } from "./connection";

export const QUICKWIT_TIMEOUT_MS = 30_000;

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

export async function quickwitIndexes(
  connection: IStoredConnection,
): Promise<string[]> {
  const indexes = (await quickwitFetch(
    connection,
    "/api/v1/indexes",
  )) as Array<{ index_config: { index_id: string } }>;
  return indexes.map((index) => index.index_config.index_id);
}

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