import { useCallback, useEffect, useState } from "react";
import { loadBachs, type Bachs, type BachsCheckoutEvent } from "@bachs/js";
import type {
  IStartCheckoutRequest,
  IBillingSummary,
} from "@heptadec/api/billing-contracts";
import { fetchBilling, messageFor, startCheckout } from "./api";

const POLL_ATTEMPTS = 8;
const POLL_INTERVAL_MS = 1500;

/** What the Billing screen and the Paywall both cross to run their business:
 * the plan summary as loaded, the checkout as driven, and one open verb. */
export interface IBilling {
  summary: IBillingSummary | null;
  /** Why the summary could not be read, when the screen can say so. */
  problem: string | null;
  /** The summary could not be read at all — where the screen cannot say so. */
  unreadable: boolean;
  busy: boolean;
  paid: boolean;
  checkoutProblem: string | null;
  /** Opens one checkout: a plan's cadence or a one-time charge. */
  open: (request: IStartCheckoutRequest) => Promise<void>;
}

let loaded: { origin: string; bachs: Bachs } | null = null;

// The overlay only accepts a checkout on the origin its script came from, and
// the sandbox and the live checkout are different origins. The checkout the
// server created says which one it is.
async function bachsFor(origin: string): Promise<Bachs> {
  if (loaded?.origin !== origin) {
    const bachs = await loadBachs({ baseUrl: origin });
    bachs.Initialize({ baseUrl: origin });
    loaded = { origin, bachs };
  }
  return loaded.bachs;
}

// The browser event says the payment went through; the webhook says the
// subscription exists. The second is the one the app grants access from, so
// the wait is for the webhook to land rather than for the overlay to close.
async function waitForSubscription(): Promise<void> {
  for (let attempt = 0; attempt < POLL_ATTEMPTS; attempt += 1) {
    const summary = await fetchBilling();
    if (summary.subscription !== null) {
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
  }
}

export function useBilling(): IBilling {
  const [summary, setSummary] = useState<IBillingSummary | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [unreadable, setUnreadable] = useState(false);
  const [busy, setBusy] = useState(false);
  const [paid, setPaid] = useState(false);
  const [checkoutProblem, setCheckoutProblem] = useState<string | null>(null);

  const reload = useCallback(async () => {
    setProblem(null);
    try {
      setSummary(await fetchBilling());
    } catch (caught) {
      setUnreadable(true);
      setProblem(messageFor(caught, "The plan could not be loaded."));
    }
  }, []);

  useEffect(() => {
    void reload();
  }, [reload]);

  const open = useCallback(
    async (request: IStartCheckoutRequest): Promise<void> => {
      setBusy(true);
      setPaid(false);
      setCheckoutProblem(null);
      try {
        const { checkoutUrl } = await startCheckout(request);
        const bachs = await bachsFor(new URL(checkoutUrl).origin);
        await bachs.Checkout.open({
          checkoutUrl,
          onEvent: (event: BachsCheckoutEvent) => {
            void handleEvent(event, {
              setBusy,
              setPaid,
              setProblem: setCheckoutProblem,
              onPaid: reload,
            });
          },
        });
      } catch (caught) {
        setCheckoutProblem(messageFor(caught, "That checkout could not be started."));
        setBusy(false);
      }
    },
    [reload],
  );

  return { summary, problem, unreadable, busy, paid, checkoutProblem, open };
}

interface ICheckoutOutcome {
  setBusy: (busy: boolean) => void;
  setPaid: (paid: boolean) => void;
  setProblem: (problem: string | null) => void;
  onPaid: () => void;
}

async function handleEvent(
  event: BachsCheckoutEvent,
  outcome: ICheckoutOutcome,
): Promise<void> {
  if (event.type === "checkout.completed") {
    outcome.setBusy(false);
    outcome.setPaid(true);
    await waitForSubscription();
    outcome.onPaid();
    return;
  }
  if (event.type === "checkout.failed" || event.type === "checkout.error") {
    outcome.setProblem("That payment did not go through.");
    outcome.setBusy(false);
    return;
  }
  if (event.type === "checkout.closed") {
    outcome.setBusy(false);
  }
}
