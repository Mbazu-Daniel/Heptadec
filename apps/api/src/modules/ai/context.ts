import type { ISchemaResponse } from "../schema/contracts";
import type { IStoredConnection } from "../data-source/connection";
import { listObjects, previewObject } from "../data-source/preview";
import { MAX_SCAN_KEYS } from "../data-source/clients";

const CHARACTER_BUDGET = 12_000;

const MAX_TABLES = 120;

/**
 * Format a described structure as the "schema" half of an AI prompt. The caller
 * has already read the real structure, so this only describes what it found and
 * stays within a character budget: a source with hundreds of tables would
 * otherwise crowd out the question itself.
 */
export function schemaContext(schema: ISchemaResponse): string {
  const lines: string[] = [
    `Database: ${schema.database}`,
    `Schema: ${schema.schemaName}`,
    "",
  ];

  for (const table of schema.tables.slice(0, MAX_TABLES)) {
    const columns = table.columns
      .map((column) => `${column.name}: ${column.dataType}`)
      .join(", ");
    const described = `${table.name}(${columns})`;
    if (lines.join("\n").length + described.length > CHARACTER_BUDGET) {
      lines.push(
        `-- ... ${schema.tables.length - MAX_TABLES} more omitted for length`,
      );
      break;
    }
    lines.push(described);
  }

  return lines.join("\n");
}
/**
 * Redis has no tables, so what the model is shown is the key space that was
 * actually observed: the prefixes in use, how many keys each holds, and a
 * sample key per prefix so it can pick a real one rather than invent one.
 */
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

/**
 * Quickwit describes itself with indexes and fields, not tables. The field names
 * come from one cheap probe search per index, so the model is given fields that
 * really exist rather than ones it guesses at.
 */
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
