import { useEffect, useState, type FormEvent } from "react";
import {
  IconBrandGithub,
  IconBrandGoogle,
  IconEye,
  IconEyeOff,
} from "@tabler/icons-react";
import { listProviders } from "../api";
import type { IProvider, ProviderId } from "@heptadec/api/auth-contracts";
import { authClient } from "../auth";
import { Input } from "./ui/input";
import {
  AUTH_ERROR_CLASSNAME,
  AUTH_INPUT_CLASSNAME,
  AUTH_LABEL_CLASSNAME,
  AUTH_LINK_BUTTON_CLASSNAME,
  AUTH_PRIMARY_BUTTON_CLASSNAME,
  AUTH_SOCIAL_BUTTON_CLASSNAME,
  AuthSplitLayout,
} from "./AuthShell";

type Mode = "sign-in" | "sign-up";

interface IAuthScreenProps {
  mode: Mode;
  onModeChange: (mode: Mode) => void;
  onAuthed: () => void;
  onForgotPassword: () => void;
}

const PROVIDER_BRANDS: Record<
  ProviderId,
  { name: string; icon: typeof IconBrandGoogle }
> = {
  google: { name: "Google", icon: IconBrandGoogle },
  github: { name: "GitHub", icon: IconBrandGithub },
};

function LastUsed() {
  return (
    <span className="inline-flex h-5 items-center rounded-full border border-(--mk-hairline) px-2 font-mono text-[12px] text-(--mk-fg-muted)">
      Last used
    </span>
  );
}

