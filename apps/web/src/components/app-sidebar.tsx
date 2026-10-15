import { useEffect, useState } from "react";
import type { IMembership } from "@heptadec/api/organization-contracts";
import {
  IconChartBar,
  IconClock,
  IconDatabase,
  IconDots,
  IconHistory,
  IconKey,
  IconLogout,
  IconPlugConnected,
  IconSend,
  IconSettings,
  IconUser,
  IconUsers,
} from "@tabler/icons-react";
import { ThemeSwitch } from "./ui/theme-switch";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarRail,
  useSidebar,
} from "@/components/ui/sidebar";
import { Avatar } from "./ui/feedback";
import { OrgSwitcher } from "./OrgSwitcher";

export type WorkspaceView =
  | "sources"
  | "dashboards"
  | "monitoring"
  | "notifications"
  | "ai"
  | "mcp"
  | "team"
  | "audit"
  | "organization";

interface IAppSidebarProps {
  view: WorkspaceView;
  onViewChange: (view: WorkspaceView) => void;
  memberships: IMembership[];
  onSwitchOrganization: (organizationId: string) => void;
  onCreateOrganization: () => void;
  userName: string;
  userImage: string | null;
  onOpenProfile: () => void;
  onSignOut: () => Promise<void>;
}

function SidebarOrgSwitcher({
  memberships,
  onSwitchOrganization,
  onCreateOrganization,
}: {
  memberships: IMembership[];
  onSwitchOrganization: (organizationId: string) => void;
  onCreateOrganization: () => void;
}) {
  const { state } = useSidebar();
  const active =
    memberships.find((membership) => membership.active) ?? memberships[0];

  if (state === "collapsed") {
    return (
      <div
        className="flex justify-center py-1"
        title={active?.organization.name ?? "Organization"}
      >
        <Avatar name={active?.organization.name ?? "?"} />
      </div>
    );
  }
  return (
    <OrgSwitcher
      memberships={memberships}
      onSwitch={onSwitchOrganization}
      onCreate={onCreateOrganization}
    />
  );
}

function SidebarUserCard({
  userName,
  userImage,
  onOpenProfile,
  onOpenOrganization,
  onSignOut,
}: {
  userName: string;
  userImage: string | null;
  onOpenProfile: () => void;
  onOpenOrganization: () => void;
  onSignOut: () => Promise<void>;
}) {
  const { state } = useSidebar();
  const [open, setOpen] = useState(false);

  function choose(action: () => void): void {
    setOpen(false);
    action();
  }

  useEffect(() => {
    if (!open) {
      return;
    }
    function dismiss(event: KeyboardEvent): void {
      if (event.key === "Escape") {
        setOpen(false);
      }
    }
    window.addEventListener("keydown", dismiss);
    return () => window.removeEventListener("keydown", dismiss);
  }, [open ]);

  const avatar = (
    <Avatar
      name={userName}
      image={userImage}
      className="border-transparent bg-cyan font-bold text-on-accent"
    />
  );

  const menu = open ? (
    <>
      <button
        type="button"
        aria-label="Close account menu"
        onClick={() => setOpen(false)}
        className="fixed inset-0 z-40 cursor-default bg-transparent"
      />
      <div
        role="menu"
        aria-label="Account"
        className="absolute bottom-full left-0 z-50 mb-2 w-56 rounded-xl border border-border bg-card p-1.5 shadow-xl"
      >
        <button
          type="button"
          role="menuitem"
          onClick={() => choose(onOpenProfile)}
          className="flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-xs text-fg transition-colors hover:bg-foreground/5"
        >
          <IconUser size={16} className="shrink-0 text-muted-foreground" />
          Profile settings
        </button>
        <button
          type="button"
          role="menuitem"
          onClick={() => choose(onOpenOrganization)}
          className="flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-xs text-fg transition-colors hover:bg-foreground/5"
        >
          <IconSettings size={16} className="shrink-0 text-muted-foreground" />
          Organization settings
        </button>
        <div className="mx-2 my-1 border-t border-border" />
        <div
          role="group"
          aria-label="Theme"
          className="flex items-center gap-1 px-2.5 py-2"
        >
          <ThemeSwitch stretchModes />
        </div>
        <div className="mx-2 my-1 border-t border-border" />
        <button
          type="button"
          role="menuitem"
          onClick={() => choose(() => void onSignOut())}
          className="flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-xs text-fg transition-colors hover:bg-foreground/5"
        >
          <IconLogout size={16} className="shrink-0 text-muted-foreground" />
          Sign out
        </button>
      </div>
    </>
  ) : null;

  if (state === "collapsed") {
    return (
      <div className="relative flex justify-center py-1">
        {menu}
        <button
          type="button"
          title={userName}
          aria-haspopup="menu"
          aria-expanded={open}
          onClick={() => setOpen((current) => !current)}
          className="transition-opacity hover:opacity-80"
        >
          {avatar}
        </button>
      </div>
    );
  }
  return (
    <div className="relative">
      {menu}
      <button
        type="button"
        title={userName}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((current) => !current)}
        className="flex w-full items-center gap-2.5 rounded-xl bg-sidebar-accent p-2.5 text-left transition-colors hover:bg-foreground/10"
      >
        {avatar}
        <span className="min-w-0 flex-1 truncate text-xs font-medium text-fg">
          {userName}
        </span>
        <IconDots size={16} className="shrink-0 text-muted-foreground" />
      </button>
    </div>
  );
}

