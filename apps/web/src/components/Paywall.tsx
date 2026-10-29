import type { CSSProperties, ReactNode } from "react";
import { Link } from "react-router-dom";
import { IconBrandGithub, IconLock } from "@tabler/icons-react";
import type {
  IBillingSummary,
  IStartCheckoutRequest,
} from "@heptadec/api/billing-contracts";
import { useBilling } from "../checkout";
import { Alert } from "./ui/feedback";
import { PlanCard } from "./workspace";
import { REPO_URL } from "../lib/repo";

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
  const lapsed = summary.paidUntil;
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
            : "Your access period has ended"}
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          {lapsed === null
            ? `It ended on ${new Date(summary.trialEndsAt).toLocaleDateString()}. Choose a plan and the product opens again as soon as the payment clears.`
            : `It ran out on ${new Date(lapsed).toLocaleDateString()}. Choose a plan and the product opens again as soon as the payment clears.`}
        </p>
        {isOwner ? null : (
          <p className="mt-2 text-sm text-muted-foreground">
            Only an owner of this organization can buy a plan.
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

        <p className="mt-3 text-xs text-muted-foreground">
          Prices are in USD. Bachs shows the price in your local currency at
          checkout, where you can pay with a card or mobile money.
        </p>

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
