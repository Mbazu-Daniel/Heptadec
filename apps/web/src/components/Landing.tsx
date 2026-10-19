import { useEffect, useState } from "react";
import { ThemeSwitch } from "./ui/theme-switch";
import {
  ENGINE_SPECS,
  type DataSourceKind,
} from "@heptadec/api/data-source-contracts";
import { EngineIcon } from "../lib/engine-icon";

const REPO = "Mbazu-Daniel/Heptadec";

export const REPO_URL = `https://github.com/${REPO}`;

const ENGINE_KINDS = Object.keys(ENGINE_SPECS) as DataSourceKind[];

function scrollToSection(id: string): void {
  document.getElementById(id)?.scrollIntoView({ behavior: "smooth" });
}

interface ILandingProps {
  onGetStarted: () => void;
}

interface IEngine {
  id: string;
  label: string;
  dot: string;
  file: string;
  latency: string;
  snippet: string[];
  preview?: boolean;
}

const ENGINES: IEngine[] = [
  {
    id: "postgres",
    label: "PostgreSQL",
    dot: "bg-(--mk-cyan)",
    file: "query_latency_v2.sql",
    latency: "0.84ms",
    snippet: [
      "WITH active_sessions AS (",
      "  SELECT u.id AS user_id, u.cluster_region, COUNT(e.id) AS event_volume",
      "  FROM heptadec_nodes.users u",
      "  JOIN heptadec_streams.events e ON e.user_id = u.id",
      "  WHERE e.created_at >= NOW() - INTERVAL '15 minutes'",
      "  GROUP BY u.id, u.cluster_region",
      ")",
      "SELECT user_id, cluster_region, event_volume,",
      "  heptadec_vector_score(u_vec, '[0.014, 0.992, -0.428]') AS relevance",
      "ORDER BY event_volume DESC LIMIT 25;",
    ],
  },
  {
    id: "redis",
    label: "Redis",
    dot: "bg-(--mk-status-red)",
    file: "redis_pipeline_dump.lua",
    latency: "0.31ms",
    snippet: [
      "local keys = redis.call('KEYS', 'session:*')",
      "local out = {}",
      "for _, key in ipairs(keys) do",
      "  out[#out + 1] = redis.call('HGETALL', key)",
      "end",
      "return out",
    ],
    preview: true,
  },
  {
    id: "quickwit",
    label: "Quickwit",
    dot: "bg-(--mk-status-orange)",
    file: "search_events.query",
    latency: "1.12ms",
    snippet: [
      "index: events_stream",
      "query: event_name:checkout AND cluster_region:eu-west",
      "sort: -created_at",
      "max_hits: 25",
    ],
    preview: true,
  },
  {
    id: "clickhouse",
    label: "ClickHouse",
    dot: "bg-(--mk-secondary)",
    file: "rollup_7d.sql",
    latency: "2.04ms",
    snippet: [
      "SELECT toDate(created_at) AS day, count() AS events",
      "FROM events_stream",
      "WHERE created_at >= now() - INTERVAL 7 DAY",
      "GROUP BY day",
      "ORDER BY day DESC;",
    ],
  },
  {
    id: "parquet",
    label: "Parquet",
    dot: "bg-(--mk-tertiary-container)",
    file: "export_cold.sql",
    latency: "3.47ms",
    snippet: [
      "COPY (SELECT * FROM events_stream",
      "  WHERE created_at < now() - INTERVAL 90 DAY)",
      "TO 's3://cold/events_90d.parquet'",
      "(FORMAT PARQUET, COMPRESSION SNAPPY);",
    ],
  },
];

const STAR_CLASS =
  "inline-flex h-[40px] items-center gap-2 rounded-[16px] border border-(--mk-hairline) bg-(--mk-tint-f10) px-3 text-sm font-semibold text-(--mk-fg-primary) transition-all duration-150 hover:border-(--mk-cyan) hover:text-(--mk-cyan)";

function GitHubStars({ label }: { label?: string }) {
  const [stars, setStars] = useState<number | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    void fetch(`https://api.github.com/repos/${REPO}`, {
      signal: controller.signal,
      headers: { accept: "application/vnd.github+json" },
    })
      .then(async (res) => (res.ok ? (await res.json()) : null))
      .then((body: { stargazers_count?: number } | null) => {
        if (typeof body?.stargazers_count === "number") {
          setStars(body.stargazers_count);
        }
      })
      .catch(() => undefined);
    return () => controller.abort();
  }, []);

  return (
    <a
      href={REPO_URL}
      target="_blank"
      rel="noreferrer"
      aria-label="Star Heptadec on GitHub"
      className={STAR_CLASS}
    >
      <span className="material-symbols-outlined text-[19px]">star</span>
      {label === undefined ? null : <span>{label}</span>}
      {stars === null ? null : (
        <span className="font-mono tabular-nums">{stars}</span>
      )}
    </a>
  );
}

