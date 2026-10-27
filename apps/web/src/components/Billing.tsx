import { IconCreditCard } from "@tabler/icons-react";
import type { IBillingSummary } from "@heptadec/api/billing-contracts";
import { useBilling } from "../checkout";
import { Button } from "./ui/button";
import { Alert, EmptyState } from "./ui/feedback";
import { PlanCard, VIEW_CLASSNAME, Workspace } from "./workspace";

export function Billing({ isOwner }: { isOwner: boolean }) {
  const billing = useBilling();

  if (!isOwner) {
    return (
      <Workspace
        view={
          <div className={VIEW_CLASSNAME}>
            <EmptyState
              title="Owners only"
            />
          </div>
        }
      />
    );
  }

  const summary = billing.summary;

  return (
    <Workspace
      view={
        <div className="mx-auto max-w-3xl">
          {billing.problem !== null ? (
            <Alert className="mb-4">{billing.problem}</Alert>
          ) : null}
          {billing.checkoutProblem !== null ? (
            <Alert className="mb-4">{billing.checkoutProblem}</Alert>
          ) : null}
          {billing.paid ? (
            <Alert className="mb-4">
              The payment went through. This plan is active once Bachs confirms
              it.
            </Alert>
          ) : null}
          {summary === null ? (
            <p className="text-xs text-muted-foreground">Loading</p>
          ) : (
            <>
              {summary.configured ? null : (
                <Alert className="mb-4">
                  Billing is not configured on this deployment, so no checkout
                  can be started.
                </Alert>
              )}
              <CurrentPlan
                summary={summary}
                busy={billing.busy}
                onRenew={billing.renew}
              />
              <h2 className="mt-8 text-[12px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                Plans
              </h2>
              <div className="mt-2 grid gap-2 sm:grid-cols-2">
                {summary.plans.map((plan) => (
                  <PlanCard
                    key={plan.cadence}
                    plan={plan}
                    action={{
                      disabled:
                        billing.busy || !summary.configured || summary.entitled,
                      onClick: () => void billing.open({ cadence: plan.cadence }),
                    }}
                  />
                ))}
              </div>
              <p className="mt-3 text-xs text-muted-foreground">
                Prices are in USD. Bachs shows the price in your local currency
                at checkout, where you can pay with a card or mobile money.
              </p>
            </>
          )}
        </div>
      }
    />
  );
}

function CurrentPlan({
  summary,
  busy,
  onRenew,
}: {
  summary: IBillingSummary;
  busy: boolean;
  onRenew: (enabled: boolean) => Promise<void>;
}) {
  const label =
    summary.plans.find((candidate) => candidate.cadence === summary.cadence)
      ?.label ?? "Free trial";
  const bought = summary.paidUntil !== null;
  const endsAt = summary.paidUntil ?? summary.trialEndsAt;

  return (
    <div className="flex flex-col gap-3 rounded-xl border border-border p-4">
      <div className="flex items-center gap-2">
        <IconCreditCard
          size={18}
          strokeWidth={1.5}
          className="text-muted-foreground"
        />
        <span className="text-sm font-medium text-fg">
          {label}
        </span>
        <span className="font-mono text-xs text-muted-foreground">
          {summary.entitled ? "active" : "ended"}
        </span>
      </div>
      <dl className="grid gap-2 text-xs">
        <div className="flex justify-between gap-4">
          <dt className="text-muted-foreground">
            {bought ? "Paid until" : "Trial ends"}
          </dt>
          <dd className="tabular-nums">
            {new Date(endsAt).toLocaleDateString()}
          </dd>
        </div>
        {bought ? (
          <div className="flex justify-between gap-4">
            <dt className="text-muted-foreground">Renews automatically</dt>
            <dd>{summary.autoRenew ? "yes" : "no"}</dd>
          </div>
        ) : null}
        {summary.cardLast4 === null ? null : (
          <div className="flex justify-between gap-4">
            <dt className="text-muted-foreground">Saved card</dt>
            <dd className="tabular-nums">•••• {summary.cardLast4}</dd>
          </div>
        )}
      </dl>
      {bought && summary.hasCard ? (
        <Button
          variant="ghost"
          disabled={busy}
          onClick={() => void onRenew(!summary.autoRenew)}
        >
          {summary.autoRenew ? "Stop renewing" : "Renew automatically"}
        </Button>
      ) : null}
      {bought && !summary.hasCard ? (
        <p className="text-xs text-muted-foreground">
          This period was paid without a card, so it will not renew on its own.
          Buy a plan again when it ends.
        </p>
      ) : null}
    </div>
  );
}
