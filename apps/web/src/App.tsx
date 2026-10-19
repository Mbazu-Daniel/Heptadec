import { useCallback, useEffect, useState } from "react";
import {
  BrowserRouter,
  Navigate,
  Outlet,
  Route,
  Routes,
  useLocation,
  useNavigate,
  useParams,
} from "react-router-dom";
import { fetchMe, fetchOrganizations, switchOrganization } from "./api";
import type { IMe } from "@heptadec/api/auth-contracts";
import type { IOrganizationsResponse } from "@heptadec/api/organization-contracts";
import { authClient } from "./auth";
import { AcceptInvitation } from "./components/AcceptInvitation";
import { AuthScreen } from "./components/AuthScreen";
import { CreateOrganization } from "./components/CreateOrganization";
import { Dashboard } from "./components/Dashboard";
import { Landing } from "./components/Landing";
import { ForgotPassword } from "./components/ForgotPassword";
import { MemberProfile } from "./components/MemberProfile";
import { ResetPassword } from "./components/ResetPassword";
import { NotFound } from "./components/NotFound";
import { Onboarding } from "./components/Onboarding";
import { SubscriptionGate } from "./components/Paywall";
import { PublicDashboard } from "./components/PublicDashboard";

type Mode = "sign-in" | "sign-up";

const PAGE_ROUTES = [
  "/",
  "/signin",
  "/signup",
  "/welcome",
  "/organization",
  "/profile",
  "/forgot-password",
  "/reset-password",
];

function Loading() {
  return (
    <div className="relative grid min-h-screen place-items-center">
      <div className="spot" />
      <p className="relative text-muted-foreground">Loading</p>
    </div>
  );
}

function isOnboarded(me: IMe): boolean {
  return me.user.onboardingCompleted;
}

function hasOrganization(orgs: IOrganizationsResponse | null): boolean {
  return (orgs?.organizations.length ?? 0) > 0;
}

function slugFor(
  orgs: IOrganizationsResponse | null,
  organizationId: string,
): string | null {
  const match = orgs?.organizations.find(
    (membership) => membership.organization.id === organizationId,
  );
  return match?.organization.slug ?? null;
}

function activeSlug(orgs: IOrganizationsResponse | null): string | null {
  const memberships = orgs?.organizations ?? [];
  const active = memberships.find(
    (membership) => membership.organization.id === orgs?.activeOrganizationId,
  );
  return (active ?? memberships[0])?.organization.slug ?? null;
}

function destinationFor(me: IMe, orgs: IOrganizationsResponse | null): string {
  if (!isOnboarded(me)) {
    return "/welcome";
  }
  const slug = activeSlug(orgs);
  return slug ? `/${slug}` : "/organization";
}

function OrgRoute({
  me,
  orgs,
  onEnter,
  onSignOut,
}: {
  me: IMe | null;
  orgs: IOrganizationsResponse | null;
  onEnter: (organizationId: string) => void;
  onSignOut: () => void;
}) {
  const { orgSlug } = useParams();
  const membership =
    orgs?.organizations.find((entry) => entry.organization.slug === orgSlug) ??
    null;
  const isActive = membership !== null && membership.organization.id === orgs?.activeOrganizationId;

  useEffect(() => {
    if (membership && !isActive) {
      onEnter(membership.organization.id);
    }
  }, [membership, isActive, onEnter]);

  if (!membership) {
    return <Navigate to={me ? destinationFor(me, orgs) : "/signin"} replace />;
  }
  if (!isActive) {
    return <Loading />;
  }
  const others = (orgs?.organizations ?? [])
    .filter((entry) => entry.organization.slug !== membership.organization.slug)
    .map((entry) => ({
      name: entry.organization.name,
      slug: entry.organization.slug,
    }));
  return (
    <SubscriptionGate
      isOwner={membership.role === "owner"}
      others={others}
      onSignOut={onSignOut}
    >
      <Outlet />
    </SubscriptionGate>
  );
}

function AuthRoute({ me, orgs, reload }: { me: IMe | null; orgs: IOrganizationsResponse | null; reload: () => Promise<void> }) {
  const navigate = useNavigate();
  const mode: Mode = useLocation().pathname === "/signup" ? "sign-up" : "sign-in";

  if (me) {
    return <Navigate to={destinationFor(me, orgs)} replace />;
  }
  return (
    <AuthScreen
      mode={mode}
      onModeChange={(next) => navigate(next === "sign-in" ? "/signin" : "/signup")}
      onAuthed={() => void reload()}
      onForgotPassword={() => navigate("/forgot-password")}
    />
  );
}

function InviteRoute({
  me,
  orgs,
  reload,
}: {
  me: IMe | null;
  orgs: IOrganizationsResponse | null;
  reload: () => Promise<void>;
}) {
  const { id = "" } = useParams();
  const navigate = useNavigate();
  const home = me ? destinationFor(me, orgs) : "/signin";

  return (
    <AcceptInvitation
      invitationId={id}
      signedIn={me !== null}
      onSignIn={() => navigate(`/signin?next=/invite/${id}`)}
      onDone={() => {
        void reload();
        navigate(home);
      }}
      onDeclined={() => navigate(home)}
    />
  );
}

