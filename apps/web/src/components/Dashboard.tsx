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
import { Breadcrumbs, type ICrumb } from "./workspace";
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
  const [trail, setTrail] = useState<ICrumb[]>([]);
  const [resetToken, setResetToken] = useState(0);

  function openDashboards(): void {
    setOpenDashboard(null);
    navigate(orgSlug ? `/${orgSlug}/dashboards` : "/");
  }

  function goToSection(next: WorkspaceView): void {
    setOpenDashboard(null);
    setTrail([]);
    if (next === "sources") {
      setResetToken((count) => count + 1);
    }
    navigate(orgSlug ? `/${orgSlug}/${slugForView(next)}` : "/");
  }

  const panelContext: ISectionPanelContext = {
    active,
    resetToken,
    openDashboard,
    setTrail,
    setOpenDashboard,
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
        <header className="flex h-12 shrink-0 items-center gap-3 border-b border-border px-4">
          <SidebarTrigger />
          <Breadcrumbs
            crumbs={[
              {
                label: sectionForView(view).label,
                onSelect: () => goToSection(view),
              },
              ...trail,
            ]}
          />
        </header>
        {sectionForView(view).render(panelContext)}
      </SidebarInset>
    </SidebarProvider>
  );
}
