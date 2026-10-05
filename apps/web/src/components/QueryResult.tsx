const ROWS = [
  { id: "a91f", table: "events", region: "eu-west-1", status: "delivered" },
  { id: "b204", table: "events", region: "us-east-1", status: "delivered" },
  { id: "c77e", table: "orders", region: "eu-west-1", status: "queued" },
  { id: "d013", table: "orders", region: "ap-south-1", status: "delivered" },
];

export function QueryResult() {
  return (
    <div
      className="w-full overflow-hidden rounded-xl border border-border bg-card font-mono text-[12.5px]"
      role="img"
      aria-label="A SQL query returning four rows from an events and orders database"
    >
      <div className="flex items-center gap-2 border-b border-border px-3.5 py-2.5 text-muted-foreground">
        <span className="size-1.5 rounded-full bg-green" />
        <span>orders-prod</span>
        <span className="ml-auto text-cyan">read-only</span>
      </div>

      <div className="px-3.5 py-3 font-mono text-foreground">
        <span className="text-cyan">SELECT</span> id, table, region, status{" "}
        <span className="text-cyan">FROM</span> events{" "}
        <span className="text-cyan">UNION ALL</span> orders{" "}
        <span className="text-cyan">LIMIT</span> 4
      </div>

      <div className="relative overflow-hidden border-t border-border">
        <div className="animate-scan pointer-events-none absolute inset-x-0 top-0 h-14 bg-linear-to-b from-transparent from-0% to-foreground/6 to-100%" />
        {ROWS.map((row, index) => (
          <div
            key={row.id}
            className="animate-land grid grid-cols-[64px_72px_1fr_84px] gap-2.5 border-t border-foreground/6 px-3.5 py-2.5 text-muted-foreground first:border-t-0"
            style={{ animationDelay: `${index * 0.22}s` }}
          >
            <span className="text-foreground">{row.id}</span>
            <span>{row.table}</span>
            <span>{row.region}</span>
            <span
              className={row.status === "delivered" ? "text-green" : "text-orange"}
            >
              {row.status}
            </span>
          </div>
        ))}
      </div>

      <div className="flex justify-between border-t border-border px-3.5 py-2.5 text-muted-foreground">
        <span>4 rows</span>
        <span>11ms</span>
      </div>
    </div>
  );
}