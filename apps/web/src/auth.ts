import { createAuthClient } from "better-auth/react";
import {
  lastLoginMethodClient,
  organizationClient,
} from "better-auth/client/plugins";
import { ac, roles } from "@heptadec/api/rbac";

export const authClient = createAuthClient({
  plugins: [
    lastLoginMethodClient(),
    organizationClient({
      ac,
      roles,
      schema: {
        member: {
          additionalFields: {
            displayName: { type: "string" },
          },
        },
      },
    }),
  ],
});