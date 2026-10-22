import { useCallback, useEffect, useState } from "react";
import { IconCreditCard } from "@tabler/icons-react";
import type {
  IBillingPlan,
  IBillingSubscription,
  IBillingSummary,
} from "@heptadec/api/billing-contracts";
import { fetchBilling, messageFor } from "../api";
import { useCheckout } from "../checkout";
import { Button } from "./ui/button";
import { Alert, EmptyState } from "./ui/feedback";
import { PLAN_CARD_CLASSNAME, VIEW_CLASSNAME, Workspace } from "./workspace";

export function Billing({ isOwner }: { isOwner: boolean }) {
  const [summary, setSummary] = useState<IBillingSummary | null>(null);
  const [problem, setProblem] = useState<string | null>(null);

  const reload = useCallback(async () => {
    setProblem(null);
    try {
      setSummary(await fetchBilling());
    } catch (caught) {
      setProblem(messageFor(caught, "The plan could not be loaded."));
    }
  }, []);

  useEffect(() => {
    void reload();
  }, [reload]);

  const checkout = useCheckout(reload);

  async function subscribe(cadence: IBillingPlan["cadence"]): Promise<void> {
    await checkout.start(cadence);
  }

  if (!isOwner) {
    return (
      <Workspace
        view={
          <div className={VIEW_CLASSNAME}>
            <EmptyState
              title="Owners only"
              body="A subscription is bought by an owner of this organization."
            />
          </div>
        }
      />
    );
  }

  return (
    <Workspace
      view={
        <div className="mx-auto max-w-3xl">
          {problem !== null ? <Alert className="mb-4">{problem}</Alert> : null}
          {checkout.problem !== null ? (
            <Alert className="mb-4">{checkout.problem}</Alert>
          ) : null}
          {checkout.paid ? (
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
                subscription={summary.subscription}
                plans={summary.plans}
              />
              <h2 className="mt-8 text-[12px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                Plans
              </h2>
              <div className="mt-2 grid gap-2 sm:grid-cols-2">
                {summary.plans.map((plan) => (
                  <div key={plan.cadence} className={PLAN_CARD_CLASSNAME}>
                    <div className="flex items-baseline justify-between gap-2">
                      <span className="text-sm font-medium text-fg">
                        {plan.label}
                      </span>
                      <span className="font-mono text-xs tabular-nums text-muted-foreground">
                        {plan.currency} {plan.amount}
                      </span>
                    </div>
                    <p className="text-xs text-muted-foreground">{plan.note}</p>
                    <Button
                      className="self-start"
                      disabled={
                        checkout.busy ||
                        !summary.configured ||
                        summary.subscription !== null
                      }
                      onClick={() => void subscribe(plan.cadence)}
                    >
                      <IconCreditCard size={16} strokeWidth={1.5} />
                      Subscribe
                    </Button>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      }
    />
  );
}

function CurrentPlan({
  subscription,
  plans,
}: {
  subscription: IBillingSubscription | null;
  plans: IBillingPlan[];
}) {
  if (subscription === null) {
    return (
      <EmptyState
        title="No subscription yet"
        body="This organization is not subscribed. Choose a plan to turn the product on."
      />
    );
  }

  const plan = plans.find((entry) => entry.cadence === subscription.cadence);

  return (
    <div className="flex flex-col gap-3 rounded-xl border border-border p-4">
      <div className="flex items-center gap-2">
        <IconCreditCard size={18} strokeWidth={1.5} className="text-muted-foreground" />
        <span className="text-sm font-medium text-fg">
          {plan?.label ?? "Unknown plan"}
        </span>
        <span className="font-mono text-xs text-muted-foreground">
          {subscription.status}
        </span>
      </div>
      <dl className="grid gap-2 text-xs">
        <div className="flex justify-between gap-4">
          <dt className="text-muted-foreground">Renews</dt>
          <dd className="tabular-nums">
            {subscription.renewsAt === null
              ? "not reported"
              : new Date(subscription.renewsAt).toLocaleDateString()}
          </dd>
        </div>
        <div className="flex justify-between gap-4">
          <dt className="text-muted-foreground">Ends at period end</dt>
          <dd>{subscription.cancelAtPeriodEnd ? "yes" : "no"}</dd>
        </div>
      </dl>
      <p className="text-xs text-muted-foreground">
        Changing or cancelling this plan is not wired up yet.
      </p>
    </div>
  );
}
