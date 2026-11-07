import type { AuditEvent, AuditTargetKind } from "./contracts";

export interface IActorSource {
  id: string;
  name: string;
  email: string;
}

export interface IAuditInput {
  organizationId: string;
  event: AuditEvent;
  targetKind: AuditTargetKind;
  targetId?: string;
  targetLabel?: string;
  detail?: string;
}

export interface IAuditLogFilter {
  event?: AuditEvent;
  target?: AuditTargetKind;
  since?: Date;
  until?: Date;
  query: string;
}
