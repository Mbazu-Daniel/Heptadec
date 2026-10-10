import type { IQueryResponse } from "../query/contracts";
import type { NotificationKind } from "../notification/contracts";

export const ALERT_OPERATORS = [">", ">=", "<", "<=", "="] as const;

export type AlertOperator = (typeof ALERT_OPERATORS)[number];

export function isAlertOperator(value: string): value is AlertOperator {
  return (ALERT_OPERATORS as readonly string[]).includes(value);
}

export interface IAlertRule {
  id: string;
  savedQueryId: string;
  name: string;
  column: string;
  operator: AlertOperator;
  threshold: number;
  createdAt: string;
  updatedAt: string;
}

export type AlertDeliveryStatus = "sent" | "failed" | "skipped";

export type AlertDeliveryChannel = NotificationKind | "none";

export interface IAlertDelivery {
  id: string;
  alertRuleId: string;
  channel: AlertDeliveryChannel;
  status: AlertDeliveryStatus;
  message: string;
  error: string | null;
  createdAt: string;
}

export interface IAlertRuleListResponse {
  alertRules: IAlertRule[];
}

export interface IAlertRuleResponse {
  alertRule: IAlertRule;
}

export interface IAlertDeliveryListResponse {
  alertDeliveries: IAlertDelivery[];
}

export interface ICreateAlertRuleRequest {
  savedQueryId: string;
  name: string;
  column: string;
  operator: AlertOperator;
  threshold: number;
}

export function breaches(
  value: number,
  operator: AlertOperator,
  threshold: number,
): boolean {
  switch (operator) {
    case ">":
      return value > threshold;
    case ">=":
      return value >= threshold;
    case "<":
      return value < threshold;
    case "<=":
      return value <= threshold;
    case "=":
      return value === threshold;
  }
}

export function breachMessage(
  rule: { name: string; column: string; threshold: number },
  operator: AlertOperator,
  grid: IQueryResponse,
  rowCount: number,
): string {
  const rows = rowCount === 1 ? "1 row does" : `${rowCount} rows do`;
  return `${rule.name}: ${rows} — ${rule.column} ${operator} ${rule.threshold} in the last run (${grid.rowCount} rows).`;
}
