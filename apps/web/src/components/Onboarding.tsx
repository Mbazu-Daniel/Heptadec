import { useState, type FormEvent } from "react";
import { completeOnboarding } from "../api";
import type { IMe } from "@heptadec/api/auth-contracts";
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

interface IOnboardingProps {
  me: IMe;
  onDone: () => void;
}

const STEPS = [
  {
    title: "Pick a name",
    body: "We set this from your email address. Each organization can give you a different name later.",
  },
  {
    title: "Connect a source",
    body: "Connect Heptadec to a Postgres, Redis, or Quickwit database. The connection is always read-only.",
  },
  {
    title: "Ask",
    body: "Write a query in SQL. The server sends the results back. A cap and a timeout stop long queries.",
  },
];

export function Onboarding({ me, onDone }: IOnboardingProps) {
  const [step, setStep] = useState(0);
  const [name, setName] = useState(me.user.name);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isLast = step === STEPS.length - 1;
  const current = STEPS[step]!;

  async function next(event: FormEvent): Promise<void> {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      if (step === 0 && name !== me.user.name) {
        const result = await authClient.updateUser({ name });
        if (result.error) {
          setError(result.error.message ?? "Cannot save the name.");
          return;
        }
      }
      if (isLast) {
        await completeOnboarding();
        onDone();
        return;
      }
      setStep(step + 1);
    } catch {
      setError("That could not be saved. Try again in a moment.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <AuthPage
      wide
      eyebrow={`Step ${step + 1} of ${STEPS.length}`}
      title={current.title}
      lede={current.body}
    >
      <form className="flex flex-col gap-5" onSubmit={next}>
        {step === 0 ? (
          <div className="flex flex-col gap-2">
            <label className={AUTH_LABEL_CLASSNAME} htmlFor="onboarding-name">
              Name
            </label>
            <Input
              id="onboarding-name"
              className={AUTH_INPUT_CLASSNAME}
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              autoComplete="name"
            />
          </div>
        ) : null}

        {step === 1 ? (
          <div className="flex flex-col gap-2">
            <label className={AUTH_LABEL_CLASSNAME} htmlFor="onboarding-email">
              Email
            </label>
            <Input
              id="onboarding-email"
              className={AUTH_INPUT_CLASSNAME}
              value={me.user.email}
              readOnly
              disabled
            />
          </div>
        ) : null}

        {error ? (
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
            {busy ? "Working…" : isLast ? "Finish" : "Continue"}
          </button>
          {step > 0 ? (
            <button
              type="button"
              className={AUTH_GHOST_BUTTON_CLASSNAME}
              onClick={() => setStep(step - 1)}
            >
              Back
            </button>
          ) : null}
        </div>
      </form>
    </AuthPage>
  );
}
