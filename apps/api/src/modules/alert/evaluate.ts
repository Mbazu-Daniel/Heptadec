import { and, eq } from "drizzle-orm";
import { schema, type HeptadecDatabase } from "@heptadec/db";
import type { AlertRuleRow } from "@heptadec/db";
import type { AlertOperator } from "./contracts";
import { breachMessage, breaches } from "./contracts";
import { deliverBreach } from "./deliver";
import { gridNumber } from "../query/contracts";
import type { IQueryResponse } from "../query/contracts";

const { alertRule } = schema;

export async function checkAlerts(
  db: HeptadecDatabase,
  queryId: string,
  organizationId: string,
  grid: IQueryResponse,
): Promise<void> {
  const rules = await db
    .select()
    .from(alertRule)
    .where(
      and(
        eq(alertRule.savedQueryId, queryId),
        eq(alertRule.organizationId, organizationId),
      ),
    );

  for (const rule of rules) {
    const operator = rule.operator as AlertOperator;
    const fired = firingRows(rule, grid, operator);
    if (fired === 0) {
      continue;
    }
    await deliverBreach(db, rule, breachMessage(rule, operator, grid, fired));
  }
}

function firingRows(
  rule: AlertRuleRow,
  grid: IQueryResponse,
  operator: AlertOperator,
): number {
  if (!grid.columns.includes(rule.column)) {
    return 0;
  }
  return grid.rows.filter((row) => {
    const value = gridNumber(row[rule.column]);
    return value !== null && breaches(value, operator, rule.threshold);
  }).length;
}
