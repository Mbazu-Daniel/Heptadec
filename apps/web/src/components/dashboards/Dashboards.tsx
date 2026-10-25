import { useEffect, useState } from "react";
import { listDashboards, messageFor } from "../../api";
import type { IDashboard } from "@heptadec/api/dashboard-contracts";
import { Alert, EmptyState } from "../ui/feedback";
import { Button } from "../ui/button";
import {
  PageHeading,
  TABLE_CELL_CLASSNAME,
  TABLE_CLASSNAME,
  TABLE_HEAD_CLASSNAME,
  TABLE_ROW_CLASSNAME,
  Toolbar,
  Workspace,
  type ICrumb,
} from "../workspace";
import { CreateDashboardDialog } from "./CreateDashboardDialog";

export function Dashboards({
  onOpen,
  onTrail,
}: {
  onOpen: (dashboardId: string) => void;
  onTrail: (crumbs: ICrumb[]) => void;
}) {
  const [dashboards, setDashboards] = useState<IDashboard[] | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [opening, setOpening] = useState(false);

  useEffect(() => {
    let live = true;
    listDashboards().then(
      (found) => {
        if (live) {
          setDashboards(found.dashboards);
        }
      },
      (caught: unknown) => {
        if (live) {
          setProblem(messageFor(caught, "Dashboards could not be read."));
        }
      },
    );
    return () => {
      live = false;
    };
  }, []);

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <PageHeading
        meta={dashboards === null ? undefined : `${dashboards.length} total`}
      />
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
            {problem !== null ? <Alert>{problem}</Alert> : null}
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
                          onClick={() => {
                            onTrail([{ label: dashboard.name }]);
                            onOpen(dashboard.id);
                          }}
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
            onOpen(dashboardId);
          }}
        />
      )}
    </div>
  );
}
