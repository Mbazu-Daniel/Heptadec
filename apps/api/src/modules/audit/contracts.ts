export const AUDIT_EVENTS = [
  "data_source.created",
  "data_source.updated",
  "data_source.deleted",
  "saved_query.created",
  "saved_query.updated",
  "saved_query.deleted",
  "saved_query.restored",
  "dashboard.created",
  "dashboard.updated",
  "dashboard.deleted",
  "widget.created",
  "widget.updated",
  "widget.deleted",
  "scheduled_job.created",
  "scheduled_job.updated",
  "scheduled_job.deleted",
  "alert_rule.created",
  "alert_rule.updated",
  "alert_rule.deleted",
  "notification_channel.saved",
  "notification_channel.deleted",
  "share_link.created",
  "share_link.refreshed",
  "share_link.deleted",
  "invitation.created",
  "invitation.accepted",
  "invitation.cancelled",
  "member.role_updated",
  "member.removed",
  "mcp_token.created",
  "mcp_token.revoked",
  "ai_provider.created",
  "ai_provider.deleted",
  "organization.created",
  "organization.updated",
] as const;

export type AuditEvent = (typeof AUDIT_EVENTS)[number];

export function isAuditEvent(value: string): value is AuditEvent {
  return (AUDIT_EVENTS as readonly string[]).includes(value);
}

export const AUDIT_TARGET_KINDS = [
  "data_source",
  "saved_query",
  "dashboard",
  "widget",
  "scheduled_job",
  "alert_rule",
  "notification_channel",
  "share_link",
  "invitation",
  "member",
  "mcp_token",
  "ai_provider",
  "organization",
] as const;

export type AuditTargetKind = (typeof AUDIT_TARGET_KINDS)[number];

export function isAuditTargetKind(value: string): value is AuditTargetKind {
  return (AUDIT_TARGET_KINDS as readonly string[]).includes(value);
}

export interface IAuditLog {
  id: string;
  occurredAt: string;
  actorId: string;
  actorLabel: string;
  event: AuditEvent;
  targetKind: AuditTargetKind;
  targetId: string | null;
  targetLabel: string | null;
  detail: string | null;
}

export interface IAuditLogListResponse {
  auditLogs: IAuditLog[];
}
