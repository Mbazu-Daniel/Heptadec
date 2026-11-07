import type { Context } from "hono";
import type { IAuthVars } from "../../common/middleware/require-session";
import { activeOrganization } from "../../common/session/current-organization";
import { BadRequestException } from "../../common/exceptions/index";
import { requireOwner } from "../rbac/owner";
import { isAuditEvent, isAuditTargetKind } from "./contracts";
import { listAuditLogs } from "./audit.service";

function readDate(value: string | undefined, message: string): Date | undefined {
  if (value === undefined || value === "") {
    return undefined;
  }
  const time = Date.parse(value);
  if (Number.isNaN(time)) {
    throw new BadRequestException(message);
  }
  return new Date(time);
}

export async function listAuditLogsHandler(c: Context<IAuthVars>) {
  const organization = activeOrganization(c);
  requireOwner(c, "Only owners can see the audit log");

  const event = c.req.query("event");
  if (event !== undefined && event !== "" && !isAuditEvent(event)) {
    throw new BadRequestException("That event filter is not a known audit event");
  }
  const target = c.req.query("target");
  if (target !== undefined && target !== "" && !isAuditTargetKind(target)) {
    throw new BadRequestException("That target filter is not a known audit target");
  }

  return c.json(
    await listAuditLogs(organization, {
      event: event === undefined || event === "" ? undefined : event,
      target: target === undefined || target === "" ? undefined : target,
      since: readDate(c.req.query("since"), "That start date is not valid"),
      until: readDate(c.req.query("until"), "That end date is not valid"),
      query: c.req.query("q")?.trim() ?? "",
    }),
  );
}