function Header({ onGetStarted }: { onGetStarted: () => void }) {
  return (
    <header className="fixed top-0 left-0 right-0 z-50 bg-[color-mix(in_srgb,var(--mk-bg)_60%,transparent)] backdrop-blur-[12px] border-b border-(--mk-hairline)">
      <div className="h-[58px] max-w-[1280px] mx-auto px-6 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="flex items-center justify-center">
            <span className="w-2 h-2 rounded-full bg-(--mk-cyan) shadow-[0_0_8px_color-mix(in_srgb,var(--mk-cyan)_80%,transparent)]" />
          </span>
          <button
            type="button"
            onClick={onGetStarted}
            className="font-display text-[21px] leading-[26px] font-semibold tracking-tight text-(--mk-fg-primary)"
          >
            Heptadec
          </button>
        </div>
        <div className="flex items-center gap-3">
          <ThemeSwitch showAccent={false} />
          <button
            type="button"
            onClick={onGetStarted}
            className={`h-[40px] px-4 flex items-center justify-center rounded-[16px] ${PRIMARY} text-sm font-semibold transition-all duration-150 ${PRIMARY_HOVER}`}
          >
            Get Started
          </button>
        </div>
      </div>
    </header>
  );
}

const PRIMARY = "border border-transparent bg-(--mk-cyan) text-(--mk-on-accent)";
const PRIMARY_HOVER =
  "hover:opacity-90 hover:shadow-[0_1px_14px_color-mix(in_srgb,var(--mk-cyan)_12%,transparent),0_3px_32px_color-mix(in_srgb,var(--mk-cyan)_18%,transparent)]";
const GRADIENT_HEADING =
  "bg-gradient-to-br from-(--mk-cyan) via-(--mk-cyan) to-[color-mix(in_srgb,var(--mk-cyan)_45%,transparent)] bg-clip-text text-transparent";
const EYEBROW =
  "text-[12px] font-semibold uppercase tracking-widest text-(--mk-cyan) mb-1";

const DATABASE_CELLS = [
  "users",
  "events",
  "vectors",
  "cache",
  "WAL",
  "shards",
  "index",
  "mcp",
  "logs",
];

function HeroCopy({ onGetStarted }: { onGetStarted: () => void }) {
  return (
    <div className="lg:col-span-7 flex flex-col items-start lg:pl-16 z-10">
      <button
        type="button"
        onClick={onGetStarted}
        className={`group inline-flex items-center gap-2 h-8 px-4 rounded-full bg-(--mk-surface) border border-transparent [background-image:linear-gradient(var(--mk-bg-surface),var(--mk-bg-surface)),linear-gradient(90deg,color-mix(in_srgb,var(--mk-cyan)_60%,transparent),color-mix(in_srgb,var(--mk-cyan)_44%,transparent))] [background-origin:border-box] [background-clip:padding-box,border-box] transition-all duration-200 hover:[box-shadow:0_0_16px_color-mix(in_srgb,var(--mk-cyan)_35%,transparent)] mb-6`}
      >
        <span className="w-1.5 h-1.5 rounded-full bg-(--mk-cyan) shadow-[0_0_6px_color-mix(in_srgb,var(--mk-cyan)_80%,transparent)]" />
        <span className="text-sm text-(--mk-fg-primary)">Free and open source. Self-host it yourself</span>
        <span className="font-mono text-[14.5px] text-(--mk-cyan) group-hover:translate-x-0.5 transition-transform duration-150">
          →
        </span>
      </button>
      <h1
        className={`font-serif text-[58px] lg:text-[96px] leading-[64px] lg:leading-[96px] tracking-[-0.01em] mb-6 ${GRADIENT_HEADING}`}
      >
        Your data, in plain sight.
      </h1>
      <p className="text-[19px] leading-[27px] text-(--mk-fg-muted) max-w-[560px] mb-8">
        The calm way to visualize queries across Postgres, MySQL, Redis,
        ClickHouse, and more. Open source, self-hosted, and free to run on
        your own infrastructure.
      </p>
      <div className="flex flex-wrap items-center gap-4">
        <button
          type="button"
          onClick={() => scrollToSection("deploy")}
          className={`h-12 px-6 flex items-center justify-center rounded-[16px] ${PRIMARY} text-sm font-semibold transition-all duration-200 ${PRIMARY_HOVER}`}
        >
          Deploy it free
        </button>
        <a
          href={REPO_URL}
          target="_blank"
          rel="noreferrer"
          className="group h-12 px-5 flex items-center justify-center rounded-[16px] text-sm font-semibold text-(--mk-fg-muted) hover:text-(--mk-fg-primary) transition-colors duration-150"
        >
          Star on GitHub{" "}
          <span className="ml-1 text-(--mk-cyan) group-hover:translate-x-0.5 transition-transform duration-150">
            →
          </span>
        </a>
      </div>
      <div className="mt-12 pt-6 border-t border-(--mk-subtle)/40 flex items-center gap-6 text-(--mk-fg-muted) font-mono text-[14.5px]">
        <div className="flex items-center gap-2">
          <span className="w-1.5 h-1.5 rounded-full bg-(--mk-tertiary-container) shadow-[0_0_6px_color-mix(in_srgb,var(--mk-tertiary-container)_80%,transparent)]" />
          <span>Zero-egress telemetry</span>
        </div>
        <div className="w-1 h-1 rounded-full bg-(--mk-outline-variant)" />
        <div>Postgres &amp; Vector ready</div>
      </div>
    </div>
  );
}

