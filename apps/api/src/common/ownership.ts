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
  dataSourceStructure,
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
  await scope.db.transaction(async (tx) => {
    await tx.delete(alertDelivery).where(scope.where(alertDelivery.organizationId));
    await tx.delete(alertRule).where(scope.where(alertRule.organizationId));
    await tx.delete(scheduledJob).where(scope.where(scheduledJob.organizationId));
    await tx.delete(widget).where(scope.where(widget.organizationId));
    await tx.delete(shareLink).where(scope.where(shareLink.organizationId));
    await tx
      .delete(dashboardDataSource)
      .where(scope.where(dashboardDataSource.organizationId));
    await tx.delete(queryVersion).where(scope.where(queryVersion.organizationId));
    await tx.delete(queryResult).where(scope.where(queryResult.organizationId));
    await tx.delete(savedQuery).where(scope.where(savedQuery.organizationId));
    await tx.delete(dashboard).where(scope.where(dashboard.organizationId));
    await tx.delete(aiChat).where(scope.where(aiChat.organizationId));
    await tx.delete(aiProvider).where(scope.where(aiProvider.organizationId));
    await tx.delete(dataSource).where(scope.where(dataSource.organizationId));
    await tx
      .delete(dataSourceStructure)
      .where(scope.where(dataSourceStructure.organizationId));
    await tx
      .delete(notificationChannel)
      .where(scope.where(notificationChannel.organizationId));
    await tx.delete(auditLog).where(scope.where(auditLog.organizationId));
    await tx
      .delete(billingCustomer)
      .where(scope.where(billingCustomer.organizationId));
    await tx
      .delete(billingPayment)
      .where(scope.where(billingPayment.organizationId));
  });
}

export async function deleteSavedQueryRows(
  scope: IOrganizationScope,
  savedQueryId: string,
): Promise<void> {
  await scope.db.transaction(async (tx) => {
    const rules = await tx
      .select({ id: alertRule.id })
      .from(alertRule)
      .where(
        and(
          eq(alertRule.savedQueryId, savedQueryId),
          scope.where(alertRule.organizationId),
        ),
      );
    if (rules.length > 0) {
      await tx
        .delete(alertDelivery)
        .where(
          and(
            inArray(
              alertDelivery.alertRuleId,
              rules.map((rule) => rule.id),
            ),
            scope.where(alertDelivery.organizationId),
          ),
        );
    }
    await tx
      .delete(alertRule)
      .where(
        and(
          eq(alertRule.savedQueryId, savedQueryId),
          scope.where(alertRule.organizationId),
        ),
      );
    await tx
      .delete(widget)
      .where(
        and(
          eq(widget.savedQueryId, savedQueryId),
          scope.where(widget.organizationId),
        ),
      );
    await tx
      .delete(scheduledJob)
      .where(
        and(
          eq(scheduledJob.savedQueryId, savedQueryId),
          scope.where(scheduledJob.organizationId),
        ),
      );
    await tx
      .delete(queryResult)
      .where(
        and(
          eq(queryResult.savedQueryId, savedQueryId),
          scope.where(queryResult.organizationId),
        ),
      );
    await tx
      .delete(queryVersion)
      .where(
        and(
          eq(queryVersion.savedQueryId, savedQueryId),
          scope.where(queryVersion.organizationId),
        ),
      );
    await tx
      .delete(savedQuery)
      .where(
        and(
          eq(savedQuery.id, savedQueryId),
          scope.where(savedQuery.organizationId),
        ),
      );
  });
}

export async function deleteDashboardRows(
  scope: IOrganizationScope,
  dashboardId: string,
): Promise<void> {
  await scope.db.transaction(async (tx) => {
    await tx
      .delete(shareLink)
      .where(
        and(
          eq(shareLink.dashboardId, dashboardId),
          scope.where(shareLink.organizationId),
        ),
      );
    await tx
      .delete(dashboardDataSource)
      .where(
        and(
          eq(dashboardDataSource.dashboardId, dashboardId),
          scope.where(dashboardDataSource.organizationId),
        ),
      );
    await tx
      .delete(widget)
      .where(
        and(
          eq(widget.dashboardId, dashboardId),
          scope.where(widget.organizationId),
        ),
      );
    await tx
      .delete(dashboard)
      .where(
        and(
          eq(dashboard.id, dashboardId),
          scope.where(dashboard.organizationId),
        ),
      );
  });
}
