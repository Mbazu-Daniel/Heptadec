import { useCallback, useEffect, useState } from "react";
import { loadBachs, type Bachs, type BachsCheckoutEvent } from "@bachs/js";
import type {
  IStartCheckoutRequest,
  IBillingSummary,
} from "@heptadec/api/billing-contracts";
import { fetchBilling, messageFor, setAutoRenew, startCheckout } from "./api";

const POLL_ATTEMPTS = 8;
const POLL_INTERVAL_MS = 1500;

export interface IBilling {
  summary: IBillingSummary | null;
  problem: string | null;
  unreadable: boolean;
  busy: boolean;
  paid: boolean;
  checkoutProblem: string | null;
  open: (request: IStartCheckoutRequest) => Promise<void>;
  renew: (enabled: boolean) => Promise<void>;
}

let loaded: { origin: string; bachs: Bachs } | null = null;

async function bachsFor(origin: string): Promise<Bachs> {
  if (loaded?.origin !== origin) {
    const bachs = await loadBachs({ baseUrl: origin });
    bachs.Initialize({ baseUrl: origin });
    loaded = { origin, bachs };
  }
  return loaded.bachs;
}

async function waitForEntitlement(): Promise<void> {
  for (let attempt = 0; attempt < POLL_ATTEMPTS; attempt += 1) {
    const summary = await fetchBilling();
    if (summary.entitled) {
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

  const handleEvent = useCallback(
    async (event: BachsCheckoutEvent): Promise<void> => {
      if (event.type === "checkout.completed") {
        setBusy(false);
        setPaid(true);
        await waitForEntitlement();
        await reload();
        return;
      }
      if (event.type === "checkout.failed" || event.type === "checkout.error") {
        setCheckoutProblem("That payment did not go through.");
        setBusy(false);
        return;
      }
      if (event.type === "checkout.closed") {
        setBusy(false);
      }
    },
    [reload],
  );

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
            void handleEvent(event);
          },
        });
      } catch (caught) {
        setCheckoutProblem(messageFor(caught, "That checkout could not be started."));
        setBusy(false);
      }
    },
    [handleEvent],
  );

  const renew = useCallback(
    async (enabled: boolean): Promise<void> => {
      setBusy(true);
      setCheckoutProblem(null);
      try {
        await setAutoRenew({ enabled });
        await reload();
      } catch (caught) {
        setCheckoutProblem(
          messageFor(caught, "That setting could not be changed."),
        );
      } finally {
        setBusy(false);
      }
    },
    [reload],
  );

  return {
    summary,
    problem,
    unreadable,
    busy,
    paid,
    checkoutProblem,
    open,
    renew,
  };
}
