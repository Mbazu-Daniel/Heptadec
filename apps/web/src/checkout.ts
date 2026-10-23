import { useCallback, useState } from "react";
import { loadBachs, type Bachs, type BachsCheckoutEvent } from "@bachs/js";
import type { IBillingPlan } from "@heptadec/api/billing-contracts";
import { fetchBilling, messageFor, startCheckout } from "./api";

const POLL_ATTEMPTS = 8;
const POLL_INTERVAL_MS = 1500;

export interface ICheckout {
  start: (cadence: IBillingPlan["cadence"]) => Promise<void>;
  busy: boolean;
  paid: boolean;
  problem: string | null;
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

export function useCheckout(onPaid: () => void): ICheckout {
  const [busy, setBusy] = useState(false);
  const [paid, setPaid] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);

  const start = useCallback(
    async (cadence: IBillingPlan["cadence"]): Promise<void> => {
      setBusy(true);
      setPaid(false);
      setProblem(null);
      try {
        const { checkoutUrl } = await startCheckout(cadence);
        const bachs = await bachsFor(new URL(checkoutUrl).origin);
        await bachs.Checkout.open({
          checkoutUrl,
          onEvent: (event: BachsCheckoutEvent) => {
            void handleEvent(event, setBusy, setPaid, setProblem, onPaid);
          },
        });
      } catch (caught) {
        setProblem(messageFor(caught, "That checkout could not be started."));
        setBusy(false);
      }
    },
    [onPaid],
  );

  return { start, busy, paid, problem };
}

async function handleEvent(
  event: BachsCheckoutEvent,
  setBusy: (busy: boolean) => void,
  setPaid: (paid: boolean) => void,
  setProblem: (problem: string | null) => void,
  onPaid: () => void,
): Promise<void> {
  if (event.type === "checkout.completed") {
    setBusy(false);
    setPaid(true);
    await waitForSubscription();
    onPaid();
    return;
  }
  if (event.type === "checkout.failed" || event.type === "checkout.error") {
    setProblem("That payment did not go through.");
    setBusy(false);
    return;
  }
  if (event.type === "checkout.closed") {
    setBusy(false);
  }
}
