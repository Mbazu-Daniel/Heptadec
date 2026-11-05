import { and, eq, inArray } from "drizzle-orm";
import { schema } from "@heptadec/db";
import type { IOrganizationScope } from "./session/current-organization";

const {
  aiChat,
  aiProvider,
  alertDelivery,
  alertRule,
  auditLog,
  billingCustomer,
  billingPayment,
  dashboard,
  dashboardDataSource,
  dataSource,
  notificationChannel,
  queryResult,
  queryVersion,
  savedQuery,
  scheduledJob,
  shareLink,
  widget,
} = schema;

export async function deleteOrganizationRows(
  scope: IOrganizationScope,
): Promise<void> {
  const db = scope.db;
  await db.batch([
    db.delete(alertDelivery).where(scope.where(alertDelivery.organizationId)),
    db.delete(alertRule).where(scope.where(alertRule.organizationId)),
    db.delete(scheduledJob).where(scope.where(scheduledJob.organizationId)),
    db.delete(widget).where(scope.where(widget.organizationId)),
    db.delete(shareLink).where(scope.where(shareLink.organizationId)),
    db.delete(dashboardDataSource).where(scope.where(dashboardDataSource.organizationId)),
    db.delete(queryVersion).where(scope.where(queryVersion.organizationId)),
    db.delete(queryResult).where(scope.where(queryResult.organizationId)),
    db.delete(savedQuery).where(scope.where(savedQuery.organizationId)),
    db.delete(dashboard).where(scope.where(dashboard.organizationId)),
    db.delete(aiChat).where(scope.where(aiChat.organizationId)),
    db.delete(aiProvider).where(scope.where(aiProvider.organizationId)),
    db.delete(dataSource).where(scope.where(dataSource.organizationId)),
    db.delete(notificationChannel).where(scope.where(notificationChannel.organizationId)),
    db.delete(auditLog).where(scope.where(auditLog.organizationId)),
    db.delete(billingCustomer).where(scope.where(billingCustomer.organizationId)),
    db.delete(billingPayment).where(scope.where(billingPayment.organizationId)),
  ]);
}

export async function deleteSavedQueryRows(
  scope: IOrganizationScope,
  savedQueryId: string,
): Promise<void> {
  const db = scope.db;
  const rulesOfThisQuery = db
    .select({ id: alertRule.id })
    .from(alertRule)
    .where(
      and(
        eq(alertRule.savedQueryId, savedQueryId),
        scope.where(alertRule.organizationId),
      ),
    );
  await db.batch([
    db
      .delete(alertDelivery)
      .where(
        and(
          inArray(alertDelivery.alertRuleId, rulesOfThisQuery),
          scope.where(alertDelivery.organizationId),
        ),
      ),
    db
      .delete(alertRule)
      .where(
        and(
          eq(alertRule.savedQueryId, savedQueryId),
          scope.where(alertRule.organizationId),
        ),
      ),
    db
      .delete(widget)
      .where(
        and(
          eq(widget.savedQueryId, savedQueryId),
          scope.where(widget.organizationId),
        ),
      ),
    db
      .delete(scheduledJob)
      .where(
        and(
          eq(scheduledJob.savedQueryId, savedQueryId),
          scope.where(scheduledJob.organizationId),
        ),
      ),
    db
      .delete(queryResult)
      .where(
        and(
          eq(queryResult.savedQueryId, savedQueryId),
          scope.where(queryResult.organizationId),
        ),
      ),
    db
      .delete(queryVersion)
      .where(
        and(
          eq(queryVersion.savedQueryId, savedQueryId),
          scope.where(queryVersion.organizationId),
        ),
      ),
    db
      .delete(savedQuery)
      .where(
        and(
          eq(savedQuery.id, savedQueryId),
          scope.where(savedQuery.organizationId),
        ),
      ),
  ]);
}

export async function deleteDashboardRows(
  scope: IOrganizationScope,
  dashboardId: string,
): Promise<void> {
  const db = scope.db;
  await db.batch([
    db
      .delete(shareLink)
      .where(
        and(
          eq(shareLink.dashboardId, dashboardId),
          scope.where(shareLink.organizationId),
        ),
      ),
    db
      .delete(dashboardDataSource)
      .where(
        and(
          eq(dashboardDataSource.dashboardId, dashboardId),
          scope.where(dashboardDataSource.organizationId),
        ),
      ),
    db
      .delete(widget)
      .where(
        and(
          eq(widget.dashboardId, dashboardId),
          scope.where(widget.organizationId),
        ),
      ),
    db
      .delete(dashboard)
      .where(
        and(
          eq(dashboard.id, dashboardId),
          scope.where(dashboard.organizationId),
        ),
      ),
  ]);
}
