import type { ReactNode } from "react";
import { IconCreditCard } from "@tabler/icons-react";
import type { IBillingPlan } from "@heptadec/api/billing-contracts";
import { Button } from "./ui/button";

export const VIEW_CLASSNAME = "flex min-h-0 flex-1 flex-col";

export const TOOLBAR_INPUT_CLASSNAME = "h-7 px-2 text-xs";

export const TOOLBAR_SELECT_CLASSNAME =
  "h-7 rounded-md border border-input bg-background px-2 font-mono text-xs text-foreground";
export const SMALL_BUTTON_CLASSNAME = "h-7 px-2.5 text-xs";

export const TABLE_CLASSNAME = "w-full border-collapse text-left text-xs";

export const PLAN_CARD_CLASSNAME =
  "flex flex-col gap-3 rounded-xl border border-border bg-foreground/5 p-4";

export interface IPlanCardAction {
  disabled: boolean;
  onClick: () => void;
}

export function PlanCard({
  plan,
  action,
}: {
  plan: IBillingPlan;
  action: IPlanCardAction | null;
}): ReactNode {
  return (
    <div className={PLAN_CARD_CLASSNAME}>
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-sm font-medium text-fg">{plan.label}</span>
        <span className="font-mono text-xs tabular-nums text-muted-foreground">
          {plan.amount === "" ? null : `${plan.currency} ${plan.amount}`}
        </span>
      </div>
      <p className="text-xs text-muted-foreground">{plan.note}</p>
      {action === null ? null : (
        <Button
          className="mt-auto self-start"
          disabled={action.disabled}
          onClick={action.onClick}
        >
          <IconCreditCard size={16} strokeWidth={1.5} />
          Buy
        </Button>
      )}
    </div>
  );
}

export const TABLE_HEAD_CLASSNAME = "font-medium text-muted-foreground";

export const TABLE_ROW_CLASSNAME =
  "border-t border-border data-[selected=true]:bg-foreground/10";
export const TABLE_CELL_CLASSNAME = "px-2 py-1.5 align-middle";

export function Toolbar({ children }: { children: ReactNode }) {
  return (
    <div className="flex flex-wrap items-center gap-2 px-6 pb-2">{children}</div>
  );
}

export function FilterSummary({
  count,
  onClear,
}: {
  count: number;
  onClear: () => void;
}) {
  return (
    <div
      role="status"
      className="flex items-center gap-3 px-6 pb-2 text-xs text-muted-foreground"
    >
      <span>{count} matching</span>
      <Button variant="ghost" onClick={onClear} className={SMALL_BUTTON_CLASSNAME}>
        Clear filters
      </Button>
    </div>
  );
}

export function Workspace({
  view,
  aside,
}: {
  view: ReactNode;
  aside?: ReactNode;
}) {
  return (
    <div className="flex min-h-0 flex-1 border-t border-border">
      <div className="min-w-0 flex-1 overflow-auto px-6 py-3">{view}</div>
      {aside ?? null}
    </div>
  );
}

export function Inspector({
  title,
  onClose,
  children,
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
}) {
  return (
    <aside
      aria-label={title}
      className="flex w-[340px] shrink-0 flex-col gap-5 overflow-auto border-l border-border bg-card/40 px-5 py-5"
    >
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-xs font-semibold text-muted-foreground">{title}</h2>
        <Button variant="ghost" onClick={onClose} className={SMALL_BUTTON_CLASSNAME}>
          Close
        </Button>
      </div>
      {children}
    </aside>
  );
}

export interface IProperty {
  label: string;
  value: string | number | null;
}

export function PropertyList({ properties }: { properties: IProperty[] }) {
  return (
    <dl className="grid gap-3.5 text-xs">
      {properties.map((property) => (
        <div key={property.label}>
          <dt className="mb-1 text-muted-foreground">{property.label}</dt>
          <dd className="break-words tabular-nums">
            {property.value === null ? "Not reported" : property.value}
          </dd>
        </div>
      ))}
    </dl>
  );
}

export function WorkspaceFooter({
  legend,
  trailing,
}: {
  legend: ReactNode;
  trailing?: ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 border-t border-border px-6 py-2.5 text-[11px] text-muted-foreground">
      <div className="flex flex-wrap items-center gap-4">{legend}</div>
      {trailing ? <div className="ml-auto tabular-nums">{trailing}</div> : null}
    </div>
  );
}
