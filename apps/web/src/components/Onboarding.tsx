import { useState, type FormEvent } from "react";
import { completeOnboarding } from "../api";
import type { IMe } from "@heptadec/api/auth-contracts";
import { authClient } from "../auth";
import { Button } from "./ui/button";
import { FieldGroup, FieldLabel } from "./ui/field";
import { Input } from "./ui/input";

interface IOnboardingProps {
  me: IMe;
  onDone: () => void;
}

const STEPS = [
  {
    title: "Pick a name",
    body: "We set this name from your email address. Change it if it is not correct.",
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
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="relative min-h-screen">
      <div className="spot" />

      <div className="mx-auto flex min-h-screen max-w-[1280px] flex-col justify-center px-6">
        <div className="halo mx-auto w-full max-w-[560px] px-8 pt-10 pb-10">
          <p className="text-[11px] uppercase tracking-[0.02em] text-muted-foreground">
            Step {step + 1} of {STEPS.length}
          </p>

          <h1 className="grad mt-3 font-display text-2xl tracking-[-0.05em]">
            {current.title}
          </h1>
          <p className="mt-2 text-muted-foreground">{current.body}</p>

          <form className="mt-8 flex flex-col gap-5" onSubmit={next}>
            {step === 0 ? (
              <FieldGroup>
                  <FieldLabel>Display name</FieldLabel>
                  <Input
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    required
                    autoComplete="name"
                  />
                </FieldGroup>
              ) : null}

              {step === 1 ? (
                <FieldGroup>
                  <FieldLabel>Email</FieldLabel>
                  <Input value={me.user.email} readOnly disabled />
                </FieldGroup>
              ) : null}

            {error ? (
              <div
                role="alert"
                className="rounded-md border border-red/30 bg-red/10 px-3 py-2 text-sm text-red"
              >
                {error}
              </div>
            ) : null}

            <div className="flex items-center gap-4">
              <Button type="submit" size="lg" disabled={busy}>
                {busy ? "Working" : isLast ? "Finish" : "Continue"}
              </Button>
              {step > 0 ? (
                <Button
                  type="button"
                  variant="ghost"
                  onClick={() => setStep(step - 1)}
                >
                  Back
                </Button>
              ) : null}
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}