function HeroStage() {
  return (
    <div className="lg:col-span-5 relative flex items-center justify-center min-h-[440px] select-none [perspective:1600px]">
      <div className="absolute w-72 h-72 rounded-full bg-(--mk-cyan)/10 blur-[80px] pointer-events-none" />
      <div className="relative w-72 h-72 [transform-style:preserve-3d] [transform:rotateX(-24deg)_rotateY(-36deg)_rotateZ(12deg)] transition-transform duration-700 hover:[transform:rotateX(-18deg)_rotateY(-24deg)_rotateZ(6deg)]">
        <div className="absolute inset-0 rounded-[20px] bg-(--mk-surface) border border-(--mk-active)/60 [box-shadow:0_0_30px_color-mix(in_srgb,var(--mk-cyan)_15%,transparent)] [transform:translateZ(0px)] flex flex-col p-4 justify-between">
          <div className="flex items-center justify-between border-b border-(--mk-hairline) pb-2">
            <span className="font-mono text-[14.5px] text-(--mk-cyan)">
              pg_heptadec_primary
            </span>
            <span className="w-2 h-2 rounded-full bg-(--mk-tertiary-container) shadow-[0_0_6px_color-mix(in_srgb,var(--mk-tertiary-container)_80%,transparent)]" />
          </div>
          <div className="grid grid-cols-3 gap-2 py-2">
            {DATABASE_CELLS.map((cell) => (
              <div
                key={cell}
                className={
                  cell === "WAL"
                    ? "h-10 rounded-[8px] bg-(--mk-tint-f10) border border-(--mk-cyan)/40 flex items-center justify-center text-(--mk-fg-primary) font-mono text-[12px] shadow-[0_0_8px_color-mix(in_srgb,var(--mk-cyan)_20%,transparent)]"
                    : cell === "vectors" || cell === "mcp"
                      ? "h-10 rounded-[8px] bg-(--mk-tint-f5) border border-(--mk-hairline) flex items-center justify-center text-(--mk-secondary) font-mono text-[12px]"
                      : "h-10 rounded-[8px] bg-(--mk-tint-f5) border border-(--mk-hairline) flex items-center justify-center text-(--mk-cyan) font-mono text-[12px]"
                }
              >
                {cell}
              </div>
            ))}
          </div>
          <div className="flex items-center justify-between text-[12px] font-mono text-(--mk-fg-muted) pt-2 border-t border-(--mk-hairline)">
            <span>0.4ms lat</span>
            <span className="text-(--mk-tertiary-container)">synced 100%</span>
          </div>
        </div>
        <div className="absolute inset-2 rounded-[16px] bg-[color-mix(in_srgb,var(--mk-bg)_85%,transparent)] border border-(--mk-hairline) [transform:translateZ(46px)] backdrop-blur-md p-3 grid grid-cols-3 gap-2 pointer-events-none">
          <div className="rounded-[8px] bg-(--mk-cyan)/10 border border-(--mk-active)/40 flex flex-col justify-center items-center">
            <span className="w-1.5 h-1.5 rounded-full bg-(--mk-cyan) mb-1" />
            <span className="font-mono text-[10px] text-(--mk-cyan)">SHARD 01</span>
          </div>
          <div className="rounded-[8px] bg-(--mk-tint-f3) border border-(--mk-hairline) flex flex-col justify-center items-center">
            <span className="w-1.5 h-1.5 rounded-full bg-(--mk-tertiary-container) mb-1" />
            <span className="font-mono text-[10px] text-(--mk-fg-muted)">REPLICA</span>
          </div>
          <div className="rounded-[8px] bg-(--mk-tint-f3) border border-(--mk-hairline) flex flex-col justify-center items-center">
            <span className="w-1.5 h-1.5 rounded-full bg-(--mk-secondary) mb-1" />
            <span className="font-mono text-[10px] text-(--mk-secondary)">EMBED</span>
          </div>
          <div className="rounded-[8px] col-span-3 bg-gradient-to-r from-black via-(--mk-tint-f5) to-black border border-(--mk-hairline) flex items-center justify-around px-2 py-1">
            <span className="font-mono text-[11px] text-(--mk-fg-muted)">throughput:</span>
            <span className="font-mono text-[11px] text-(--mk-tertiary-container)">
              4,821,902 op/s
            </span>
          </div>
        </div>
        <div className="absolute -inset-4 rounded-[24px] border border-(--mk-hairline)/30 [transform:translateZ(-40px)] pointer-events-none opacity-40" />
      </div>
    </div>
  );
}

const KEYWORDS = new Set([
  "WITH", "AS", "SELECT", "FROM", "JOIN", "ON", "WHERE", "GROUP", "BY",
  "ORDER", "DESC", "LIMIT", "COPY", "TO", "FORMAT", "COMPRESSION",
  "local", "for", "in", "do", "end", "return", "AND", "INTERVAL", "DAY",
  "index", "query", "sort", "max_hits",
]);

