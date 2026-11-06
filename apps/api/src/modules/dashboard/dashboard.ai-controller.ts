import type { Context } from "hono";
import type { IAuthVars } from "../../common/middleware/require-session";
import { activeOrganization } from "../../common/session/current-organization";
import {
  readBody,
  readOptionalString,
  readString,
  readStringList,
} from "../../common/http/body";
import { BadRequestException, ForbiddenException } from "../../common/exceptions/index";
import { can } from "../rbac/authorize";
import { streamTurn } from "../../common/http/stream";
import { ANSWER_EVENTS } from "../ai/contracts";
import {
  applyDashboardProposal,
  askDashboardChanges,
  createDashboardForAi,
  generateDashboardCharts,
  prepareDashboardAsk,
} from "./dashboard.service";

const MAX_NAME = 120;

const MAX_QUESTION = 2_000;

const MAX_BRIEF = 1_000;

const MAX_ID = 64;

export async function generateDashboardHandler(c: Context<IAuthVars>) {
  const organization = activeOrganization(c);

  if (!(await can(organization.db, organization.organizationId, c.req.raw.headers, "dashboard", "create"))) {
    throw new ForbiddenException(
      "Only owners and editors can create dashboards",
    );
  }

  const payload = readBody(await c.req.json(), "A dashboard is required");
  const request = {
    name: readString(payload, "name", "Give the dashboard a name", MAX_NAME),
    dataSourceIds: readStringList(
      payload,
      "dataSourceIds",
      "Connect at least one data source",
      MAX_ID,
    ),
    brief: readOptionalString(
      payload,
      "brief",
      "Say what the dashboard should show",
      MAX_BRIEF,
    ),
    providerId: payload.providerId,
  };

  const generated = await createDashboardForAi(organization, request);

  return streamTurn(
    c,
    ANSWER_EVENTS,
    {
      log: "[dashboard] that plan could not be produced:",
      message:
        "That source could not be read, or the provider could not be reached. The dashboard is saved with its sources connected.",
    },
    async (turn) => {
      await generateDashboardCharts(organization, generated, request.brief, turn);
    },
  );
}

export async function askDashboardHandler(
  c: Context<IAuthVars, "/api/v1/organization/:organizationId/dashboards/:id/ask">,
) {
  const organization = activeOrganization(c);

  if (!(await can(organization.db, organization.organizationId, c.req.raw.headers, "dashboard", "update"))) {
    throw new ForbiddenException(
      "Only owners and editors can change dashboards",
    );
  }

  const payload = readBody(await c.req.json(), "A question is required");
  const question = readString(
    payload,
    "question",
    "Say what you want changed",
    MAX_QUESTION,
  );

  const context = await prepareDashboardAsk(
    organization,
    c.req.param("id"),
    { question, providerId: payload.providerId },
  );

  return streamTurn(
    c,
    ANSWER_EVENTS,
    {
      log: "[dashboard] that request could not be answered:",
      message:
        "That provider did not return a proposal. Check the key, the model id, and the base URL.",
    },
    async (turn) => {
      await askDashboardChanges(context, organization, question, turn);
    },
  );
}

export async function applyProposalHandler(
  c: Context<IAuthVars, "/api/v1/organization/:organizationId/dashboards/:id/apply">,
) {
  const organization = activeOrganization(c);

  if (!(await can(organization.db, organization.organizationId, c.req.raw.headers, "dashboard", "update"))) {
    throw new ForbiddenException(
      "Only owners and editors can change dashboards",
    );
  }

  const payload = readBody(await c.req.json(), "Approve at least one change");
  if (!Array.isArray(payload.actions)) {
    throw new BadRequestException("Approve at least one change");
  }

  const response = await applyDashboardProposal(
    organization,
    c.req.param("id"),
    payload.actions,
  );
  return c.json(response);
}
