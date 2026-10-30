import { useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import type { IMe } from "@heptadec/api/auth-contracts";
import type { IMembership } from "@heptadec/api/organization-contracts";
import { SidebarInset, SidebarProvider, SidebarTrigger } from "./ui/sidebar";
import { AppSidebar } from "./app-sidebar";
import {
  sectionForView,
  slugForView,
  viewForSlug,
  type ISectionPanelContext,
  type WorkspaceView,
} from "./workspace-sections";
import { NotFound } from "./NotFound";

interface IDashboardProps {
  me: IMe;
  memberships: IMembership[];
  onSwitchOrganization: (organizationId: string) => void;
  onCreateOrganization: () => void;
  onOpenProfile: () => void;
  onOrganizationChanged: () => void;
  onSignOut: () => Promise<void>;
}

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
  const { orgSlug, section } = useParams<{ orgSlug: string; section?: string }>();
  const navigate = useNavigate();
  if (section !== undefined && viewForSlug(section) === null) {
    return <NotFound />;
  }
  const view: WorkspaceView =
    section === undefined ? "sources" : viewForSlug(section)!;
  const [openDashboard, setOpenDashboard] = useState<string | null>(null);
  const [openSource, setOpenSource] = useState<string | null>(null);

  function openDashboards(): void {
    setOpenDashboard(null);
    navigate(orgSlug ? `/${orgSlug}/dashboards` : "/");
  }

  function goToSection(next: WorkspaceView): void {
    setOpenDashboard(null);
    setOpenSource(null);
    navigate(orgSlug ? `/${orgSlug}/${slugForView(next)}` : "/");
  }

  const panelContext: ISectionPanelContext = {
    active,
    openDashboard,
    openSource,
    setOpenDashboard,
    setOpenSource,
    openDashboards,
    goToSection,
    onOrganizationChanged,
  };

  return (
    <SidebarProvider>
      <AppSidebar
        view={view}
        onViewChange={goToSection}
        memberships={memberships}
        onSwitchOrganization={onSwitchOrganization}
        onCreateOrganization={onCreateOrganization}
        userName={me.displayName ?? (me.user.name === "" ? me.user.email : me.user.name)}
        image={me.image}
        onOpenProfile={onOpenProfile}
        onSignOut={onSignOut}
      />
      <SidebarInset>
        <SidebarTrigger className="absolute top-2 left-3 z-30 md:hidden" />
        {sectionForView(view).render(panelContext)}
      </SidebarInset>
    </SidebarProvider>
  );
}
