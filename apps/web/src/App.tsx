import { useCallback, useEffect, useState } from "react";
import {
  BrowserRouter,
  Navigate,
  Route,
  Routes,
  useLocation,
  useNavigate,
} from "react-router-dom";
import { fetchMe } from "./api";
import type { IMe } from "@heptadec/api/auth-contracts";
import { authClient } from "./auth";
import { AuthScreen } from "./components/AuthScreen";
import { Dashboard } from "./components/Dashboard";
import { Landing } from "./components/Landing";
import { Onboarding } from "./components/Onboarding";

type Mode = "sign-in" | "sign-up";

function Loading() {
  return (
    <div className="relative grid min-h-screen place-items-center">
      <div className="spot" />
      <p className="relative text-muted">Loading</p>
    </div>
  );
}

function isOnboarded(me: IMe): boolean {
  return me.user.onboardingCompleted;
}

function destinationFor(me: IMe): string {
  return isOnboarded(me) ? "/app" : "/welcome";
}

function AuthRoute({ me, reload }: { me: IMe | null; reload: () => Promise<void> }) {
  const navigate = useNavigate();
  const mode: Mode = useLocation().pathname === "/signup" ? "sign-up" : "sign-in";

  if (me) {
    return <Navigate to={destinationFor(me)} replace />;
  }
  return (
    <div className="relative min-h-screen">
      <div className="spot" />
      <div className="mx-auto grid min-h-screen max-w-[1280px] place-items-center px-6 py-24">
        <AuthScreen
          mode={mode}
          onModeChange={(next) => navigate(next === "sign-in" ? "/signin" : "/signup")}
          onAuthed={() => void reload()}
        />
      </div>
    </div>
  );
}

function App() {
  const [me, setMe] = useState<IMe | null>(null);
  const [checked, setChecked] = useState(false);
  const navigate = useNavigate();

  const reload = useCallback(async () => {
    try {
      setMe(await fetchMe());
    } catch {
      setMe(null);
    } finally {
      setChecked(true);
    }
  }, []);

  useEffect(() => {
    void reload();
  }, [reload]);

  if (!checked) {
    return <Loading />;
  }

  const authed = <Navigate to={me ? destinationFor(me) : "/signin"} replace />;
  const anon = <Navigate to="/signin" replace />;

  return (
    <Routes>
      <Route
        path="/"
        element={
          <Landing
            onGetStarted={() => navigate(me ? destinationFor(me) : "/signup")}
          />
        }
      />
      <Route path="/signin" element={<AuthRoute me={me} reload={reload} />} />
      <Route path="/signup" element={<AuthRoute me={me} reload={reload} />} />
      <Route
        path="/welcome"
        element={
          me ? (
            isOnboarded(me) ? (
              <Navigate to="/app" replace />
            ) : (
              <Onboarding me={me} onDone={() => void reload()} />
            )
          ) : (
            anon
          )
        }
      />
      <Route
        path="/app"
        element={
          me && isOnboarded(me) ? (
            <Dashboard
              me={me}
              onSignOut={async () => {
                await authClient.signOut();
                setMe(null);
              }}
            />
          ) : (
            authed
          )
        }
      />
      <Route path="*" element={<Navigate to="/" replace />} />
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