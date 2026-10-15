import { BadRequestException } from "../../common/exceptions";
import type { IOrganizationScope } from "../../common/session/current-organization";
import type { WidgetRow } from "@heptadec/db";
import type { IWidgetData, IWidgetPoint } from "./contracts";
import type { IQueryResponse } from "../query/contracts";
import { gridNumber } from "../query/contracts";
import { cachedResult } from "../query-result/cache";

export async function widgetData(
  widget: WidgetRow,
  organization: IOrganizationScope,
): Promise<IWidgetData> {
  const result = await cachedResult(widget.savedQueryId, organization);

  if (result === null) {
    return {
      points: [],
      rowCount: 0,
      truncated: false,
      durationMs: 0,
      ranAt: null,
      stale: false,
    };
  }

  return {
    points: widgetPoints(widget, result.grid),
    rowCount: result.grid.rowCount,
    truncated: result.grid.truncated,
    durationMs: result.grid.durationMs,
    ranAt: result.ranAt,
    stale: result.stale,
  };
}

export function widgetPoints(
  widget: WidgetRow,
  grid: IQueryResponse,
): IWidgetPoint[] {
  if (!grid.columns.includes(widget.labelColumn)) {
    throw new BadRequestException(
      `That query has no ${widget.labelColumn} column to label by`,
    );
  }
  if (!grid.columns.includes(widget.valueColumn)) {
    throw new BadRequestException(
      `That query has no ${widget.valueColumn} column to plot`,
    );
  }

  return grid.rows.map((row) => ({
    label: pointLabel(row[widget.labelColumn]),
    value: pointValue(row[widget.valueColumn], widget.valueColumn),
  }));
}

function pointValue(raw: unknown, column: string): number {
  const value = gridNumber(raw);
  if (value === null) {
    throw new BadRequestException(`Pick a column that holds numbers — ${column} does not`);
  }
  return value;
}

function pointLabel(raw: unknown): string {
  return String(raw);
}
