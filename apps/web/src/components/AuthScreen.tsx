import { useEffect, useState, type FormEvent } from "react";
import { listProviders } from "../api";
import type { IProvider } from "@heptadec/api/auth-contracts";
import { authClient } from "../auth";
import { Button } from "./ui/button";
import { FieldGroup, FieldLabel } from "./ui/field";
import { Input } from "./ui/input";

type Mode = "sign-in" | "sign-up";

interface IAuthScreenProps {
  mode: Mode;
  onModeChange: (mode: Mode) => void;
  onAuthed: () => void;
}

function LastUsed() {
  return (
    <span className="tag h-5 border-white/28 text-[11px] text-fg">Last used</span>
  );
}

export function AuthScreen({
  mode,
  onModeChange,
  onAuthed,
}: IAuthScreenProps) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [providers, setProviders] = useState<IProvider[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [lastMethod, setLastMethod] = useState<string | null>(null);

  useEffect(() => {
    void listProviders().then(setProviders);
    setLastMethod(authClient.getLastUsedLoginMethod());
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
    } finally {
      setBusy(false);
    }
  }

  async function signInWith(provider: IProvider): Promise<void> {
    setBusy(true);
    setError(null);
    const { error: socialError } = await authClient.signIn.social({
      provider: provider.id,
      callbackURL: "/",
    });
    if (socialError) {
      setError(socialError.message ?? "Sign in did not start.");
    }
    setBusy(false);
  }

  return (
    <div className="halo mx-auto w-full max-w-[440px] px-8 pt-10 pb-10">
      <form className="flex flex-col gap-5" onSubmit={submit}>
        <div className="text-center">
          <h1 className="grad font-display text-2xl tracking-[-0.05em]">
            {mode === "sign-in" ? "Sign in" : "Create your account"}
          </h1>
          <p className="mt-2 text-sm text-muted-foreground">
            {mode === "sign-in"
              ? "Welcome back."
              : "Your name comes from your email address."}
          </p>
        </div>

        {providers.map((provider) => (
          <div key={provider.id} className="flex flex-col items-start gap-2">
            <Button
              type="button"
              variant="social"
              disabled={busy}
              onClick={() => void signInWith(provider)}
            >
              {provider.label}
            </Button>
            {lastMethod === provider.id ? <LastUsed /> : null}
          </div>
        ))}

        <FieldGroup>
          <FieldLabel>Email</FieldLabel>
          <Input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            autoComplete="email"
          />
        </FieldGroup>

        <FieldGroup>
          <FieldLabel>Password</FieldLabel>
          <Input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            minLength={8}
            autoComplete={mode === "sign-up" ? "new-password" : "current-password"}
          />
        </FieldGroup>

        {lastMethod === "email" ? (
          <div className="-mt-2">
            <LastUsed />
          </div>
        ) : null}

        {error ? (
          <div
            role="alert"
            className="rounded-md border border-red/30 bg-red/10 px-3 py-2 text-sm text-red"
          >
            {error}
          </div>
        ) : null}

        <Button type="submit" size="lg" disabled={busy}>
          {busy ? "Working" : mode === "sign-in" ? "Sign in" : "Sign up"}
        </Button>

        <Button
          type="button"
          variant="ghost"
          onClick={() => {
            onModeChange(mode === "sign-in" ? "sign-up" : "sign-in");
            setError(null);
          }}
        >
          {mode === "sign-in"
            ? "Need an account? Sign up"
            : "Have an account? Sign in"}
        </Button>
      </form>
    </div>
  );
}