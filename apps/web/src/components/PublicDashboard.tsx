import { useQuery } from "@tanstack/react-query";
import { fetchSharedDashboard, messageFor } from "../api";
import { WidgetCard } from "./dashboards/WidgetCard";

export function PublicDashboard({ token }: { token: string }) {
  const shared = useQuery({
    queryKey: ["shared-dashboard", token],
    queryFn: () => fetchSharedDashboard(token),
  });
  const dashboard = shared.data?.dashboard ?? null;

  return (
    <div className="mx-auto flex min-h-screen w-full max-w-5xl flex-col gap-6 px-6 py-10">
      <header className="flex flex-col gap-1">
        <span className="font-mono text-[11px] uppercase tracking-[0.18em] text-muted-foreground">
          Shared dashboard
        </span>
        <h1 className="text-xl font-semibold tracking-[-0.02em] text-fg">
          {dashboard?.name ?? (shared.isError ? "Unavailable" : "Loading…")}
        </h1>
      </header>

      {shared.isError ? (
        <p className="rounded-md bg-muted px-4 py-3 text-xs text-red" role="alert">
          {messageFor(shared.error, "That link does not work.")}
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
