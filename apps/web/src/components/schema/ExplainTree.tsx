import type { ReactNode } from "react";
import type { IExplainNode } from "@heptadec/api/query-contracts";
import { describeNode, firstFullScan } from "./explain-wording";

export function ExplainTree({ plan }: { plan: IExplainNode }) {
  const scan = firstFullScan(plan);

  return (
    <div
      aria-label="Execution plan"
      className="flex flex-col gap-1 rounded-md border border-border bg-background p-3"
    >
      <div className="mb-1.5 flex flex-col gap-1 border-b border-border pb-2">
        <p className="text-xs text-fg">
          Returns about {plan.planRows} row{plan.planRows === 1 ? "" : "s"}.
          Estimated work: {plan.totalCost.toFixed(2)}.
        </p>
        {scan === null ? null : (
          <p className="text-[12px] leading-4 text-muted-foreground">
            No index is used on {scan.relationName ?? "one table"}, so this
            reads every row of it. That is fine on a small table and gets
            slower as it grows — an index, or a narrower WHERE clause,
            usually fixes it.
          </p>
        )}
      </div>
      {rows(plan, 0, "0")}
    </div>
  );
}

function rows(node: IExplainNode, depth: number, path: string): ReactNode[] {
  const words = describeNode(node);
  return [
    <div key={path} className="flex flex-wrap items-baseline gap-x-2">
      <span style={{ paddingLeft: depth * 14 }} className="font-mono text-[12px]">
        <span className="text-fg">{node.nodeType}</span>
        {node.relationName === null ? null : (
          <span className="text-cyan"> on {node.relationName}</span>
        )}
      </span>
      {words === null ? null : (
        <span className="text-[12px] leading-4 text-muted-foreground">
          {words}
        </span>
      )}
      <span className="font-mono text-[11px] tabular-nums text-muted-foreground/70">
        cost {node.totalCost.toFixed(2)}
      </span>
    </div>,
    ...node.children.map((child, index) =>
      rows(child, depth + 1, `${path}.${index}`),
    ),
  ];
}
