import type { ISchemaResponse } from "../schema/contracts";
import type { IStoredConnection } from "../data-source/connection";
import { listObjects, previewObject } from "../data-source/preview";
import { MAX_SCAN_KEYS } from "../data-source/clients";

export function schemaContext(schema: ISchemaResponse): string {
  const lines: string[] = [
    `Database: ${schema.database}`,
    `Schema: ${schema.schemaName}`,
    "",
  ];

  for (const table of schema.tables) {
    const columns = table.columns
      .map((column) => `${column.name}: ${column.dataType}`)
      .join(", ");
    lines.push(`${table.name}(${columns})`);
  }

  return lines.join("\n");
}
export async function redisContext(connection: IStoredConnection): Promise<string> {
  const keys = await listObjects(connection);
  const prefixes = new Map<string, string[]>();
  for (const entry of keys) {
    const prefix = entry.name.includes(":")
      ? entry.name.slice(0, entry.name.indexOf(":"))
      : "(no prefix)";
    const bucket = prefixes.get(prefix);
    if (bucket === undefined) {
      prefixes.set(prefix, [entry.name]);
    } else if (bucket.length < 3) {
      bucket.push(entry.name);
    }
  }

  const lines: string[] = [`Database: ${connection.database ?? "0"}`, ""];
  if (prefixes.size === 0) {
    lines.push("-- no keys were found on this source");
    return lines.join("\n");
  }

  for (const [prefix, sample] of prefixes) {
    lines.push(`${prefix} — keys like ${sample.join(", ")}`);
  }
  if (keys.length >= MAX_SCAN_KEYS) {
    lines.push(
      `-- only the first ${MAX_SCAN_KEYS} keys were scanned, so this is a sample`,
    );
  }
  return lines.join("\n");
}

export async function quickwitContext(connection: IStoredConnection): Promise<string> {
  const indexes = await listObjects(connection);
  const probed = await Promise.all(
    indexes.map(async (index) => {
      let fields: string[] = [];
      try {
        const probe = await previewObject(connection, index, "*", 1);
        fields = probe.columns;
      } catch (caught) {
        console.warn(`[ai] could not probe quickwit index ${index.name}:`, caught);
      }
      return { index, fields };
    }),
  );

  const lines: string[] = [`Endpoint: ${connection.host ?? ""}`, ""];
  if (probed.length === 0) {
    lines.push("-- this source reported no indexes");
    return lines.join("\n");
  }

  for (const { index, fields } of probed) {
    lines.push(
      fields.length === 0
        ? `${index.name} — fields unknown`
        : `${index.name} — fields: ${fields.join(", ")}`,
    );
  }
  return lines.join("\n");
}
