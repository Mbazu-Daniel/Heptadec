import type { IExplainNode } from "@heptadec/api/query-contracts";

export function describeNode(node: IExplainNode): string | null {
  const rows = node.planRows;
  const table = node.relationName;

  if (node.nodeType === "Seq Scan") {
    return table === null
      ? `Reads every row of the result, ${rows} rows.`
      : `Reads all ${rows} rows of ${table}.`;
  }
  if (node.nodeType === "Index Scan") {
    return table === null
      ? `Finds ${rows} rows with an index.`
      : `Uses an index on ${table} to find ${rows} rows.`;
  }
  if (node.nodeType === "Index Only Scan") {
    return table === null
      ? `Reads ${rows} rows from the index alone.`
      : `Reads ${rows} rows of ${table} from the index, without the table itself.`;
  }
  if (node.nodeType === "Bitmap Heap Scan") {
    return table === null
      ? `Rechecks ${rows} rows an index pointed at.`
      : `The index found ${rows} matching rows of ${table}, then reads them.`;
  }
  if (node.nodeType === "Limit") {
    return `Keeps only the first ${rows} rows.`;
  }
  if (node.nodeType === "Aggregate" || node.nodeType === "HashAggregate") {
    return `Groups rows together and gives back ${rows} row${
      rows === 1 ? "" : "s"
    }.`;
  }
  if (node.nodeType === "Sort" || node.nodeType === "Incremental Sort") {
    return `Puts the ${rows} rows in order.`;
  }
  if (node.nodeType === "Nested Loop") {
    return "Runs the steps below once for every row from the steps above.";
  }
  if (node.nodeType === "Hash Join") {
    return "Joins two sets of rows by building a lookup table from one.";
  }
  if (node.nodeType === "Merge Join") {
    return "Joins two sets of rows that are already sorted.";
  }
  if (node.nodeType === "Append") {
    return "Runs several scans below and lines up their rows.";
  }
  if (node.nodeType === "Memoize") {
    return "Remembers earlier results so the same lookup is not repeated.";
  }
  if (node.nodeType === "Materialize") {
    return "Holds the rows in memory so they can be read again.";
  }
  if (
    node.nodeType === "Gather" ||
    node.nodeType === "Gather Merge" ||
    node.nodeType === "Parallel Seq Scan"
  ) {
    return "Splits the work across several workers to finish sooner.";
  }
  if (node.nodeType === "Result") {
    return "Produces a row without reading a table.";
  }
  return null;
}

export function firstFullScan(node: IExplainNode): IExplainNode | null {
  if (node.nodeType === "Seq Scan" || node.nodeType === "Parallel Seq Scan") {
    return node;
  }
  for (const child of node.children) {
    const found = firstFullScan(child);
    if (found !== null) {
      return found;
    }
  }
  return null;
}
