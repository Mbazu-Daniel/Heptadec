import { useCallback, useEffect, useRef, useState } from "react";
import {
  AUDIT_EVENTS,
  AUDIT_TARGET_KINDS,
  type AuditEvent,
  type IAuditLog,
} from "@heptadec/api/audit-contracts";
import {
  listAuditLogs,
  messageFor,
  type IAuditLogFilters,
} from "../api";
import { Input } from "./ui/input";
import { Alert, EmptyState } from "./ui/feedback";
import { cn } from "@/lib/utils";
import {
  FilterSummary,
  PageHeading,
  TABLE_CELL_CLASSNAME,
  TABLE_CLASSNAME,
  TABLE_HEAD_CLASSNAME,
  TABLE_ROW_CLASSNAME,
  TOOLBAR_INPUT_CLASSNAME,
  TOOLBAR_SELECT_CLASSNAME,
  Toolbar,
  VIEW_CLASSNAME,
  Workspace,
} from "./workspace";

const ACRONYMS: Record<string, string> = { mcp: "MCP", ai: "AI" };

function humanize(value: string): string {
  return value
    .split(/[._]/)
    .map((word, index) => {
      const spelled = ACRONYMS[word] ?? word;
      return index === 0
        ? spelled.charAt(0).toUpperCase() + spelled.slice(1)
        : spelled;
    })
    .join(" ");
}

function groupEvents(): Array<{ kind: string; events: readonly AuditEvent[] }> {
  const groups = new Map<string, AuditEvent[]>();
  for (const event of AUDIT_EVENTS) {
    const kind = event.slice(0, event.indexOf("."));
    const existing = groups.get(kind);
    if (existing === undefined) {
      groups.set(kind, [event]);
    } else {
      existing.push(event);
    }
  }
  return [...groups].map(([kind, events]) => ({ kind, events }));
}

const EVENT_GROUPS = groupEvents();

export function AuditLog({ isOwner }: { isOwner: boolean }) {
  const [logs, setLogs] = useState<IAuditLog[] | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [q, setQ] = useState("");
  const [event, setEvent] = useState("");
  const [target, setTarget] = useState("");
  const [since, setSince] = useState("");
  const [until, setUntil] = useState("");
  const sequence = useRef(0);

  const reload = useCallback(
    async (filters: IAuditLogFilters) => {
      if (!isOwner) {
        return;
      }
      const ticket = ++sequence.current;
      setProblem(null);
      try {
        const listed = await listAuditLogs(filters);
        if (ticket !== sequence.current) {
          return;
        }
        setLogs(listed.auditLogs);
      } catch (caught) {
        if (ticket !== sequence.current) {
          return;
        }
        setProblem(messageFor(caught, "The audit log could not be loaded."));
      }
    },
    [isOwner],
  );

  useEffect(() => {
    void reload({ q, event, target, since, until });
  }, [reload, q, event, target, since, until]);

  const filtering =
    q !== "" || event !== "" || target !== "" || since !== "" || until !== "";

  const total =
    logs === null
      ? "—"
      : `${logs.length} ${logs.length === 1 ? "event" : "events"}`;

  return (
    <section className={VIEW_CLASSNAME}>
      <PageHeading meta={<span>{total}</span>} />

      <Toolbar>
        <Input
          value={q}
          onChange={(changed) => setQ(changed.target.value)}
          placeholder="Search who or what…"
          aria-label="Search the audit log"
          className={cn("w-56", TOOLBAR_INPUT_CLASSNAME)}
        />
        <select
          value={event}
          onChange={(change) => setEvent(change.target.value)}
          aria-label="Filter by event"
          className={TOOLBAR_SELECT_CLASSNAME}
        >
          <option value="">All events</option>
          {EVENT_GROUPS.map((group) => (
            <optgroup key={group.kind} label={humanize(group.kind)}>
              {group.events.map((item) => (
                <option key={item} value={item}>
                  {humanize(item)}
                </option>
              ))}
            </optgroup>
          ))}
        </select>
        <select
          value={target}
          onChange={(change) => setTarget(change.target.value)}
          aria-label="Filter by target"
          className={TOOLBAR_SELECT_CLASSNAME}
        >
          <option value="">All targets</option>
          {AUDIT_TARGET_KINDS.map((kind) => (
            <option key={kind} value={kind}>
              {humanize(kind)}
            </option>
          ))}
        </select>
        <Input
          type="date"
          value={since}
          onChange={(changed) => setSince(changed.target.value)}
          aria-label="From date"
          className={cn("w-36", TOOLBAR_INPUT_CLASSNAME)}
        />
        <Input
          type="date"
          value={until}
          onChange={(changed) => setUntil(changed.target.value)}
          aria-label="To date"
          className={cn("w-36", TOOLBAR_INPUT_CLASSNAME)}
        />
      </Toolbar>

      {filtering && logs !== null ? (
        <FilterSummary
          count={logs.length}
          onClear={() => {
            setQ("");
            setEvent("");
            setTarget("");
            setSince("");
            setUntil("");
          }}
        />
      ) : null}

      <Workspace
        view={
          <>
            {problem !== null ? <Alert className="mb-3">{problem}</Alert> : null}

            {!isOwner ? (
              <EmptyState
                title="Owners only"
                body="The audit log is read by an owner of this organization."
              />
            ) : logs === null ? (
              <p className="py-8 text-center font-mono text-xs text-muted-foreground">
                Reading the audit log.
              </p>
            ) : logs.length === 0 && !filtering ? (
              <EmptyState
                title="Nothing recorded yet"
                body="Changes made in this organization will be listed here."
              />
            ) : logs.length === 0 ? (
              <EmptyState
                title="Nothing matches"
                body="No entry matches the current filters."
              />
            ) : (
              <table className={TABLE_CLASSNAME} aria-label="Audit log">
                <thead>
                  <tr>
                    <th scope="col" className={TABLE_HEAD_CLASSNAME}>
                      When
                    </th>
                    <th scope="col" className={TABLE_HEAD_CLASSNAME}>
                      Who
                    </th>
                    <th scope="col" className={TABLE_HEAD_CLASSNAME}>
                      What
                    </th>
                    <th scope="col" className={TABLE_HEAD_CLASSNAME}>
                      On
                    </th>
                    <th scope="col" className={TABLE_HEAD_CLASSNAME}>
                      Detail
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {logs.map((log) => (
                    <tr key={log.id} className={TABLE_ROW_CLASSNAME}>
                      <td className={cn(TABLE_CELL_CLASSNAME, "whitespace-nowrap tabular-nums")}>
                        {new Date(log.occurredAt).toLocaleString()}
                      </td>
                      <td className={TABLE_CELL_CLASSNAME}>{log.actorLabel}</td>
                      <td className={TABLE_CELL_CLASSNAME}>{humanize(log.event)}</td>
                      <td className={TABLE_CELL_CLASSNAME}>
                        <span className="block max-w-56 truncate">
                          {log.targetLabel ?? humanize(log.targetKind)}
                        </span>
                      </td>
                      <td className={TABLE_CELL_CLASSNAME}>
                        <span className="block max-w-64 truncate text-muted-foreground">
                          {log.detail ?? ""}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </>
        }
      />
    </section>
  );
}