function CodeLine({ text }: { text: string }) {
  const tokens =
    text.match(new RegExp("'[^']*'|\\d+(?:\\.\\d+)?|[A-Za-z_]+|[^A-Za-z_'\\d]", "g")) ?? [];

  return (
    <div className="whitespace-pre">
      {tokens.map((token, index) => {
        let cls = "text-(--mk-fg-primary)";
        if (token.startsWith("'") || /^\d/.test(token)) {
          cls = "text-(--mk-cyan)";
        } else if (KEYWORDS.has(token)) {
          cls = "text-(--mk-fg-muted)";
        } else if (tokens[index - 1] === ".") {
          cls = "text-(--mk-cyan)";
        }
        return (
          <span key={index} className={cls}>
            {token}
          </span>
        );
      })}
    </div>
  );
}

function EditorSection() {
  const [activeId, setActiveId] = useState(ENGINES[0]!.id);
  const [ranAt, setRanAt] = useState<string | null>(null);
  const engine = ENGINES.find((item) => item.id === activeId) ?? ENGINES[0]!;

  return (
    <section className="relative w-full py-40 bg-(--mk-bg)">
      <div className="max-w-[1280px] mx-auto px-6">
        <div className="max-w-[640px] mb-12">
          <div className={EYEBROW}>UNIFIED ACCESS LAYER</div>
          <h2
            className={`font-display text-[56px] leading-[67px] tracking-[-0.05em] ${GRADIENT_HEADING}`}
          >
            One syntax across relational, cache, and vector storage.
          </h2>
          <p className="text-[19px] leading-[27px] text-(--mk-fg-muted) mt-2">
            Select target engines on the fly. Heptadec translates, optimizes, and
            pipelines queries with direct memory isolation.
          </p>
        </div>
        <div className="flex items-center gap-4 mb-6 overflow-x-auto pb-2 mk-noscroll">
          {ENGINES.map((item) => {
            const selected = item.id === activeId;
            const width =
              item.id === "postgres" || item.id === "clickhouse"
                ? "w-[140px]"
                : "w-[130px]";
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => {
                  setActiveId(item.id);
                  setRanAt(null);
                }}
                aria-pressed={selected}
                className={
                  selected
                    ? `relative h-[56px] ${width} rounded-[16px] bg-(--mk-surface) border border-(--mk-cyan) shadow-[0_0_14px_color-mix(in_srgb,var(--mk-cyan)_22%,transparent)] flex items-center justify-center gap-2 transition-all`
                    : `h-[56px] ${width} rounded-[16px] bg-(--mk-surface) border border-(--mk-hairline) hover:border-(--mk-active) flex items-center justify-center gap-2 transition-all text-(--mk-fg-muted) hover:text-(--mk-fg-primary)`
                }
              >
                <span className={`w-2 h-2 rounded-full ${item.dot}`} />
                <span
                  className={
                    selected
                      ? "text-sm font-semibold text-(--mk-cyan)"
                      : "text-sm font-semibold"
                  }
                >
                  {item.label}
                </span>
              </button>
            );
          })}
        </div>
        <div className="relative w-full rounded-t-[24px] rounded-b-[16px] border-t border-(--mk-hairline) bg-(--mk-surface) overflow-hidden">
          <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[460px] h-[100px] pointer-events-none bg-[radial-gradient(60%_100%_at_50%_0,color-mix(in_srgb,var(--mk-cyan)_36%,transparent)_0%,color-mix(in_srgb,var(--mk-cyan)_4%,transparent)_50%,transparent_100%)]" />
          <div className="relative h-12 px-4 bg-[color-mix(in_srgb,var(--mk-bg)_40%,transparent)] border-b border-(--mk-hairline) flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-full bg-(--mk-container-highest)" />
              <span className="w-2.5 h-2.5 rounded-full bg-(--mk-container-highest)" />
              <span className="w-2.5 h-2.5 rounded-full bg-(--mk-container-highest)" />
              <div className="ml-4 h-7 px-3 rounded-[8px] bg-(--mk-tint-f5) border border-(--mk-hairline) flex items-center gap-2 text-(--mk-fg-primary) font-mono text-[13px]">
                <span className="material-symbols-outlined text-[15px] text-(--mk-cyan)">
                  terminal
                </span>
                <span>{engine.file}</span>
              </div>
              <div className="h-7 px-3 rounded-[8px] hidden sm:flex items-center gap-2 text-(--mk-fg-muted) hover:text-(--mk-fg-primary) font-mono text-[13px] cursor-pointer">
                <span>redis_pipeline_dump.lua</span>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <span className="font-mono text-[13px] text-(--mk-tertiary-container) flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 rounded-full bg-(--mk-tertiary-container)" />
                Execution: {ranAt ?? engine.latency}
              </span>
              <button
                type="button"
                onClick={() =>
                  setRanAt(`${(Math.random() * 0.6 + 0.4).toFixed(2)}ms`)
                }
                className="h-7 px-3 rounded-[8px] bg-(--mk-cyan) text-(--mk-on-accent) text-[13px] font-semibold hover:opacity-90 transition"
              >
                Run
              </button>
            </div>
          </div>
          <div className="relative p-6 font-mono text-[14.5px] leading-[20px] overflow-x-auto bg-gradient-to-b from-transparent via-transparent to-[color-mix(in_srgb,var(--mk-surface)_90%,transparent)]">
            <div className="grid grid-cols-[40px_1fr] gap-4">
              <div className="select-none text-right text-(--mk-fg-muted) font-mono">
                {engine.snippet.map((_, index) => (
                  <div key={index}>{String(index + 1).padStart(2, "0")}</div>
                ))}
              </div>
              <div className="font-mono text-(--mk-on-surface)">
                {engine.snippet.map((line) => (
                  <CodeLine key={line} text={line} />
                ))}
              </div>
            </div>
            <div className="h-10 w-full bg-gradient-to-t from-black to-transparent mt-4 pointer-events-none" />
          </div>
        </div>
      </div>
    </section>
  );
}

