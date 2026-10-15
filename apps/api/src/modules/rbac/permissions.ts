import { createAccessControl } from "better-auth/plugins/access";
import {
  defaultStatements,
  ownerAc,
} from "better-auth/plugins/organization/access";

export const ROLES = ["owner", "editor", "viewer"] as const;

export type Role = (typeof ROLES)[number];

export const productStatements = {
  dataSource: ["create", "update", "delete", "query"],
  query: ["create", "update", "delete"],
  dashboard: ["create", "update", "delete"],
  schedule: ["create", "update", "delete"],
  shareLink: ["create", "delete"],
  apiKey: ["create", "read", "update", "delete"],
} as const;

export const statement = {
  ...defaultStatements,
  ...productStatements,
} as const;

export const ac = createAccessControl(statement);

export const owner = ac.newRole({
  ...ownerAc.statements,
  ...productStatements,
});

export const editor = ac.newRole({ ...productStatements });

export const viewer = ac.newRole({});

export const roles = { owner, editor, viewer };

export function isRole(value: string): value is Role {
  return (ROLES as readonly string[]).includes(value);
}
