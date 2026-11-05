import { useState, type FormEvent } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
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

export function ResetPassword() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  const token = params.get("token");
  const fromHash =
    token === null
      ? new URLSearchParams(window.location.hash.replace(/^#/, "")).get("token")
      : null;
  const usable = token ?? fromHash;

  async function submit(event: FormEvent): Promise<void> {
    event.preventDefault();
    if (usable === null) {
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const result = await authClient.resetPassword({
        newPassword: password,
        token: usable,
      });
      if (result.error) {
        setError(result.error.message ?? "That link is no longer valid.");
        return;
      }
      setDone(true);
    } catch {
      setError("That link is no longer valid. Ask for a new one.");
    } finally {
      setBusy(false);
    }
  }

  if (usable === null) {
    return (
      <AuthPage
        eyebrow="Reset your password"
        title="This link is incomplete"
        lede="The link is missing its token. Ask for a new one and open it from the same device."
      >
        <button
          type="button"
          className={AUTH_PRIMARY_BUTTON_CLASSNAME}
          onClick={() => navigate("/forgot-password")}
        >
          Ask for a new link
        </button>
      </AuthPage>
    );
  }

  return (
    <AuthPage
      eyebrow="Reset your password"
      title={done ? "Password changed" : "Choose a new password"}
      lede={
        done
          ? "You can sign in with it now."
          : "Pick something you have not used here before."
      }
    >
      {done ? (
        <div className="flex items-center gap-4">
          <button
            type="button"
            className={AUTH_PRIMARY_BUTTON_CLASSNAME}
            onClick={() => navigate("/signin")}
          >
            Go to sign in
          </button>
        </div>
      ) : (
        <form className="flex flex-col gap-5" onSubmit={submit}>
          <div className="flex flex-col gap-2">
            <label className={AUTH_LABEL_CLASSNAME} htmlFor="reset-password">
              New password
            </label>
            <Input
              id="reset-password"
              type="password"
              className={AUTH_INPUT_CLASSNAME}
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              required
              minLength={8}
              autoComplete="new-password"
            />
          </div>

          {error !== null ? (
            <div role="alert" className={AUTH_ERROR_CLASSNAME}>
              {error}
            </div>
          ) : null}

          <div className="flex items-center gap-4">
            <button
              type="submit"
              disabled={busy}
              className={AUTH_PRIMARY_BUTTON_CLASSNAME}
            >
              {busy ? "Saving…" : "Save the new password"}
            </button>
            <button
              type="button"
              className={AUTH_GHOST_BUTTON_CLASSNAME}
              onClick={() => navigate("/signin")}
            >
              Back to sign in
            </button>
          </div>
        </form>
      )}
    </AuthPage>
  );
}