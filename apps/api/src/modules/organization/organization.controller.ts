import type { Context } from "hono";
import type { IAuthVars } from "../../common/middleware/require-session";
import { readBody, readString } from "../../common/http/body";
import {
  activeOrganization,
  currentOrganizationId,
} from "../../common/session/current-organization";
import { requireOwner } from "../rbac/owner";
import { publicBaseFrom } from "../images/urls";
import {
  deleteOrganization,
  listOrganizations,
  switchOrganization,
} from "./organization.service";

const MAX_SLUG = 80;

export async function listOrganizationsHandler(c: Context<IAuthVars>) {
  const session = c.get("session")!;
  return c.json(
    await listOrganizations(c.get("db"), {
      userId: session.user.id,
      activeOrganizationId: currentOrganizationId(session),
      publicBase: publicBaseFrom(c.env),
    }),
  );
}

export async function switchOrganizationHandler(c: Context<IAuthVars>) {
  const session = c.get("session")!;
  const body = readBody(await c.req.json(), "An organization id is required");
  const organizationId = readString(
    body,
    "organizationId",
    "An organization id is required",
  );
  return c.json(
    await switchOrganization(c.get("db"), {
      organizationId,
      userId: session.user.id,
      headers: c.req.raw.headers,
    }),
  );
}

export async function deleteOrganizationHandler(c: Context<IAuthVars>) {
  const scope = activeOrganization(c);

  requireOwner(c, "Only an owner can delete an organization");

  const body = readBody(await c.req.json(), "Type the organization slug to confirm");
  const slug = readString(body, "slug", "Type the organization slug to confirm", MAX_SLUG);

  await deleteOrganization(scope, { slug, headers: c.req.raw.headers });

  return c.json({ deleted: true });
}
