import type { ComponentType, ReactNode } from "react";
import {
  IconChartBar,
  IconClock,
  IconCreditCard,
  IconDatabase,
  IconHistory,
  IconKey,
  IconPlugConnected,
  IconSend,
  IconSettings,
  IconUsers,
} from "@tabler/icons-react";
import type { IMembership } from "@heptadec/api/organization-contracts";
import { DataSources } from "./DataSources";
import { AiProviders } from "./AiProviders";
import { McpTokens } from "./McpTokens";
import { Dashboards } from "./dashboards/Dashboards";
import { DashboardDetail } from "./dashboards/DashboardDetail";
import { Monitoring } from "./Monitoring";
import { NotificationChannels } from "./NotificationChannels";
import { OrganizationSettings } from "./OrganizationSettings";
import { TeamPanel } from "./TeamPanel";
import { AuditLog } from "./AuditLog";
import { Billing } from "./Billing";
import type { ICrumb } from "./workspace";

/** The workspace's sections, in sidebar order. One row per section says
 * everything there is to know about it: its view word, its URL slug, its
 * label, its icon and the panel it renders. Every new section is one row. */
export type WorkspaceView =
  | "sources"
  | "dashboards"
  | "monitoring"
  | "notifications"
  | "ai"
  | "mcp"
  | "team"
  | "audit"
  | "billing"
  | "organization";

export interface ISectionIconProps {
  size?: number;
  strokeWidth?: number;
  className?: string;
}

/** What the Dashboard hands a section's panel: the active membership, the
 * state a panel shares with the workspace shell, and the navigation verbs. */
export interface ISectionPanelContext {
  active: IMembership | undefined;
  resetToken: number;
  openDashboard: string | null;
  setTrail: (trail: ICrumb[]) => void;
  setOpenDashboard: (id: string | null) => void;
  openDashboards: () => void;
  goToSection: (view: WorkspaceView) => void;
  onOrganizationChanged: () => void;
}

export interface IWorkspaceSection {
  view: WorkspaceView;
  slug: string;
  label: string;
  icon: ComponentType<ISectionIconProps>;
  inMenu: boolean;
  render: (context: ISectionPanelContext) => ReactNode;
}

export const WORKSPACE_SECTIONS: readonly IWorkspaceSection[] = [
  {
    view: "dashboards",
    slug: "dashboards",
    label: "Dashboards",
    icon: IconChartBar,
    inMenu: true,
    render: (context) =>
      context.openDashboard === null ? (
        <Dashboards onOpen={context.setOpenDashboard} onTrail={context.setTrail} />
      ) : (
        <DashboardDetail
          dashboardId={context.openDashboard}
          onBack={context.openDashboards}
        />
      ),
  },
  {
    view: "sources",
    slug: "data-source",
    label: "Data sources",
    icon: IconDatabase,
    inMenu: true,
    render: (context) => (
      <DataSources resetToken={context.resetToken} onTrail={context.setTrail} />
    ),
  },
  {
    view: "monitoring",
    slug: "monitoring",
    label: "Monitoring",
    icon: IconClock,
    inMenu: true,
    render: (context) => (
      <Monitoring onOpenSources={() => context.goToSection("sources")} />
    ),
  },
  {
    view: "notifications",
    slug: "notifications",
    label: "Notification channels",
    icon: IconSend,
    inMenu: true,
    render: (context) => (
      <NotificationChannels isOwner={context.active?.role === "owner"} />
    ),
  },
  {
    view: "ai",
    slug: "ai-providers",
    label: "AI providers",
    icon: IconKey,
    inMenu: true,
    render: (context) => (
      <AiProviders isOwner={context.active?.role === "owner"} />
    ),
  },
  {
    view: "mcp",
    slug: "mcp",
    label: "MCP",
    icon: IconPlugConnected,
    inMenu: true,
    render: (context) => (
      <McpTokens isOwner={context.active?.role === "owner"} />
    ),
  },
  {
    view: "team",
    slug: "teams",
    label: "Teams",
    icon: IconUsers,
    inMenu: true,
    render: (context) =>
      context.active ? (
        <TeamPanel
          key={context.active.organization.id}
          organizationId={context.active.organization.id}
          role={context.active.role}
        />
      ) : null,
  },
  {
    view: "audit",
    slug: "audit-logs",
    label: "Audit log",
    icon: IconHistory,
    inMenu: true,
    render: (context) =>
      context.active ? (
        <AuditLog
          key={context.active.organization.id}
          isOwner={context.active.role === "owner"}
        />
      ) : null,
  },
  {
    view: "billing",
    slug: "billings",
    label: "Billing",
    icon: IconCreditCard,
    inMenu: true,
    render: (context) => (
      <Billing isOwner={context.active?.role === "owner"} />
    ),
  },
  {
    view: "organization",
    slug: "organization",
    label: "Organization",
    icon: IconSettings,
    inMenu: false,
    render: (context) =>
      context.active ? (
        <OrganizationSettings
          key={context.active.organization.id}
          membership={context.active}
          onChanged={context.onOrganizationChanged}
        />
      ) : null,
  },
];

export function viewForSlug(slug: string): WorkspaceView | null {
  for (const section of WORKSPACE_SECTIONS) {
    if (section.slug === slug) {
      return section.view;
    }
  }
  return null;
}

export function sectionForView(view: WorkspaceView): IWorkspaceSection {
  return WORKSPACE_SECTIONS.find((section) => section.view === view)!;
}

export function slugForView(view: WorkspaceView): string {
  return sectionForView(view).slug;
}
