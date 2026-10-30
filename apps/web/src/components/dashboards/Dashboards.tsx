import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { listDashboards, messageFor } from "../../api";
import { Alert, EmptyState } from "../ui/feedback";
import { Button } from "../ui/button";
import {
  TABLE_CELL_CLASSNAME,
  TABLE_CLASSNAME,
  TABLE_HEAD_CLASSNAME,
  TABLE_ROW_CLASSNAME,
  Toolbar,
  Workspace,
} from "../workspace";
import { CreateDashboardDialog } from "./CreateDashboardDialog";

export function Dashboards({ onOpen }: { onOpen: (dashboardId: string) => void }) {
  const queryClient = useQueryClient();
  const dashboardsQuery = useQuery({
    queryKey: ["dashboards"],
    queryFn: listDashboards,
  });
  const dashboards = dashboardsQuery.data?.dashboards ?? null;
  const [opening, setOpening] = useState(false);

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <Toolbar>
        <Button
          onClick={() => setOpening(true)}
          className="h-7 gap-1.5 px-3 text-xs"
        >
          New dashboard
        </Button>
      </Toolbar>
      <Workspace
        view={
          <>
            {dashboardsQuery.isError ? (
              <Alert>
                {messageFor(dashboardsQuery.error, "Dashboards could not be read.")}
              </Alert>
            ) : null}
            {dashboards === null ? (
              <p className="font-mono text-xs text-muted-foreground">
                Loading dashboards…
              </p>
            ) : dashboards.length === 0 ? (
              <EmptyState
                title="No dashboards"
                body="Keep it empty, or build one with AI."
              />
            ) : (
              <table className={TABLE_CLASSNAME}>
                <thead>
                  <tr>
                    <th scope="col" className={TABLE_HEAD_CLASSNAME}>
                      Dashboard
                    </th>
                    <th scope="col" className={TABLE_HEAD_CLASSNAME}>
                      Updated
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {dashboards.map((dashboard) => (
                    <tr key={dashboard.id} className={TABLE_ROW_CLASSNAME}>
                      <td className={TABLE_CELL_CLASSNAME}>
                        <button
                          type="button"
                          onClick={() => onOpen(dashboard.id)}
                          className="text-xs font-medium text-fg hover:text-cyan"
                        >
                          {dashboard.name}
                        </button>
                      </td>
                      <td className={`${TABLE_CELL_CLASSNAME} tabular-nums text-muted-foreground`}>
                        {new Date(dashboard.updatedAt).toLocaleString()}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </>
        }
      />
      {opening && (
        <CreateDashboardDialog
          onClose={() => setOpening(false)}
          onCreated={(dashboardId) => {
            setOpening(false);
            queryClient.invalidateQueries({ queryKey: ["dashboards"] });
            onOpen(dashboardId);
          }}
        />
      )}
    </div>
  );
}
