import { Hono } from "hono";
import { dashboard, dashboardDataSource } from "@heptadec/db";
import {
  requireSession,
  type IAuthVars,
} from "../../common/middleware/require-session";
import {
  activeOrganization,
  oneRow,
} from "../../common/session/current-organization";
import {
  BadRequestException,
  ForbiddenException,
  NotFoundException,
} from "../../common/exceptions";
import {
  readBody,
  readOptionalString,
  readString,
  readStringList,
} from "../../common/http/body";
import { can } from "../rbac/authorize";
import { chosenProvider } from "../ai/provider";
import { runTurn } from "../ai/turn";
import {
  dashboardDetail,
  ownSources,
  readWidgets,
} from "./detail";
import {
  analysisSources,
  applyChanges,
  planCharts,
  proposeChanges,
} from "./ai";
import type {
  IApplyProposalResponse,
  IAskDashboardResponse,
  IGenerateDashboardRequest,
  IGenerateDashboardResponse,
} from "./contracts";

const MAX_NAME = 120;

const MAX_QUESTION = 2_000;

const MAX_BRIEF = 1_000;

const MAX_ID = 64;

function dashboardAiRoutes() {
  const routes = new Hono<IAuthVars>();

  routes.post("/api/dashboards/generate", requireSession, async (c) => {
    const organization = activeOrganization(c);

    if (!(await can(organization.db, c.req.raw.headers, "dashboard", "create"))) {
      throw new ForbiddenException(
        "Only owners and editors can create dashboards",
      );
    }

    const payload = readBody(await c.req.json(), "A dashboard is required");
    const request: IGenerateDashboardRequest = {
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
    };

    const sources = await ownSources(request.dataSourceIds, organization);
    const provider = await chosenProvider(organization, payload.providerId);
    if (provider === null) {
      throw new BadRequestException(
        "No AI provider is set up for this organization yet",
      );
    }

    const now = new Date();
    const created = await organization.db.transaction(async (tx) => {
      const [row] = await tx
        .insert(dashboard)
        .values({
          organizationId: organization.organizationId,
          name: request.name,
          createdAt: now,
          updatedAt: now,
        })
        .returning();
      if (row === undefined) {
        return undefined;
      }
      await tx.insert(dashboardDataSource).values(
        sources.map((source) => ({
          organizationId: organization.organizationId,
          dashboardId: row.id,
          dataSourceId: source.id,
          createdAt: now,
        })),
      );
      return row;
    });
    if (created === undefined) {
      throw new NotFoundException("That dashboard could not be created");
    }

    return runTurn(
      c,
      {
        log: "[dashboard] that plan could not be produced:",
        message:
          "That source could not be read, or the provider could not be reached. The dashboard is saved with its sources connected.",
      },
      async (turn) => {
        const plan = await planCharts(
          turn,
          provider,
          created.id,
          sources,
          request.brief,
          organization,
        );

        if (plan.skipped.length > 0) {
          await turn.skipped(plan.skipped);
        }
        if (plan.problem !== null) {
          await turn.problem(plan.problem);
        }

        const response: IGenerateDashboardResponse = {
          dashboard: await dashboardDetail(created, organization),
          durationMs: Date.now() - now.getTime(),
        };
        await turn.done(response);
      },
    );
  });

  routes.post("/api/dashboards/:id/ask", requireSession, async (c) => {
    const organization = activeOrganization(c);

    if (!(await can(organization.db, c.req.raw.headers, "dashboard", "update"))) {
      throw new ForbiddenException(
        "Only owners and editors can change dashboards",
      );
    }

    const found = await oneRow(organization.db, dashboard, c.req.param("id"), organization);
    if (found === undefined) {
      throw new NotFoundException("That dashboard does not exist");
    }

    const payload = readBody(await c.req.json(), "A question is required");
    const question = readString(
      payload,
      "question",
      "Say what you want changed",
      MAX_QUESTION,
    );
    const provider = await chosenProvider(organization, payload.providerId);
    if (provider === null) {
      throw new BadRequestException(
        "No AI provider is set up for this organization yet",
      );
    }

    const analysed = await analysisSources(found.id, organization);
    if (analysed.length === 0) {
      throw new BadRequestException(
        "Only Postgres sources can be analysed, and this dashboard has none connected",
      );
    }

    const widgets = await readWidgets(found.id, organization);

    return runTurn(
      c,
      {
        log: "[dashboard] that request could not be answered:",
        message:
          "That provider did not return a proposal. Check the key, the model id, and the base URL.",
      },
      async (turn) => {
        const proposal = await proposeChanges(
          turn,
          provider,
          found.name,
          analysed,
          widgets,
          organization,
          question,
        );
        if (proposal === null) {
          await turn.problem(
            "That provider did not return a proposal. Check the key, the model id, and the base URL.",
          );
          return;
        }

        const response: IAskDashboardResponse = {
          proposal,
          providerName: provider.name,
          model: provider.model,
          durationMs: Date.now() - turn.startedAt,
        };
        await turn.done(response);
      },
    );
  });

  routes.post("/api/dashboards/:id/apply", requireSession, async (c) => {
    const organization = activeOrganization(c);

    if (!(await can(organization.db, c.req.raw.headers, "dashboard", "update"))) {
      throw new ForbiddenException(
        "Only owners and editors can change dashboards",
      );
    }

    const found = await oneRow(organization.db, dashboard, c.req.param("id"), organization);
    if (found === undefined) {
      throw new NotFoundException("That dashboard does not exist");
    }

    const payload = readBody(await c.req.json(), "Approve at least one change");
    if (!Array.isArray(payload.actions)) {
      throw new BadRequestException("Approve at least one change");
    }

    const analysed = await analysisSources(found.id, organization);
    const widgets = await readWidgets(found.id, organization);

    const applied = await applyChanges(
      found.id,
      payload.actions,
      analysed,
      widgets,
      organization,
    );

    const response: IApplyProposalResponse = {
      dashboard: await dashboardDetail(found, organization),
      applied,
    };
    return c.json(response);
  });

  return routes;
}

export { dashboardAiRoutes };
