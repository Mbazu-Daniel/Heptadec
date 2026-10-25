import type { CSSProperties, ReactNode } from "react";
import { Link } from "react-router-dom";
import { IconBrandGithub, IconCreditCard, IconLock } from "@tabler/icons-react";
import type {
  IBillingCharge,
  IBillingSummary,
  IStartCheckoutRequest,
} from "@heptadec/api/billing-contracts";
import { useBilling } from "../checkout";
import { Alert } from "./ui/feedback";
import { Button } from "./ui/button";
import { PlanCard } from "./workspace";
import { REPO_URL } from "./Landing";

/** The checkout half of the billing state, past the summary the gate has
 * already read. */
export interface IPaywallBilling {
  busy: boolean;
  paid: boolean;
  problem: string | null;
  open: (request: IStartCheckoutRequest) => Promise<void>;
}

export function SubscriptionGate({
  isOwner,
  others,
  onSignOut,
  children,
}: {
  isOwner: boolean;
  others: Array<{ name: string; slug: string }>;
  onSignOut: () => void;
  children: ReactNode;
}) {
  const billing = useBilling();

  if (billing.summary === null) {
    return billing.unreadable ? (
      <>{children}</>
    ) : (
      <div className="relative grid h-full place-items-center">
        <div className="spot" />
        <p className="relative text-sm text-muted-foreground">Loading</p>
      </div>
    );
  }
  if (billing.summary.entitled) {
    return <>{children}</>;
  }
  return (
    <Paywall
      summary={billing.summary}
      billing={{
        busy: billing.busy,
        paid: billing.paid,
        problem: billing.checkoutProblem,
        open: billing.open,
      }}
      isOwner={isOwner}
      others={others}
      onSignOut={onSignOut}
    />
  );
}

function Paywall({
  summary,
  billing,
  isOwner,
  others,
  onSignOut,
}: {
  summary: IBillingSummary;
  billing: IPaywallBilling;
  isOwner: boolean;
  others: Array<{ name: string; slug: string }>;
  onSignOut: () => void;
}) {
  const lapsed = summary.subscription;
  const charges = summary.charges;
  const paid = billing.paid;
  const busy = billing.busy;
  const problem = billing.problem;

  return (
    <div className="h-full overflow-auto">
      <div className="mx-auto flex w-full max-w-lg flex-col items-center px-6 py-10 text-center">
        <LockedResult />

        <h1 className="mt-8 text-xl font-semibold tracking-[-0.02em] text-fg">
          {lapsed === null
            ? "Your free trial has ended"
            : "This organization's subscription has stopped"}
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          {lapsed === null
            ? `It ended on ${new Date(summary.trialEndsAt).toLocaleDateString()}. Choose a plan and the product opens again as soon as the payment clears.`
            : "Choose a plan and the product opens again as soon as a payment clears."}
        </p>
        {isOwner ? null : (
          <p className="mt-2 text-sm text-muted-foreground">
            Only an owner of this organization can start the subscription.
          </p>
        )}

        {problem !== null ? <Alert className="mt-4 w-full">{problem}</Alert> : null}
        {paid ? (
          <Alert className="mt-4 w-full">
            The payment went through. The product opens as soon as Bachs
            confirms it.
          </Alert>
        ) : null}

        <div className="mt-6 grid w-full gap-2 sm:grid-cols-2">
          {summary.plans.map((plan) => (
            <PlanCard
              key={plan.cadence}
              plan={plan}
              action={
                isOwner
                  ? {
                      disabled: busy,
                      onClick: () => void billing.open({ cadence: plan.cadence }),
                    }
                  : null
              }
            />
          ))}
        </div>

        {/* One-time charges in other currencies */}
        {charges.length > 0 ? (
          <div className="mt-4 w-full space-y-3">
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              One-time charges
            </p>
            {charges.map((charge) => (
              <div
                key={`${charge.currency}-${charge.amount}`}
                className="rounded-xl border border-border p-4"
              >
                <div className="flex items-center justify-between gap-2">
                  <h4 className="text-sm font-semibold text-fg">{charge.label}</h4>
                  <span className="font-mono text-xs tabular-nums text-muted-foreground">
                    {charge.amount}
                    <span className="ml-1">{charge.currency}</span>
                  </span>
                </div>
                <p className="text-left text-xs text-muted-foreground">
                  Pay instantly with your preferred payment method.
                </p>
                {isOwner ? (
                  <Button
                    className="mt-auto self-start"
                    disabled={busy}
                    onClick={() =>
                      void billing.open({
                        charge: {
                          amount: charge.amount,
                          currency: charge.currency,
                          paymentMethods: charge.paymentMethods,
                        },
                      })
                    }
                  >
                    <IconCreditCard size={16} strokeWidth={1.5} />
                    Pay now
                  </Button>
                ) : null}
              </div>
            ))}
          </div>
        ) : null}

        <div className="mt-8 w-full border-t border-border pt-6">
          <p className="text-sm font-medium text-fg">Heptadec is open source.</p>
          <a
            href={REPO_URL}
            target="_blank"
            rel="noreferrer"
            className="mt-3 inline-flex items-center gap-2 text-xs text-fg underline underline-offset-4 transition-colors hover:text-muted-foreground"
          >
            <IconBrandGithub size={16} strokeWidth={1.5} />
            Clone it from GitHub
          </a>
        </div>

        <div className="mt-8 flex flex-col items-center gap-1.5 text-xs text-muted-foreground">
          {others.length > 0 ? (
            <p>
              Also a member of{" "}
              {others.map((other, index) => (
                <span key={other.slug}>
                  {index === 0 ? "" : ", "}
                  <Link
                    to={`/${other.slug}`}
                    className="text-fg underline underline-offset-4 transition-colors hover:text-muted-foreground"
                  >
                    {other.name}
                  </Link>
                </span>
              ))}
            </p>
          ) : null}
          <button
            type="button"
            onClick={onSignOut}
            className="text-fg underline underline-offset-4 transition-colors hover:text-muted-foreground"
          >
            Sign out
          </button>
        </div>
      </div>
    </div>
  );
}

const COLUMNS = ["region", "orders", "gmv"];

const ROWS = [
  ["eu-west-1", "18,204", "412,880"],
  ["us-east-1", "31,777", "1,204,410"],
  ["ap-south-1", "9,512", "204,119"],
  ["sa-east-1", "4,088", "96,720"],
];

function LockedResult() {
  return (
    <div className="wall-grid" aria-hidden="true">
      <div className="wall-grid-row wall-grid-head">
        {COLUMNS.map((column) => (
          <span key={column}>{column}</span>
        ))}
      </div>
      {ROWS.map((row, index) => (
        <div
          key={row[0]}
          className="wall-grid-row"
          style={{ animationDelay: `${60 + index * 55}ms` }}
        >
          {row.map((value, column) => (
            <span key={value} className="wall-grid-value">
              <span
                className="wall-grid-text"
                style={sweepAt(index, column)}
              >
                {value}
              </span>
              <span className="wall-grid-redact" style={sweepAt(index, column)} />
            </span>
          ))}
        </div>
      ))}
      <span className="wall-lock">
        <IconLock size={18} strokeWidth={1.5} />
      </span>
    </div>
  );
}

function sweepAt(row: number, column: number): CSSProperties {
  return { animationDelay: `${320 + row * 55 + column * 50}ms` };
}
