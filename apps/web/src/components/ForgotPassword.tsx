import { useState, type FormEvent } from "react";
import { authClient } from "../auth";
import { Input } from "./ui/input";
import {
  AUTH_ERROR_CLASSNAME,
  AUTH_GHOST_BUTTON_CLASSNAME,
  AUTH_INPUT_CLASSNAME,
  AUTH_LABEL_CLASSNAME,
  AUTH_PRIMARY_BUTTON_CLASSNAME,
  AuthPage,
} from "./AuthShell";

export function ForgotPassword({ onDone }: { onDone: () => void }) {
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);

  async function submit(event: FormEvent): Promise<void> {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const result = await authClient.requestPasswordReset({
        email,
        redirectTo: `${window.location.origin}/reset-password`,
      });
      if (result.error) {
        setError(result.error.message ?? "That link could not be sent.");
        return;
      }
      setSent(true);
    } catch {
      setError("That link could not be sent. Try again in a moment.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <AuthPage
      eyebrow="Reset your password"
      title={sent ? "Check your email" : "Forgot your password?"}
      lede={
        sent
          ? "If that address has an account, a link to choose a new password is on its way. The link expires in an hour."
          : "Give us the address you sign in with and we will send a link to choose a new password."
      }
    >
      <form className="flex flex-col gap-5" onSubmit={submit}>
        {sent ? null : (
          <div className="flex flex-col gap-2">
            <label className={AUTH_LABEL_CLASSNAME} htmlFor="forgot-email">
              Email
            </label>
            <Input
              id="forgot-email"
              type="email"
              className={AUTH_INPUT_CLASSNAME}
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              required
              autoComplete="email"
            />
          </div>
        )}

        {error !== null ? (
          <div role="alert" className={AUTH_ERROR_CLASSNAME}>
            {error}
          </div>
        ) : null}

        <div className="flex items-center gap-4">
          {sent ? null : (
            <button
              type="submit"
              disabled={busy}
              className={AUTH_PRIMARY_BUTTON_CLASSNAME}
            >
              {busy ? "Sending…" : "Send the link"}
            </button>
          )}
          <button
            type="button"
            className={AUTH_GHOST_BUTTON_CLASSNAME}
            onClick={onDone}
          >
            Back to sign in
          </button>
        </div>
      </form>
    </AuthPage>
  );
}