const NAV_ITEM_CLASSNAME =
  "h-10 rounded-lg text-[14px] text-muted-foreground transition-colors hover:bg-sidebar-accent hover:text-fg data-[active=true]:bg-foreground/10 data-[active=true]:font-medium data-[active=true]:text-fg";

export function AppSidebar({
  view,
  onViewChange,
  memberships,
  onSwitchOrganization,
  onCreateOrganization,
  userName,
  userImage,
  onOpenProfile,
  onSignOut,
}: IAppSidebarProps) {
  return (
    <Sidebar collapsible="icon">
      <SidebarHeader>
        <SidebarOrgSwitcher
          memberships={memberships}
          onSwitchOrganization={onSwitchOrganization}
          onCreateOrganization={onCreateOrganization}
        />
      </SidebarHeader>
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel className="px-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
            Workspace
          </SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              <SidebarMenuItem>
                <SidebarMenuButton
                  isActive={view === "dashboards"}
                  tooltip="Dashboards"
                  onClick={() => onViewChange("dashboards")}
                  className={NAV_ITEM_CLASSNAME}
                >
                  <IconChartBar
                    size={20}
                    strokeWidth={1.5}
                    className="shrink-0"
                  />
                  <span>Dashboards</span>
                </SidebarMenuButton>
              </SidebarMenuItem>
              <SidebarMenuItem>
                <SidebarMenuButton
                  isActive={view === "sources"}
                  tooltip="Data Sources"
                  onClick={() => onViewChange("sources")}
                  className={NAV_ITEM_CLASSNAME}
                >
                  <IconDatabase
                    size={20}
                    strokeWidth={1.5}
                    className="shrink-0"
                  />
                  <span>Data Sources</span>
                </SidebarMenuButton>
              </SidebarMenuItem>
              <SidebarMenuItem>
                <SidebarMenuButton
                  isActive={view === "monitoring"}
                  tooltip="Monitoring"
                  onClick={() => onViewChange("monitoring")}
                  className={NAV_ITEM_CLASSNAME}
                >
                  <IconClock
                    size={20}
                    strokeWidth={1.5}
                    className="shrink-0"
                  />
                  <span>Monitoring</span>
                </SidebarMenuButton>
              </SidebarMenuItem>
              <SidebarMenuItem>
                <SidebarMenuButton
                  isActive={view === "notifications"}
                  tooltip="Notification channels"
                  onClick={() => onViewChange("notifications")}
                  className={NAV_ITEM_CLASSNAME}
                >
                  <IconSend
                    size={20}
                    strokeWidth={1.5}
                    className="shrink-0"
                  />
                  <span>Notifications</span>
                </SidebarMenuButton>
              </SidebarMenuItem>
              <SidebarMenuItem>
                <SidebarMenuButton
                  isActive={view === "ai"}
                  tooltip="AI providers"
                  onClick={() => onViewChange("ai")}
                  className={NAV_ITEM_CLASSNAME}
                >
                  <IconKey
                    size={20}
                    strokeWidth={1.5}
                    className="shrink-0"
                  />
                  <span>AI providers</span>
                </SidebarMenuButton>
              </SidebarMenuItem>
              <SidebarMenuItem>
                <SidebarMenuButton
                  isActive={view === "mcp"}
                  tooltip="MCP"
                  onClick={() => onViewChange("mcp")}
                  className={NAV_ITEM_CLASSNAME}
                >
                  <IconPlugConnected
                    size={20}
                    strokeWidth={1.5}
                    className="shrink-0"
                  />
                  <span>MCP</span>
                </SidebarMenuButton>
              </SidebarMenuItem>
              <SidebarMenuItem>
                <SidebarMenuButton
                  isActive={view === "team"}
                  tooltip="Teams"
                  onClick={() => onViewChange("team")}
                  className={NAV_ITEM_CLASSNAME}
                >
                  <IconUsers size={20} strokeWidth={1.5} className="shrink-0" />
                  <span>Teams</span>
                </SidebarMenuButton>
              </SidebarMenuItem>
              <SidebarMenuItem>
                <SidebarMenuButton
                  isActive={view === "audit"}
                  tooltip="Audit log"
                  onClick={() => onViewChange("audit")}
                  className={NAV_ITEM_CLASSNAME}
                >
                  <IconHistory size={20} strokeWidth={1.5} className="shrink-0" />
                  <span>Audit log</span>
                </SidebarMenuButton>
              </SidebarMenuItem>
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
      <SidebarFooter>
        <SidebarUserCard
          userName={userName}
          userImage={userImage}
          onOpenProfile={onOpenProfile}
          onOpenOrganization={() => onViewChange("organization")}
          onSignOut={onSignOut}
        />
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
  );
}
