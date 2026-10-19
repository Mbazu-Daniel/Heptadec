import { useEffect, useState, type CSSProperties, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { IconBrandGithub, IconCreditCard, IconLock } from "@tabler/icons-react";
import type {
  IBillingPlan,
  IBillingSummary,
} from "@heptadec/api/billing-contracts";
import { fetchBilling, messageFor, startCheckout } from "../api";
import { Button } from "./ui/button";
import { Alert } from "./ui/feedback";
import { PLAN_CARD_CLASSNAME } from "./workspace";
import { REPO_URL } from "./Landing";

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
  const [summary, setSummary] = useState<IBillingSummary | null>(null);
  const [unreadable, setUnreadable] = useState(false);

  useEffect(() => {
    let live = true;
    fetchBilling()
      .then((next) => {
        if (live) {
          setSummary(next);
        }
      })
      .catch(() => {
        if (live) {
          setUnreadable(true);
        }
      });
    return () => {
      live = false;
    };
  }, []);

  if (summary === null) {
    return unreadable ? (
      <>{children}</>
    ) : (
      <div className="relative grid h-full place-items-center">
        <div className="spot" />
        <p className="relative text-sm text-muted-foreground">Loading</p>
      </div>
    );
  }
  if (summary.entitled) {
    return <>{children}</>;
  }
  return (
    <Paywall
      summary={summary}
      isOwner={isOwner}
      others={others}
      onSignOut={onSignOut}
    />
  );
}

function Paywall({
  summary,
  isOwner,
  others,
  onSignOut,
}: {
  summary: IBillingSummary;
  isOwner: boolean;
  others: Array<{ name: string; slug: string }>;
  onSignOut: () => void;
}) {
  const [problem, setProblem] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function subscribe(cadence: IBillingPlan["cadence"]): Promise<void> {
    setBusy(true);
    setProblem(null);
    try {
      const { checkoutUrl } = await startCheckout(cadence);
      window.location.assign(checkoutUrl);
    } catch (caught) {
      setProblem(messageFor(caught, "That checkout could not be started."));
      setBusy(false);
    }
  }

  const lapsed = summary.subscription;

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

        <div className="mt-6 grid w-full gap-2 sm:grid-cols-2">
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
              <p className="text-left text-xs text-muted-foreground">
                {plan.note}
              </p>
              {isOwner ? (
                <Button
                  className="mt-auto self-start"
                  disabled={busy}
                  onClick={() => void subscribe(plan.cadence)}
                >
                  <IconCreditCard size={16} strokeWidth={1.5} />
                  Subscribe
                </Button>
              ) : null}
            </div>
          ))}
        </div>

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
