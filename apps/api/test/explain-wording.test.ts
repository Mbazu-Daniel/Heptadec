import { expect, it } from "vitest";
import type { IExplainNode } from "@heptadec/api/query-contracts";
import { describeNode } from "../../web/src/components/schema/explain-wording";

function node(
  nodeType: string,
  planRows: number,
  relationName: string | null = null,
): IExplainNode {
  return {
    nodeType,
    relationName,
    startupCost: 0,
    totalCost: 1,
    planRows,
    planWidth: 0,
    children: [],
  };
}

it("says what each step does, in words", () => {
  expect(describeNode(node("Aggregate", 1))).toBe(
    "Groups rows together and gives back 1 row.",
  );
  expect(describeNode(node("Seq Scan", 567, "orders"))).toBe(
    "Reads all 567 rows of orders.",
  );
  expect(describeNode(node("Index Scan", 12, "orders"))).toBe(
    "Uses an index on orders to find 12 rows.",
  );
  expect(describeNode(node("Limit", 100))).toBe("Keeps only the first 100 rows.");
});

it("pluralises the row count instead of saying '1 rows'", () => {
  expect(describeNode(node("Limit", 1))).toContain("first 1 rows");
  expect(describeNode(node("Aggregate", 1))).toContain("gives back 1 row.");
  expect(describeNode(node("Aggregate", 4))).toContain("gives back 4 rows");
});

it("says nothing rather than guessing at an unknown step", () => {
  expect(describeNode(node("Some Postgres Node From A Future Version", 9))).toBeNull();
});