const ERD: Array<{
  name: string;
  kind: string;
  icon: string;
  rows: Array<{ field: string; type: string; dot: string; text: string }>;
}> = [
  {
    name: "users",
    kind: "relational",
    icon: "table_rows",
    rows: [
      { field: "id", type: "uuid (pk)", dot: "bg-(--mk-cyan)", text: "text-(--mk-fg-primary)" },
      { field: "email", type: "varchar(255)", dot: "bg-(--mk-surface-variant)", text: "text-(--mk-fg-primary)" },
      { field: "cluster_region", type: "text", dot: "bg-(--mk-surface-variant)", text: "text-(--mk-fg-primary)" },
      { field: "u_vec", type: "vector(1536)", dot: "bg-(--mk-secondary)", text: "text-(--mk-secondary)" },
      { field: "created_at", type: "timestamptz", dot: "bg-(--mk-surface-variant)", text: "text-(--mk-fg-primary)" },
    ],
  },
  {
    name: "events_stream",
    kind: "append-only",
    icon: "hub",
    rows: [
      { field: "id", type: "bigint (pk)", dot: "bg-(--mk-cyan)", text: "text-(--mk-fg-primary)" },
      { field: "user_id", type: "uuid (fk)", dot: "bg-(--mk-secondary)", text: "text-(--mk-fg-primary)" },
      { field: "event_name", type: "varchar(64)", dot: "bg-(--mk-surface-variant)", text: "text-(--mk-fg-primary)" },
      { field: "payload", type: "jsonb", dot: "bg-(--mk-surface-variant)", text: "text-(--mk-fg-primary)" },
      { field: "cache_key", type: "text (fk)", dot: "bg-(--mk-secondary)", text: "text-(--mk-secondary)" },
    ],
  },
  {
    name: "query_cache",
    kind: "in-memory",
    icon: "memory",
    rows: [
      { field: "cache_key", type: "varchar(128)", dot: "bg-(--mk-cyan)", text: "text-(--mk-fg-primary)" },
      { field: "hit_count", type: "uint64", dot: "bg-(--mk-surface-variant)", text: "text-(--mk-fg-primary)" },
      { field: "ttl_sec", type: "int4", dot: "bg-(--mk-surface-variant)", text: "text-(--mk-fg-primary)" },
      { field: "compression", type: "snappy", dot: "bg-(--mk-surface-variant)", text: "text-(--mk-fg-primary)" },
    ],
  },
];

