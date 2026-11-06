import { and, desc, eq } from "drizzle-orm";
import {
  alertDelivery,
  alertRule,
  savedQuery,
  scheduledJob,
  type AlertRuleRow,
} from "@heptadec/db";

import {
  oneRow,
  type IOrganizationScope,
} from "../../common/session/current-organization";
import { NotFoundException } from "../../common/exceptions/index";
import {
  type AlertOperator,
  type IAlertDeliveryListResponse,
  type IAlertRule,
  type IAlertRuleListResponse,
} from "./contracts";
import { checkRunAlerts } from "./evaluate";
import { toAlertDelivery } from "./deliver";
import { DEFAULT_TTL_SECONDS } from "../query-result/cache";
import type { ICreateAlertRuleInput, IUpdateAlertRuleInput } from "./types";

const LOG_LIMIT = 50;

function toAlertRule(
  row: typeof alertRule.$inferSelect,
  scheduled: boolean,
): IAlertRule {
  return {
    id: row.id,
    savedQueryId: row.savedQueryId,
    name: row.name,
    column: row.column,
    operator: row.operator as AlertOperator,
    threshold: row.threshold,
    scheduled,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

async function isScheduled(
  organization: IOrganizationScope,
  savedQueryId: string,
): Promise<boolean> {
  const running = await organization.db
    .select({ id: scheduledJob.id })
    .from(scheduledJob)
    .where(
      and(
        eq(scheduledJob.savedQueryId, savedQueryId),
        organization.where(scheduledJob.organizationId),
      ),
    )
    .limit(1);
  return running.length > 0;
}

export async function listAlertRules(
  organization: IOrganizationScope,
): Promise<IAlertRuleListResponse> {
  const rows = await organization.db
    .select()
    .from(alertRule)
    .where(organization.where(alertRule.organizationId))
    .orderBy(desc(alertRule.createdAt));

  const running = await organization.db
    .selectDistinct({ savedQueryId: scheduledJob.savedQueryId })
    .from(scheduledJob)
    .where(organization.where(scheduledJob.organizationId));

  const scheduled = new Set(running.map((job) => job.savedQueryId));
  return {
    alertRules: rows.map((row) =>
      toAlertRule(row, scheduled.has(row.savedQueryId)),
    ),
  };
}

export async function createAlertRule(
  organization: IOrganizationScope,
  input: ICreateAlertRuleInput,
): Promise<IAlertRule> {
  const query = await oneRow(
    organization.db,
    savedQuery,
    input.savedQueryId,
    organization,
  );
  if (query === undefined) {
    throw new NotFoundException("That saved query does not exist");
  }

  const now = new Date();
  const inserted = await organization.db
    .insert(alertRule)
    .values({
      organizationId: organization.organizationId,
      savedQueryId: input.savedQueryId,
      name: input.name,
      column: input.column,
      operator: input.operator,
      threshold: input.threshold,
      createdAt: now,
      updatedAt: now,
    })
    .returning();

  const created = inserted[0];
  if (created === undefined) {
    throw new NotFoundException("That alert rule could not be created");
  }
  return toAlertRule(created, await isScheduled(organization, input.savedQueryId));
}

export async function updateAlertRule(
  organization: IOrganizationScope,
  id: string,
  input: IUpdateAlertRuleInput,
): Promise<IAlertRule> {
  const found = await oneRow(organization.db, alertRule, id, organization);
  if (found === undefined) {
    throw new NotFoundException("That alert rule does not exist");
  }

  const now = new Date();
  const updated = await organization.db
    .update(alertRule)
    .set({
      name: input.name,
      column: input.column,
      operator: input.operator,
      threshold: input.threshold,
      updatedAt: now,
    })
    .where(
      and(
        eq(alertRule.id, found.id),
        organization.where(alertRule.organizationId),
      ),
    )
    .returning();

  const edited = updated[0];
  if (edited === undefined) {
    throw new NotFoundException("That alert rule could not be changed");
  }
  return toAlertRule(
    edited,
    await isScheduled(organization, found.savedQueryId),
  );
}

export async function deleteAlertRule(
  organization: IOrganizationScope,
  id: string,
): Promise<AlertRuleRow> {
  const found = await oneRow(organization.db, alertRule, id, organization);
  if (found === undefined) {
    throw new NotFoundException("That alert rule does not exist");
  }
  await organization.db
    .delete(alertDelivery)
    .where(
      and(
        eq(alertDelivery.alertRuleId, found.id),
        organization.where(alertDelivery.organizationId),
      ),
    );
  await organization.db.delete(alertRule).where(eq(alertRule.id, found.id));
  return found;
}

export async function listAlertDeliveries(
  organization: IOrganizationScope,
): Promise<IAlertDeliveryListResponse> {
  const rows = await organization.db
    .select()
    .from(alertDelivery)
    .where(organization.where(alertDelivery.organizationId))
    .orderBy(desc(alertDelivery.createdAt))
    .limit(LOG_LIMIT);

  return {
    alertDeliveries: rows.map(toAlertDelivery),
  };
}

export async function runAlertChecks(
  organization: IOrganizationScope,
  savedQueryId: string,
): Promise<IAlertDeliveryListResponse> {
  const query = await oneRow(
    organization.db,
    savedQuery,
    savedQueryId,
    organization,
  );
  if (query === undefined) {
    throw new NotFoundException("That saved query does not exist");
  }

  return {
    alertDeliveries: await checkRunAlerts(
      query.id,
      organization,
      DEFAULT_TTL_SECONDS,
    ),
  };
}
