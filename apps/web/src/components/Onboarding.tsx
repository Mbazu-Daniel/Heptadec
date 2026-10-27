import { useState, type FormEvent } from "react";
import { ENGINE_SPECS } from "@heptadec/api/data-source-contracts";
import type { DataSourceKind } from "@heptadec/api/data-source-contracts";
import type { IMe } from "@heptadec/api/auth-contracts";
import type { IOrganizationsResponse } from "@heptadec/api/organization-contracts";
import { completeOnboarding, messageFor, saveMemberDisplayName } from "../api";
import { EngineIcon } from "../lib/engine-icon";
import { Input } from "./ui/input";
import { OrganizationForm } from "./CreateOrganization";
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
  orgs: IOrganizationsResponse | null;
  onDone: () => void;
}

type StepId = "org" | "name" | "source";

interface IStep {
  id: StepId;
  title: string;
  body: string;
}

const ENGINE_KINDS = Object.keys(ENGINE_SPECS) as DataSourceKind[];

export function Onboarding({ me, orgs, onDone }: IOnboardingProps) {
  const [step, setStep] = useState(0);
  const [orgCreated, setOrgCreated] = useState(false);
  const [displayName, setDisplayName] = useState(me.displayName ?? me.user.name);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const hasOrganization = orgCreated || (orgs?.organizations.length ?? 0) > 0;

  const steps: IStep[] = [];
  if (!hasOrganization) {
    steps.push({
      id: "org",
      title: "Create your organization",
      body: "Your team shares data sources, saved queries, and dashboards inside one organization.",
    });
  }
  steps.push({
    id: "name",
    title: "Set your display name",
    body: "This is the name your team sees.",
  });
  steps.push({
    id: "source",
    title: "Connect a source",
    body: "Point Heptadec at one of these databases. Every connection is read-only by default.",
  });

  const current = steps[step]!;
  const isLast = step === steps.length - 1;

  async function next(event: FormEvent): Promise<void> {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      if (current.id === "name") {
        const trimmed = displayName.trim();
        await saveMemberDisplayName(trimmed === "" ? null : trimmed);
      }
      if (isLast) {
        await completeOnboarding();
        onDone();
        return;
      }
      setStep(step + 1);
    } catch (caught) {
      setError(
        messageFor(caught, "That could not be saved. Try again in a moment."),
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <AuthPage
      wide
      eyebrow={`Step ${step + 1} of ${steps.length}`}
      title={current.title}
      lede={current.body}
    >
      {current.id === "org" ? (
        <OrganizationForm
          submitLabel="Continue"
          onCreated={() => setOrgCreated(true)}
        />
      ) : (
        <form className="flex flex-col gap-5" onSubmit={next}>
          {current.id === "name" ? (
            <div className="flex flex-col gap-2">
              <label
                className={AUTH_LABEL_CLASSNAME}
                htmlFor="onboarding-display-name"
              >
                Display name
              </label>
              <Input
                id="onboarding-display-name"
                className={AUTH_INPUT_CLASSNAME}
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                placeholder={me.user.name}
                maxLength={120}
                autoComplete="name"
              />
              <p className="text-xs text-(--mk-fg-muted)">
                Shown to your team. You can change it later from your profile.
              </p>
            </div>
          ) : (
            <ul className="grid grid-cols-2 gap-2">
              {ENGINE_KINDS.map((kind) => (
                <li
                  key={kind}
                  className="flex items-center gap-3 rounded-[12px] border border-(--mk-hairline) bg-(--mk-tint-f5) px-4 py-3"
                >
                  <EngineIcon name={kind} className="size-5" />
                  <span className="text-sm font-semibold text-(--mk-fg-primary)">
                    {ENGINE_SPECS[kind].name}
                  </span>
                  {ENGINE_SPECS[kind].defaultPort === null ? null : (
                    <span className="ml-auto font-mono text-xs text-(--mk-fg-muted)">
                      {ENGINE_SPECS[kind].defaultPort}
                    </span>
                  )}
                </li>
              ))}
            </ul>
          )}

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
      )}
    </AuthPage>
  );
}