function ShareRoute() {
  const { token = "" } = useParams();
  return <PublicDashboard token={token} />;
}

function App() {  const [me, setMe] = useState<IMe | null>(null);
  const [orgs, setOrgs] = useState<IOrganizationsResponse | null>(null);
  const [checked, setChecked] = useState(false);
  const navigate = useNavigate();
  const location = useLocation();

  const reload = useCallback(async () => {
    try {
      const [meResult, orgResult] = await Promise.all([
        fetchMe(),
        fetchOrganizations(),
      ]);
      setMe(meResult);
      setOrgs(orgResult);
    } catch {
      setMe(null);
      setOrgs(null);
    } finally {
      setChecked(true);
    }
  }, []);

  const onSwitchOrganization = useCallback(
    async (organizationId: string) => {
      try {
        await switchOrganization(organizationId);
      } catch (caught) {
        console.error("[web] could not switch organization:", caught);
        setOrgs(null);
        await reload();
        return;
      }
      await reload();
    },
    [reload],
  );

  const onEnterOrganization = useCallback(
    (organizationId: string) => {
      void onSwitchOrganization(organizationId);
    },
    [onSwitchOrganization],
  );

  const onSignOut = useCallback(async () => {
    await authClient.signOut();
    setMe(null);
  }, []);

  const onOpenOrganization = useCallback(
    (organizationId: string) => {
      const slug = slugFor(orgs, organizationId);
      if (slug) {
        navigate(`/${slug}`);
      }
    },
    [orgs, navigate],
  );

  useEffect(() => {
    void reload();
  }, [reload]);

  const isAppShell =
    !PAGE_ROUTES.includes(location.pathname) &&
    !location.pathname.startsWith("/invite/") &&
    !location.pathname.startsWith("/share/");

  useEffect(() => {
    document.documentElement.dataset.shell = isAppShell ? "app" : "page";
  }, [isAppShell]);

  if (!checked) {
    return <Loading />;
  }

  const authed = <Navigate to={me ? destinationFor(me, orgs) : "/signin"} replace />;
  const anon = <Navigate to="/signin" replace />;
  const addingOrganization = new URLSearchParams(location.search).has("new");

  return (
    <Routes>
      <Route
        path="/"
        element={
          <Landing
            onGetStarted={() => navigate(me ? destinationFor(me, orgs) : "/signup")}
          />
        }
      />
      <Route path="/signin" element={<AuthRoute me={me} orgs={orgs} reload={reload} />} />
      <Route path="/signup" element={<AuthRoute me={me} orgs={orgs} reload={reload} />} />
      <Route
        path="/forgot-password"
        element={
          me ? (
            <Navigate to={destinationFor(me, orgs)} replace />
          ) : (
            <ForgotPassword onDone={() => navigate("/signin")} />
          )
        }
      />
      <Route
        path="/reset-password"
        element={
          me ? <Navigate to={destinationFor(me, orgs)} replace /> : <ResetPassword />
        }
      />
      <Route
        path="/welcome"
        element={
          me ? (
            isOnboarded(me) ? (
              <Navigate to={destinationFor(me, orgs)} replace />
            ) : (
              <Onboarding me={me} orgs={orgs} onDone={() => void reload()} />
            )
          ) : (
            anon
          )
        }
      />
      <Route
        path="/organization"
        element={
          me && isOnboarded(me) ? (
            hasOrganization(orgs) && !addingOrganization ? (
              <Navigate to={destinationFor(me, orgs)} replace />
            ) : (
              <CreateOrganization
                onCreated={(slug) => {
                  void reload().then(() => navigate(`/${slug}`));
                }}
              />
            )
          ) : (
            authed
          )
        }
      />
      <Route
        path="/profile"
        element={
          me && isOnboarded(me) && hasOrganization(orgs) ? (
            <MemberProfile
              me={me}
              onReload={() => void reload()}
              onBack={() => navigate(destinationFor(me, orgs))}
            />
          ) : (
            authed
          )
        }
      />
      <Route
        path="/app"
        element={<Navigate to={me ? destinationFor(me, orgs) : "/signin"} replace />}
      />
      <Route
        path="/:orgSlug"
        element={
          me && isOnboarded(me) ? (
            <OrgRoute
              me={me}
              orgs={orgs}
              onEnter={onEnterOrganization}
              onSignOut={onSignOut}
            />
          ) : (
            authed
          )
        }
      >
        <Route
          index
          element={
            <Dashboard
              me={me!}
              memberships={orgs?.organizations ?? []}
              onSwitchOrganization={onOpenOrganization}
              onCreateOrganization={() => navigate("/organization?new=1")}
              onOpenProfile={() => navigate("/profile")}
              onOrganizationChanged={reload}
              onSignOut={onSignOut}
            />
          }
        />
        <Route path="*" element={<NotFound />} />
      </Route>
      <Route path="/invite/:id" element={<InviteRoute me={me} orgs={orgs} reload={reload} />} />
      <Route path="/share/:token" element={<ShareRoute />} />
      <Route path="*" element={<NotFound />} />
    </Routes>
  );
}

export function Root() {
  return (
    <BrowserRouter>
      <App />
    </BrowserRouter>
  );
}
