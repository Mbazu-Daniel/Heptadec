import { useState } from "react";
import type { IMe } from "@heptadec/api/auth-contracts";
import type { IMembership } from "@heptadec/api/organization-contracts";
import { SidebarInset, SidebarProvider, SidebarTrigger } from "./ui/sidebar";
import { AppSidebar, type WorkspaceView } from "./app-sidebar";
import { DataSources } from "./DataSources";
import { AiProviders } from "./AiProviders";
import { Breadcrumbs, type ICrumb } from "./workspace";
import { McpTokens } from "./McpTokens";
import { Dashboards } from "./dashboards/Dashboards";
import { DashboardDetail } from "./dashboards/DashboardDetail";
import { Monitoring } from "./Monitoring";
import { NotificationChannels } from "./NotificationChannels";
import { OrganizationSettings } from "./OrganizationSettings";
import { TeamPanel } from "./TeamPanel";
import { AuditLog } from "./AuditLog";

interface IDashboardProps {
  me: IMe;
  memberships: IMembership[];
  onSwitchOrganization: (organizationId: string) => void;
  onCreateOrganization: () => void;
  onOpenProfile: () => void;
  onOrganizationChanged: () => void;
  onSignOut: () => Promise<void>;
}

const VIEW_LABELS: Record<WorkspaceView, string> = {
  sources: "Data sources",
  dashboards: "Dashboards",
  monitoring: "Monitoring",
  notifications: "Notification channels",
  ai: "AI providers",
  mcp: "MCP",
  team: "Teams",
  audit: "Audit log",
  organization: "Organization",
};

export function Dashboard({
  me,
  memberships,
  onSwitchOrganization,
  onCreateOrganization,
  onOpenProfile,
  onOrganizationChanged,
  onSignOut,
}: IDashboardProps) {
  const active = memberships.find((membership) => membership.active);
  const [view, setView] = useState<WorkspaceView>("sources");
  const [openDashboard, setOpenDashboard] = useState<string | null>(null);
  const [trail, setTrail] = useState<ICrumb[]>([]);
  const [resetToken, setResetToken] = useState(0);

  function openDashboards(): void {
    setOpenDashboard(null);
    setView("dashboards");
  }

  function goToSection(next: WorkspaceView): void {
    setOpenDashboard(null);
    setTrail([]);
    setView(next);
    if (next === "sources") {
      setResetToken((count) => count + 1);
    }
  }

  return (
    <SidebarProvider>
      <AppSidebar
        view={view}
        onViewChange={(next) => {
          setOpenDashboard(null);
          setView(next);
        }}
        memberships={memberships}
        onSwitchOrganization={onSwitchOrganization}
        onCreateOrganization={onCreateOrganization}
        userName={me.displayName ?? (me.user.name === "" ? me.user.email : me.user.name)}
        image={me.image}
        onOpenProfile={onOpenProfile}
        onSignOut={onSignOut}
      />
      <SidebarInset>
        <header className="flex h-12 shrink-0 items-center gap-3 border-b border-border px-4">
          <SidebarTrigger />
          <Breadcrumbs
            crumbs={[
              { label: VIEW_LABELS[view], onSelect: () => goToSection(view) },
              ...trail,
            ]}
          />
        </header>
        {view === "sources" ? (
          <DataSources resetToken={resetToken} onTrail={setTrail} />
        ) : view === "dashboards" ? (
          openDashboard === null ? (
            <Dashboards onOpen={setOpenDashboard} onTrail={setTrail} />
          ) : (
            <DashboardDetail dashboardId={openDashboard} onBack={openDashboards} />
          )
        ) : view === "monitoring" ? (
          <Monitoring onOpenSources={() => goToSection("sources")} />
        ) : view === "notifications" ? (
          <NotificationChannels isOwner={active?.role === "owner"} />
        ) : view === "mcp" ? (
          <McpTokens isOwner={active?.role === "owner"} />
        ) : view === "ai" ? (
          <AiProviders isOwner={active?.role === "owner"} />
        ) : view === "team" ? (
          active ? (
            <TeamPanel
              key={active.organization.id}
              organizationId={active.organization.id}
              role={active.role}
            />
          ) : null
        ) : view === "audit" ? (
          active ? (
            <AuditLog
              key={active.organization.id}
              isOwner={active.role === "owner"}
            />
          ) : null
        ) : view === "organization" ? (
          active ? (
            <OrganizationSettings
              key={active.organization.id}
              membership={active}
              onChanged={onOrganizationChanged}
            />
          ) : null
        ) : null}
      </SidebarInset>
    </SidebarProvider>
  );
}