export function AuthScreen({
  mode,
  onModeChange,
  onAuthed,
  onForgotPassword,
}: IAuthScreenProps) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [providers, setProviders] = useState<IProvider[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [lastMethod, setLastMethod] = useState<string | null>(null);
  const [unreachable, setUnreachable] = useState(false);

  useEffect(() => {
    let live = true;
    void listProviders().then(
      (found) => {
        if (live) {
          setProviders(found);
        }
      },
      () => {
        if (live) {
          setUnreachable(true);
        }
      },
    );
    setLastMethod(authClient.getLastUsedLoginMethod());
    return () => {
      live = false;
    };
  }, []);

  async function submit(event: FormEvent): Promise<void> {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const result =
        mode === "sign-up"
          ? await authClient.signUp.email({ email, password, name: "" })
          : await authClient.signIn.email({ email, password });

      if (result.error) {
        setError(result.error.message ?? "Authentication failed");
        return;
      }
      onAuthed();
    } catch {
      setError("That could not be saved. Try again in a moment.");
    } finally {
      setBusy(false);
    }
  }

  async function signInWith(provider: IProvider): Promise<void> {
    setBusy(true);
    setError(null);
    try {
      const { error: socialError } = await authClient.signIn.social({
        provider: provider.id,
        callbackURL: "/",
      });
      if (socialError) {
        setError(socialError.message ?? "Sign in did not start.");
      }
    } catch {
      setError("That provider could not be reached. Try again in a moment.");
    } finally {
      setBusy(false);
    }
  }

  const enabledIds = new Set(providers.map((provider) => provider.id));
  const socialIds: ProviderId[] = ["google", "github"];

  function switchMode(): void {
    onModeChange(mode === "sign-in" ? "sign-up" : "sign-in");
    setError(null);
  }

  return (
    <AuthSplitLayout>
      <h1 className="text-center font-display text-[28px] leading-[34px] font-medium tracking-[-0.02em] text-(--mk-fg-primary)">
        {mode === "sign-in" ? "Sign in to Heptadec" : "Create your account"}
      </h1>
      <p className="mt-3 text-center text-sm text-(--mk-fg-muted)">
        {mode === "sign-in" ? (
          <>
            New to Heptadec?{" "}
            <button
              type="button"
              onClick={switchMode}
              className={AUTH_LINK_BUTTON_CLASSNAME}
            >
              Sign up for an account
            </button>
          </>
        ) : (
          <>
            Already have an account?{" "}
            <button
              type="button"
              onClick={switchMode}
              className={AUTH_LINK_BUTTON_CLASSNAME}
            >
              Sign in
            </button>
          </>
        )}
      </p>

      <div className="mt-8">
        <div className="grid grid-cols-2 gap-3">
          {socialIds.map((id) => {
            const brand = PROVIDER_BRANDS[id];
            const Icon = brand.icon;
            const enabled = enabledIds.has(id);
            return (
              <button
                key={id}
                type="button"
                disabled={busy || !enabled}
                title={
                  enabled
                    ? undefined
                    : unreachable
                      ? "The API could not be reached"
                      : `${brand.name} sign-in is not configured on this instance`
                }
                onClick={() => void signInWith({ id, label: brand.name })}
                className={AUTH_SOCIAL_BUTTON_CLASSNAME}
              >
                <Icon size={18} stroke={1.8} aria-hidden="true" />
                {brand.name}
              </button>
            );
          })}
        </div>
        {socialIds.some((id) => lastMethod === id) ? (
          <div className="mt-2">
            <LastUsed />
          </div>
        ) : null}
        <div className="my-6 flex items-center gap-4">
          <span className="h-px flex-1 bg-(--mk-hairline)" />
          <span className="font-mono text-[13px] text-(--mk-fg-muted)">
            Or continue with
          </span>
          <span className="h-px flex-1 bg-(--mk-hairline)" />
        </div>
      </div>

      <form className="flex flex-col gap-5" onSubmit={submit}>
        <div className="flex flex-col gap-2">
          <label className={AUTH_LABEL_CLASSNAME} htmlFor="auth-email">
            Email
          </label>
          <Input
            id="auth-email"
            type="email"
            className={AUTH_INPUT_CLASSNAME}
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            autoComplete="email"
            placeholder="Enter your email address"
          />
        </div>

        <div className="flex flex-col gap-2">
          <label className={AUTH_LABEL_CLASSNAME} htmlFor="auth-password">
            Password
          </label>
          <div className="relative">
            <Input
              id="auth-password"
              type={showPassword ? "text" : "password"}
              className={`${AUTH_INPUT_CLASSNAME} pr-12`}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              minLength={8}
              autoComplete={
                mode === "sign-up" ? "new-password" : "current-password"
              }
              placeholder="Enter a unique password"
            />
            <button
              type="button"
              aria-label={showPassword ? "Hide password" : "Show password"}
              onClick={() => setShowPassword(!showPassword)}
              className="absolute top-1/2 right-4 -translate-y-1/2 text-(--mk-fg-muted) transition-colors duration-150 hover:text-(--mk-fg-primary)"
            >
              {showPassword ? (
                <IconEyeOff size={18} stroke={1.8} aria-hidden="true" />
              ) : (
                <IconEye size={18} stroke={1.8} aria-hidden="true" />
              )}
            </button>
          </div>
          {mode === "sign-in" ? (
            <button
              type="button"
              onClick={onForgotPassword}
              className={`${AUTH_LINK_BUTTON_CLASSNAME} self-end`}
            >
              Forgot password?
            </button>
          ) : null}
        </div>

        {lastMethod === "email" ? (
          <div className="-mt-2">
            <LastUsed />
          </div>
        ) : null}

        {error ? (
          <div role="alert" className={AUTH_ERROR_CLASSNAME}>
            {error}
          </div>
        ) : null}

        <button
          type="submit"
          disabled={busy}
          className={AUTH_PRIMARY_BUTTON_CLASSNAME}
        >
          {busy
            ? mode === "sign-in"
              ? "Signing in…"
              : "Creating account…"
            : mode === "sign-in"
              ? "Sign in"
              : "Sign up"}
        </button>
      </form>
    </AuthSplitLayout>
  );
}