function ErdSection() {
  return (
    <section className="relative w-full py-40 bg-(--mk-bg) border-t border-(--mk-hairline)">
      <div className="max-w-[1280px] mx-auto px-6">
        <div className="flex flex-col md:flex-row md:items-end justify-between gap-6 mb-12">
          <div className="max-w-[640px]">
            <div className={EYEBROW}>SCHEMA VISUALIZER &amp; TOPOLOGY</div>
            <h2
              className={`font-display text-[56px] leading-[67px] tracking-[-0.05em] ${GRADIENT_HEADING}`}
            >
              Automated entity lineage. Live sync.
            </h2>
          </div>
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2 font-mono text-[14.5px] text-(--mk-fg-muted)">
              <span className="w-2 h-2 rounded-full bg-(--mk-cyan)" /> Primary Key
            </div>
            <div className="flex items-center gap-2 font-mono text-[14.5px] text-(--mk-fg-muted)">
              <span className="w-2 h-2 rounded-full bg-(--mk-secondary)" /> Foreign
              Key / Embedding
            </div>
          </div>
        </div>
        <div className="relative w-full rounded-[24px] border border-(--mk-hairline) bg-(--mk-surface) p-6 md:p-12 overflow-hidden">
          <div className="absolute inset-0 bg-[linear-gradient(to_right,color-mix(in_srgb,var(--mk-cyan)_3%,transparent)_1px,transparent_1px),linear-gradient(to_bottom,color-mix(in_srgb,var(--mk-cyan)_3%,transparent)_1px,transparent_1px)] bg-[size:32px_32px]" />
          <svg
            className="absolute inset-0 w-full h-full pointer-events-none z-0"
            xmlns="http://www.w3.org/2000/svg"
          >
            <path
              d="M 320 180 C 450 180, 430 180, 520 180"
              fill="none"
              stroke="var(--mk-border-active)"
              strokeDasharray="4 4"
              strokeWidth="1.5"
            />
            <circle cx="320" cy="180" fill="var(--mk-cyan)" r="3" />
            <circle cx="520" cy="180" fill="var(--mk-secondary)" r="3" />
            <path
              d="M 760 220 C 850 220, 840 180, 930 180"
              fill="none"
              stroke="var(--mk-border-active)"
              strokeWidth="1.5"
            />
            <circle cx="760" cy="220" fill="var(--mk-secondary)" r="3" />
            <circle cx="930" cy="180" fill="var(--mk-cyan)" r="3" />
          </svg>
          <div className="relative z-10 grid grid-cols-1 md:grid-cols-3 gap-8 items-start">
            {ERD.map((table) => (
              <div
                key={table.name}
                className={
                  table.name === "events_stream"
                    ? "rounded-[16px] bg-(--mk-bg) border border-(--mk-active)/60 overflow-hidden shadow-[0_0_20px_color-mix(in_srgb,var(--mk-cyan)_8%,transparent)]"
                    : "rounded-[16px] bg-(--mk-bg) border border-(--mk-hairline) overflow-hidden shadow-lg"
                }
              >
                <div className="px-4 py-3 bg-[color-mix(in_srgb,var(--mk-bg)_60%,transparent)] border-b border-(--mk-hairline) flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="material-symbols-outlined text-(--mk-cyan) text-[17px]">
                      {table.icon}
                    </span>
                    <span className="font-mono text-[14.5px] font-semibold text-(--mk-fg-primary)">
                      {table.name}
                    </span>
                  </div>
                  <span
                    className={
                      table.name === "events_stream"
                        ? "font-mono text-[12px] text-(--mk-tertiary-container)"
                        : "font-mono text-[12px] text-(--mk-fg-muted)"
                    }
                  >
                    {table.kind}
                  </span>
                </div>
                <div className="divide-y divide-(--mk-hairline)/30 font-mono text-[14px]">
                  {table.rows.map((row) => (
                    <div
                      key={row.field}
                      className={
                        table.name === "events_stream" && row.field === "user_id"
                          ? "px-4 py-2.5 flex items-center justify-between bg-(--mk-cyan)/5"
                          : "px-4 py-2.5 flex items-center justify-between"
                      }
                    >
                      <span className={`flex items-center gap-2 ${row.text}`}>
                        <span className={`w-1.5 h-1.5 rounded-full ${row.dot}`} />
                        {row.field}
                      </span>
                      <span
                        className={
                          row.text === "text-(--mk-secondary)"
                            ? "text-(--mk-secondary)/80"
                            : "text-(--mk-fg-muted)"
                        }
                      >
                        {row.type}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}

const FEATURES = [
  {
    icon: "bolt",
    title: "Sub-millisecond Edge Caching",
    body: "In-memory compilation caches compiled execution plans next to the kernel socket, trimming P99 hops to bare metal speed.",
    tone: "text-(--mk-cyan)",
  },
  {
    icon: "sync_alt",
    title: "Instant Schema Migrations",
    body: "Non-locking DDL executions allow non-blocking index additions and table alterations without dropping active client connections.",
    tone: "text-(--mk-cyan)",
  },
  {
    icon: "layers",
    title: "Zero-Copy Parquet Export",
    body: "Stream data frames straight to cold object storage with Arrow flight buffers, avoiding JSON serialize round-trip penalties.",
    tone: "text-(--mk-cyan)",
  },
  {
    icon: "cloud_sync",
    title: "Self-Hosted or Cloud",
    body: "Run a static single binary inside your isolated VPC, or offload completely to our globally managed distributed nodes.",
    tone: "text-(--mk-cyan)",
  },
  {
    icon: "smart_toy",
    title: "Automated MCP Server",
    body: "Native Model Context Protocol exposing controlled schema metadata and read endpoints directly to Claude and autonomous AI agents.",
    tone: "text-(--mk-secondary)",
  },
  {
    icon: "polyline",
    title: "Native Vector Indexing",
    body: "HNSW graph search operating side-by-side with relational transactions without needing an external vector database stack.",
    tone: "text-(--mk-cyan)",
  },
];

function FeaturesSection() {
  return (
    <section className="relative w-full py-40 bg-(--mk-bg) border-t border-(--mk-hairline)">
      <div className="max-w-[1280px] mx-auto px-6">
        <div className="max-w-[640px] mb-16">
          <div className={EYEBROW}>SYSTEM CAPABILITIES</div>
          <h2
            className={`font-display text-[56px] leading-[67px] tracking-[-0.05em] ${GRADIENT_HEADING}`}
          >
            Zero-overhead developer primitives.
          </h2>
          <p className="text-[19px] leading-[27px] text-(--mk-fg-muted) mt-2">
            No external proxy layers. No bloatware daemons. Heptadec drops directly
            into your current network topology.
          </p>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-x-12 gap-y-16">
          {FEATURES.map((feature) => (
            <div key={feature.title} className="flex flex-col space-y-3">
              <div className={`w-10 h-10 rounded-[10px] bg-(--mk-surface) border border-(--mk-hairline) flex items-center justify-center ${feature.tone}`}>
                <span className="material-symbols-outlined text-[21px]">
                  {feature.icon}
                </span>
              </div>
              <h3 className="font-display text-[21px] leading-[26px] text-(--mk-fg-primary) font-normal">
                {feature.title}
              </h3>
              <p className="text-sm text-(--mk-fg-muted) leading-relaxed">
                {feature.body}
              </p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function FinalCta({ onGetStarted }: { onGetStarted: () => void }) {
  return (
    <section className="relative w-full py-40 bg-(--mk-bg) overflow-hidden">
      <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[1200px] h-[200px] pointer-events-none rounded-[100%] border-t border-[color-mix(in_srgb,var(--mk-cyan)_18%,transparent)] [box-shadow:0_-20px_60px_-15px_color-mix(in_srgb,var(--mk-cyan)_10%,transparent)]" />
      <div className="relative max-w-[1280px] mx-auto px-6 text-center flex flex-col items-center">
        <div className={EYEBROW}>READY IN SECONDS</div>
        <h2
          className={`font-serif text-[58px] lg:text-[96px] max-w-[840px] tracking-[-0.01em] leading-[64px] lg:leading-[96px] mb-6 ${GRADIENT_HEADING}`}
        >
          Experience calm query architecture.
        </h2>
        <p className="text-[19px] leading-[27px] text-(--mk-fg-muted) max-w-[560px] mb-8">
          Clone the repo, install dependencies, apply the migrations, and run it
          locally. Everything you need is in the README.
        </p>
        <div className="flex flex-wrap items-center justify-center gap-4">
          <button
            type="button"
            onClick={onGetStarted}
            className={`h-12 px-8 flex items-center justify-center rounded-[16px] ${PRIMARY} text-sm font-semibold transition-all duration-200 ${PRIMARY_HOVER}`}
          >
            Start building in minutes
          </button>
          <a
            href={REPO_URL}
            target="_blank"
            rel="noreferrer"
            className="h-12 px-6 flex items-center justify-center rounded-[16px] text-sm font-semibold text-(--mk-fg-muted) hover:text-(--mk-fg-primary) transition-colors"
          >
            Explore the source
          </a>
        </div>
      </div>
    </section>
  );
}

function ConnectAnythingSection() {
  return (
    <section
      id="connect"
      className="relative w-full py-24 bg-(--mk-bg) border-t border-(--mk-hairline)"
    >
      <div className="max-w-[1280px] mx-auto px-6">
        <div className={EYEBROW}>SUPPORTED ENGINES</div>
        <h2
          className={`font-serif text-[40px] lg:text-[56px] tracking-[-0.01em] mb-4 ${GRADIENT_HEADING}`}
        >
          Connect anything.
        </h2>
        <p className="text-[18px] leading-[27px] text-(--mk-fg-muted) max-w-[560px] mb-10">
          Every database your team already runs, one control plane. Point
          Heptadec at any of these and browse, query, and diagram it right away.
        </p>

        <ul className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
          {ENGINE_KINDS.map((kind) => (
            <li
              key={kind}
              className="flex items-center gap-3 rounded-[14px] border border-(--mk-hairline) bg-(--mk-tint-f5) p-4 transition-all duration-150 hover:border-(--mk-cyan)"
            >
              <EngineIcon name={kind} className="size-6" />
              <span className="text-sm font-semibold text-(--mk-fg-primary)">
                {ENGINE_SPECS[kind].name}
              </span>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}

function DeploySection() {
  return (
    <section id="deploy" className="relative w-full py-24 bg-(--mk-bg) border-t border-(--mk-hairline) scroll-mt-20">
      <div className="max-w-[1280px] mx-auto px-6">
        <div className={EYEBROW}>OPEN SOURCE, SELF-HOSTED</div>
        <h2 className={`font-serif text-[40px] lg:text-[56px] tracking-[-0.01em] mb-4 ${GRADIENT_HEADING}`}>
          Deploy it your way.
        </h2>
        <p className="text-[18px] leading-[27px] text-(--mk-fg-muted) max-w-[560px] mb-10">
          Open source, and free if you deploy it yourself. Clone it and run it
          on your own server — or let us deploy and run it for you, from $5 a
          month.
        </p>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="flex flex-col justify-between gap-8 p-5 rounded-[16px] border border-(--mk-hairline) bg-(--mk-tint-f5)">
            <div>
              <div className="flex items-center gap-2">
                <div className="text-sm font-semibold text-(--mk-fg-primary)">
                  Deploy to Cloudflare
                </div>
                <span className="rounded-[6px] border border-(--mk-hairline) px-1.5 py-0.5 font-mono text-[11px] uppercase text-(--mk-fg-muted)">
                  Soon
                </span>
              </div>
              <p className="mt-2 text-sm text-(--mk-fg-muted)">
                One-click Workers and D1 provisioning. In progress.
              </p>
            </div>
            <a
              href={`${REPO_URL}/issues`}
              target="_blank"
              rel="noreferrer"
              className="text-sm font-semibold text-(--mk-cyan) hover:underline"
            >
              Track the progress →
            </a>
          </div>

          <div className="group flex flex-col justify-between gap-8 p-5 rounded-[16px] border border-(--mk-hairline) bg-(--mk-tint-f5)">
            <div>
              <div className="text-sm font-semibold text-(--mk-fg-primary)">
                Run on your server
              </div>
              <p className="mt-2 text-sm text-(--mk-fg-muted)">
                Clone it, install with pnpm, run it on any VPS or your own
                box.
              </p>
              <pre className="mt-3 overflow-x-auto rounded-[12px] border border-(--mk-hairline) bg-(--mk-bg-surface) p-3 font-mono text-[13px] leading-[20px] text-(--mk-fg-primary)">
{`git clone https://github.com/${REPO}.git
cd Heptadec && pnpm install
cp .env.example .env
pnpm db:migrate && pnpm dev`}
              </pre>
            </div>
            <span className="font-mono text-[12px] text-(--mk-fg-muted)">
              API :8787 · web :5173
            </span>
          </div>

          <a
            href={REPO_URL}
            target="_blank"
            rel="noreferrer"
            className="group flex flex-col justify-between gap-8 p-5 rounded-[16px] border border-(--mk-hairline) bg-(--mk-tint-f5) transition-all duration-150 hover:border-(--mk-cyan)"
          >
            <div>
              <div className="flex items-center gap-2">
                <div className="text-sm font-semibold text-(--mk-fg-primary)">
                  Star on GitHub
                </div>
                <GitHubStars />
              </div>
              <p className="mt-2 text-sm text-(--mk-fg-muted)">
                Free and open source. Read it, fork it, self-host it.
              </p>
            </div>
            <span className="text-sm font-semibold text-(--mk-cyan)">
              View the source →
            </span>
          </a>
        </div>
      </div>
    </section>
  );
}

function Footer() {
  return (
    <footer className="w-full bg-(--mk-bg) border-t border-(--mk-hairline) px-6 py-8">
      <div className="mx-auto flex max-w-[1280px] flex-col items-center justify-between gap-4 md:flex-row">
        <div className="flex items-center gap-2">
          <span className="w-2 h-2 rounded-full bg-(--mk-cyan) shadow-[0_0_8px_color-mix(in_srgb,var(--mk-cyan)_80%,transparent)]" />
          <span className="font-display text-[17px] font-semibold tracking-tight text-(--mk-fg-primary)">
            Heptadec
          </span>
          <span className="font-mono text-[12px] text-(--mk-fg-muted)">
            © 2026
          </span>
        </div>

        <div className="flex flex-wrap items-center justify-center gap-x-5 gap-y-2">
          <GitHubStars label="Star us" />
          <a
            href="https://myhappr.com/mbazudaniel"
            target="_blank"
            rel="noreferrer"
            className="inline-flex h-[36px] items-center gap-2 rounded-[14px] bg-(--mk-cyan) px-4 text-sm font-semibold text-(--mk-on-accent) transition-all duration-150 hover:brightness-110"
          >
            <span className="material-symbols-outlined text-[19px]">
              favorite
            </span>
            Sponsor
          </a>
        </div>
      </div>
    </footer>
  );
}

export function Landing({ onGetStarted }: ILandingProps) {
  return (
    <div className="mk flex flex-col w-full text-(--mk-on-surface) overflow-x-hidden scroll-smooth selection:bg-(--mk-cyan) selection:text-(--mk-on-accent)">
      <Header onGetStarted={onGetStarted} />
      <main className="w-full pt-[58px] bg-(--mk-bg) min-h-screen">
        <section className="relative w-full overflow-hidden pt-12 pb-50 border-b border-(--mk-hairline)">
          <div className="absolute -top-32 right-[-10%] w-[900px] h-[900px] pointer-events-none rounded-full bg-[radial-gradient(circle_at_center,color-mix(in_srgb,var(--mk-cyan)_9%,transparent)_0%,color-mix(in_srgb,var(--mk-cyan)_2%,transparent)_45%,transparent_70%)] blur-[60px]" />
          <div className="absolute bottom-0 left-1/2 -translate-x-1/2 w-[1600px] h-[360px] pointer-events-none rounded-[100%] border-t-2 border-[color-mix(in_srgb,var(--mk-cyan)_16%,transparent)] [box-shadow:0_-30px_80px_-20px_color-mix(in_srgb,var(--mk-cyan)_12%,transparent)] [filter:blur(1.5px)]" />
          <div className="relative max-w-[1280px] mx-auto px-6">
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-center min-h-[560px]">
              <HeroCopy onGetStarted={onGetStarted} />
              <HeroStage />
            </div>
          </div>
        </section>
        <EditorSection />
        <ErdSection />
        <FeaturesSection />
        <ConnectAnythingSection />
        <DeploySection />
        <FinalCta onGetStarted={onGetStarted} />
      </main>
      <Footer />
    </div>
  );
}
