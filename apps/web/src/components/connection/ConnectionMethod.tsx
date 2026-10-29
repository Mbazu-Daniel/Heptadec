import { ENGINE_SPECS, type DataSourceKind } from "@heptadec/api/data-source-contracts";
import { Textarea } from "../ui/textarea";

export function ConnectionMethod({
  kind,
  url,
  onUrlChange,
}: {
  kind: DataSourceKind;
  url: string;
  onUrlChange: (next: string) => void;
}) {
  const spec = ENGINE_SPECS[kind];
  if (!spec.acceptsConnectionUrl) {
    return null;
  }

  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-xs text-muted-foreground">Import from connection URL</span>
      <Textarea
        rows={2}
        value={url}
        onChange={(event) => onUrlChange(event.target.value)}
        placeholder={EXAMPLES[kind]}
        className="rounded-none font-mono"
        spellCheck={false}
      />
    </label>
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
