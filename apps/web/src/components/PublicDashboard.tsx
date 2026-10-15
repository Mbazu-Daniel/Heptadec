import { useEffect, useState } from "react";
import { fetchSharedDashboard, messageFor } from "../api";
import type { ISharedDashboard } from "@heptadec/api/share-link-contracts";
import { WidgetCard } from "./dashboards/WidgetCard";

export function PublicDashboard({ token }: { token: string }) {
  const [dashboard, setDashboard] = useState<ISharedDashboard | null>(null);
  const [problem, setProblem] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    fetchSharedDashboard(token).then(
      (found) => {
        if (live) {
          setDashboard(found.dashboard);
        }
      },
      (caught: unknown) => {
        if (live) {
          setProblem(messageFor(caught, "That link does not work."));
        }
      },
    );
    return () => {
      live = false;
    };
  }, [token]);

  return (
    <div className="mx-auto flex min-h-screen w-full max-w-5xl flex-col gap-6 px-6 py-10">
      <header className="flex flex-col gap-1">
        <span className="font-mono text-[11px] uppercase tracking-[0.18em] text-muted-foreground">
          Shared dashboard
        </span>
        <h1 className="text-xl font-semibold tracking-[-0.02em] text-fg">
          {dashboard?.name ?? (problem === null ? "Loading…" : "Unavailable")}
        </h1>
      </header>

      {problem !== null ? (
        <p className="rounded-md bg-muted px-4 py-3 text-xs text-red" role="alert">
          {problem}
        </p>
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          {(dashboard?.widgets ?? []).map((widget) => (
            <WidgetCard
              key={widget.id}
              title={widget.title}
              chartType={widget.chartType}
              points={widget.points}
            />
          ))}
        </div>
      )}

      <footer className="mt-auto pt-6 text-[11px] text-muted-foreground">
        Frozen snapshot · served without querying the database
      </footer>
    </div>
  );
}
