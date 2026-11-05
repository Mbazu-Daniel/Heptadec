import { and, eq } from "drizzle-orm";
import {
  alertRule,
  type HeptadecDatabase,
} from "@heptadec/db";
import type { AlertRuleRow } from "@heptadec/db";
import type { IOrganizationScope } from "../../common/session/current-organization";
import { materializeResult } from "../query-result/cache";
import type { AlertOperator, IAlertDelivery } from "./contracts";
import { breachMessage, breaches } from "./contracts";
import { deliverBreach } from "./deliver";
import { gridNumber } from "../query/contracts";
import type { IQueryResponse } from "../query/contracts";

export async function checkRunAlerts(
  savedQueryId: string,
  organization: IOrganizationScope,
  ttlSeconds: number,
): Promise<IAlertDelivery[]> {
  const grid = await materializeResult(savedQueryId, organization, ttlSeconds);
  return checkAlerts(savedQueryId, organization, grid);
}

export async function checkAlerts(
  queryId: string,
  organization: IOrganizationScope,
  grid: IQueryResponse,
): Promise<IAlertDelivery[]> {
  const rules = await organization.db
    .select()
    .from(alertRule)
    .where(
      and(
        eq(alertRule.savedQueryId, queryId),
        organization.where(alertRule.organizationId),
      ),
    );

  const delivered: IAlertDelivery[] = [];
  for (const rule of rules) {
    const operator = rule.operator as AlertOperator;
    const fired = firingRows(rule, grid, operator);
    if (fired === 0) {
      continue;
    }
    delivered.push(
      ...(await deliverBreach(
        organization.db,
        rule,
        breachMessage(rule, operator, grid, fired),
      )),
    );
  }
  return delivered;
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
