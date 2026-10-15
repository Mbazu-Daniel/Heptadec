import { ENGINE_SPECS, type DataSourceKind } from "@heptadec/api/data-source-contracts";
import { Textarea } from "../ui/textarea";

export type ConnectionMethod = "fields" | "url";

export function ConnectionMethod({
  kind,
  method,
  url,
  onMethodChange,
  onUrlChange,
}: {
  kind: DataSourceKind;
  method: ConnectionMethod;
  url: string;
  onMethodChange: (next: ConnectionMethod) => void;
  onUrlChange: (next: string) => void;
}) {
  const spec = ENGINE_SPECS[kind];
  if (!spec.acceptsConnectionUrl) {
    return null;
  }

  return (
    <div className="grid gap-3 border-b border-border pb-4">
      <label className="flex flex-col gap-1.5">
        <span className="text-xs text-muted-foreground">Connection method</span>
        <select
          value={method}
          onChange={(event) =>
            onMethodChange(event.target.value as ConnectionMethod)
          }
          className="h-10 rounded-md border border-input bg-background px-3 font-mono text-sm text-foreground"
        >
          <option value="fields">Host and port</option>
          <option value="url">Connection URL</option>
        </select>
      </label>

      {method === "url" ? (
        <label className="flex flex-col gap-1.5">
          <span className="text-xs text-muted-foreground">Connection URL</span>
          <Textarea
            rows={2}
            value={url}
            onChange={(event) => onUrlChange(event.target.value)}
            placeholder={exampleFor(kind)}
            className="rounded-none font-mono"
            spellCheck={false}
          />
          <span className="text-[11px] text-muted-foreground">
            Starts with {spec.schemes.join(" or ")}. The password you paste here is
            encrypted the same way a typed one is.
          </span>
        </label>
      ) : null}
    </div>
  );
}

const EXAMPLES: Record<DataSourceKind, string> = {
  postgres: "postgresql://user:password@host:5432/database",
  mysql: "mysql://user:password@host:3306/database",
  mariadb: "mysql://user:password@host:3306/database",
  clickhouse: "https://user:password@host:8123/database",
  redis: "redis://user:password@host:6379/0",
  quickwit: "https://host:7280",
  libsql: "libsql://host",
  sqlite: "/data/analytics.db",
  mongodb: "mongodb://user:password@host:27017/telemetry",
};

function exampleFor(kind: DataSourceKind): string {
  return EXAMPLES[kind];
}
