import type { ReactNode } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { ChartType, IWidgetPoint } from "@heptadec/api/dashboard-contracts";
import { useChartPalette } from "../../lib/chart-colors";
import { Alert, EmptyState } from "../ui/feedback";

export function WidgetCard({
  title,
  chartType,
  points,
  meta,
  problem,
  actions,
}: {
  title: string;
  chartType: ChartType;
  points: IWidgetPoint[];
  meta?: string;
  problem?: string;
  actions?: ReactNode;
}) {
  const palette = useChartPalette();

  return (
    <figure className="flex flex-col rounded-lg border border-border bg-card/40">
      <figcaption className="flex items-center gap-2 border-b border-border px-4 py-2.5">
        <h3 className="min-w-0 flex-1 truncate text-xs font-semibold text-fg">
          {title}
        </h3>
        {actions}
      </figcaption>

      {problem !== undefined ? (
        <div className="p-4">
          <Alert>{problem}</Alert>
        </div>
      ) : points.length === 0 ? (
        <EmptyState
          className="py-6"
          title="Nothing to plot"
          body="That query returned no rows, so there is no chart to draw."
        />
      ) : (
        <div className="px-2 py-3">
          <ResponsiveContainer width="100%" height={200}>
            {chartType === "pie" ? (
              <PieChart>
                <Pie
                  data={points}
                  dataKey="value"
                  nameKey="label"
                  innerRadius={45}
                  outerRadius={80}
                  stroke={palette.grid}
                >
                  {points.map((_point, index) => (
                    <Cell
                      key={index}
                      fill={palette.series[index % palette.series.length]}
                    />
                  ))}
                </Pie>
                <Tooltip
                  contentStyle={tooltipStyle(palette.grid)}
                  labelStyle={{ color: palette.label }}
                />
              </PieChart>
            ) : chartType === "line" ? (
              <LineChart data={points}>
                <CartesianGrid stroke={palette.grid} vertical={false} />
                <XAxis dataKey="label" tick={tickStyle(palette.label)} />
                <YAxis tick={tickStyle(palette.label)} width={48} />
                <Tooltip
                  contentStyle={tooltipStyle(palette.grid)}
                  labelStyle={{ color: palette.label }}
                />
                <Line
                  type="monotone"
                  dataKey="value"
                  stroke={palette.series[0]}
                  strokeWidth={2}
                  dot={{ r: 2 }}
                />
              </LineChart>
            ) : (
              <BarChart data={points}>
                <CartesianGrid stroke={palette.grid} vertical={false} />
                <XAxis dataKey="label" tick={tickStyle(palette.label)} />
                <YAxis tick={tickStyle(palette.label)} width={48} />
                <Tooltip
                  cursor={{ fill: palette.grid, fillOpacity: 0.4 }}
                  contentStyle={tooltipStyle(palette.grid)}
                  labelStyle={{ color: palette.label }}
                />
                <Bar dataKey="value" fill={palette.series[0]} radius={[2, 2, 0, 0]} />
              </BarChart>
            )}
          </ResponsiveContainer>
        </div>
      )}

      {meta !== undefined ? (
        <div className="border-t border-border px-4 py-2 font-mono text-[10px] tabular-nums text-muted-foreground">
          {meta}
        </div>
      ) : null}
    </figure>
  );
}

function tickStyle(color: string) {
  return { fill: color, fontSize: 10 };
}

function tooltipStyle(background: string) {
  return {
    background,
    border: "1px solid var(--border)",
    borderRadius: 6,
    fontSize: 11,
    color: "var(--fg)",
  };
}
