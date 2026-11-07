import type { AlertOperator } from "./contracts";

export interface ICreateAlertRuleInput {
  savedQueryId: string;
  name: string;
  column: string;
  operator: AlertOperator;
  threshold: number;
}

export interface IUpdateAlertRuleInput {
  name: string;
  column: string;
  operator: AlertOperator;
  threshold: number;
}
