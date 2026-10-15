import { useCallback, useEffect, useState } from "react";
import { IconTrash } from "@tabler/icons-react";
import type {
  IAlertDelivery,
  IAlertRule,
  ICreateAlertRuleRequest,
} from "@heptadec/api/alert-contracts";
import type {
  ICreateScheduledJobRequest,
  IScheduledJob,
} from "@heptadec/api/scheduler-contracts";
import type { ISavedQueryListResponse } from "@heptadec/api/saved-query-contracts";
import {
  createAlertRule,
  createScheduledJob,
  deleteAlertRule,
  deleteScheduledJob,
  listAlertDeliveries,
  listAlertRules,
  listAllSavedQueries,
  listNotificationChannels,
  listScheduledJobs,
  messageFor,
} from "../api";
import {
  buildCron,
  DEFAULT_WHEN,
  describeCron,
  HOURS,
  MINUTES,
  REPEATS,
  WEEKDAYS,
  WEEKDAY_PRESETS,
  type IWhen,
  type TRepeat,
} from "./schedule-when";
import { Button } from "./ui/button";
import { Alert, EmptyState } from "./ui/feedback";
import { FieldGroup, FieldLabel } from "./ui/field";
import { Input } from "./ui/input";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "./ui/dialog";
import { ToggleFormArea } from "./connection/ToggleFormArea";
import {
  SMALL_BUTTON_CLASSNAME,
  VIEW_CLASSNAME,
  Workspace,
} from "./workspace";

const OPERATORS = [">", ">=", "<", "<=", "="] as const;

const FRESHNESS = [
  { value: 300, label: "5 minutes" },
  { value: 900, label: "15 minutes" },
  { value: 3600, label: "1 hour" },
  { value: 21600, label: "6 hours" },
  { value: 86400, label: "1 day" },
];

function when(iso: string | null): string {
  return iso === null ? "never" : new Date(iso).toLocaleString();
}


/** One schedule, read as a sentence: how often, how long it stays fresh. */
function scheduleSummary(job: IScheduledJob): string {
  return `${describeCron(job.cron)} · kept fresh for ${freshness(job.ttlSeconds)} · next ${when(job.nextRunAt)} (${job.timezone})`;
}

function freshness(seconds: number): string {
  return (
    FRESHNESS.find((option) => option.value === seconds)?.label ?? `${seconds}s`
  );
}


/**
 * Schedules and alerts in one place, grouped by the saved query they both hang
 * off. A schedule is the clock on a query and an alert is the reaction on the
 * same query, so showing them as two tables made one relationship look like two
 * unrelated features — and hid an alert whose query nothing ever runs.
 */
export function Monitoring({ onOpenSources }: { onOpenSources: () => void }) {
  const [jobs, setJobs] = useState<IScheduledJob[] | null>(null);
  const [queries, setQueries] = useState<
    ISavedQueryListResponse["savedQueries"]
  >([]);
  const [rules, setRules] = useState<IAlertRule[]>([]);
  const [log, setLog] = useState<
    Awaited<ReturnType<typeof listAlertDeliveries>> | null
  >(null);
  const [channelCount, setChannelCount] = useState<number | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [adding, setAdding] = useState<"schedule" | "alert" | null>(null);
  // Which rows are opened. The list stays collapsed until a row is clicked.
  const [expanded, setExpanded] = useState<readonly string[]>([]);
  const [target, setTarget] = useState<string | null>(null);

  const reload = useCallback(async () => {
    setProblem(null);
    try {
      const [scheduled, saved, alertRules, deliveries, connected] =
        await Promise.all([
          listScheduledJobs(),
          listAllSavedQueries(),
          listAlertRules(),
          listAlertDeliveries(),
          listNotificationChannels(),
        ]);
      setJobs(scheduled.scheduledJobs);
      setQueries(saved.savedQueries);
      setRules(alertRules.alertRules);
      setLog(deliveries);
      setChannelCount(connected.notificationChannels.length);
    } catch (caught) {
      setProblem(messageFor(caught, "Monitoring could not be loaded."));
    }
  }, []);

  useEffect(() => {
    void reload();
  }, [reload]);

  async function removeSchedule(job: IScheduledJob): Promise<void> {
    setBusy(true);
    setProblem(null);
    try {
      await deleteScheduledJob(job.id);
      await reload();
    } catch (caught) {
      setProblem(messageFor(caught, "That schedule was not removed."));
    } finally {
      setBusy(false);
    }
  }

  async function removeAlert(rule: IAlertRule): Promise<void> {
    setBusy(true);
    setProblem(null);
    try {
      await deleteAlertRule(rule.id);
      await reload();
    } catch (caught) {
      setProblem(messageFor(caught, "That alert was not removed."));
    } finally {
      setBusy(false);
    }
  }

  if (jobs === null) {
    return (
      <div className={VIEW_CLASSNAME}>
        <Workspace
          view={
            <>
              {/* Shown here as well: without it a load that never resolves
                  spins forever instead of saying what went wrong. */}
              {problem !== null ? (
                <Alert className="mb-3">{problem}</Alert>
              ) : null}
              <p className="py-8 text-center font-mono text-xs text-muted-foreground">
                Loading monitoring.
              </p>
            </>
          }
        />
      </div>
    );
  }


  const entries = queries
    .map((query) => ({
      query,
      schedules: jobs.filter((job) => job.savedQueryId === query.id),
      rules: rules.filter((rule) => rule.savedQueryId === query.id),
    }))
    .filter((entry) => entry.schedules.length > 0 || entry.rules.length > 0)
    .sort(
      (a, b) =>
        // Queries on a timer first; the ones still waiting for a clock last.
        Number(b.schedules.length > 0) - Number(a.schedules.length > 0),
    );

  const waiting = entries.filter((entry) => entry.schedules.length === 0)
    .length;
  const chosen =
    target === null ? null : (queries.find((q) => q.id === target) ?? null);

  function summary(entry: { schedules: IScheduledJob[] }): string {
    const first = entry.schedules[0]!;
    return `${describeCron(first.cron)} · kept fresh ${freshness(first.ttlSeconds)}`;
  }

  /** The deliveries made against one query's alerts, newest first. */
  function deliveriesFor(rules: readonly IAlertRule[]): IAlertDelivery[] {
    if (log === null) {
      return [];
    }
    const ofOurs = new Set(rules.map((rule) => rule.id));
    return log.alertDeliveries
      .filter((delivery) => ofOurs.has(delivery.alertRuleId))
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }

  return (
    <div className={VIEW_CLASSNAME}>
      <div className="flex h-11 shrink-0 items-center gap-2 border-b border-border px-4">
        <span className="ml-auto font-mono text-[11px] text-muted-foreground">
          {rules.length} {rules.length === 1 ? "alert" : "alerts"}
          {waiting > 0 ? ` · ${waiting} waiting for a clock` : ""}
        </span>
        <Button
          onClick={() => {
            setTarget(queries[0]?.id ?? null);
            setAdding("schedule");
          }}
          disabled={queries.length === 0}
          className="h-7 gap-1.5 px-3 text-xs"
        >
          New schedule
        </Button>
      </div>

      <Workspace
        view={
          <>
            {problem !== null ? <Alert className="mb-3">{problem}</Alert> : null}

            {entries.length === 0 ? (
              <EmptyState
                title="Nothing is being watched"
                body={
                  queries.length === 0
                    ? "Save a query first — a schedule keeps its result fresh, and an alert tells you when a column crosses a threshold."
                    : "Pick a saved query and put it on a timer. Its result stays fresh, and you can add an alert to be told when a column crosses a threshold."
                }
                action={
                  // A query is written on the source it reads, so an empty
                  // watcher with nothing to watch sends the reader there
                  // rather than leaving the instruction with no way to follow it.
                  queries.length === 0 ? (
                    <Button onClick={onOpenSources} className={SMALL_BUTTON_CLASSNAME}>
                      Go to data sources
                    </Button>
                  ) : null
                }
              />
            ) : (
              <ul>
                {entries.map((entry) => {
                  const open = expanded.includes(entry.query.id);
                  const timed = entry.schedules.length > 0;
                  return (
                    <li
                      key={entry.query.id}
                      className="border-b border-border last:border-b-0"
                    >
                      <button
                        type="button"
                        aria-expanded={open}
                        onClick={() =>
                          setExpanded((current) =>
                            open
                              ? current.filter((id) => id !== entry.query.id)
                              : [...current, entry.query.id],
                          )
                        }
                        className="flex w-full items-center gap-2 px-4 py-3 text-left transition-colors hover:bg-foreground/[0.03]"
                      >
                        <span className="material-symbols-outlined text-[18px] text-muted-foreground">
                          {open ? "expand_more" : "chevron_right"}
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-sm">
                            {entry.query.name}
                          </span>
                          <span className="block truncate text-[11px] text-muted-foreground">
                            {timed
                              ? summary(entry)
                              : "not on a timer"}
                          </span>
                        </span>
                        {timed ? null : (
                          <span className="shrink-0 text-[11px] text-amber-600">
                            waiting for a clock
                          </span>
                        )}
                        {entry.rules.length === 0 ? null : (
                          <span className="shrink-0 text-[11px] text-muted-foreground">
                            {entry.rules.length}{" "}
                            {entry.rules.length === 1 ? "alert" : "alerts"}
                          </span>
                        )}
                      </button>

                      {open ? (
                        <div className="grid gap-4 px-4 pb-4 pl-11">
                          {timed ? (
                            <>
                            <p className="text-[11px]">
                              {/* Cadence and zone only: the collapsed row
                                  already says how long the result stays fresh,
                                  and saying it twice is how a list stops
                                  reading as a list. */}
                              {entry.schedules
                                .map(
                                  (job) =>
                                    `${describeCron(job.cron)} (${job.timezone})`,
                                )
                                .join("  ·  ")}
                            </p>
                            <p className="text-[11px] text-muted-foreground">
                              last{" "}
                              {entry.schedules
                                .map((job) => when(job.lastRunAt))
                                .join(", ")}{" "}
                              · next{" "}
                              {entry.schedules
                                .map((job) => when(job.nextRunAt))
                                .join(", ")}
                            </p>
                            </>
                          ) : (
                            <p className="text-[11px] text-muted-foreground">
                              Never checked — nothing runs this query. Put it on a timer.
                            </p>
                          )}

                          <div>
                            <div className="mb-1.5 flex items-center gap-2">
                              <span className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                                Alerts
                              </span>
                              <Button
                                variant="ghost"
                                onClick={() => {
                                  setTarget(entry.query.id);
                                  setAdding("alert");
                                }}
                                className="h-6 px-2 text-[11px]"
                              >
                                Add alert
                              </Button>
                            </div>
                            {entry.rules.length === 0 ? (
                              <p className="text-[11px] text-muted-foreground">
                                "None"
                              </p>
                            ) : (
                              <ul className="grid gap-1">
                                {entry.rules.map((rule) => (
                                  <li
                                    key={rule.id}
                                    className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px]"
                                  >
                                    <span className="text-fg">{rule.name}</span>
                                    <span className="font-mono text-muted-foreground">
                                      {rule.column} {rule.operator}{" "}
                                      {rule.threshold}
                                    </span>
                                    {/* The server knows whether anything runs this
                                        rule's query, and says so per rule. Read
                                        that rather than working it out from the
                                        query's schedules here, where the two can
                                        disagree about a rule nothing runs. */}
                                    {rule.scheduled ? null : (
                                      <span className="text-amber-600">
                                        never runs — nothing queries it
                                      </span>
                                    )}
                                    <span className="text-muted-foreground">
                                      {channelCount === null
                                        ? "reading…"
                                        : channelCount === 0
                                          ? "tells nobody — no channels connected"
                                          : `tells ${channelCount} ${channelCount === 1 ? "channel" : "channels"}`}
                                    </span>
                                    <Button
                                      variant="ghost"
                                      disabled={busy}
                                      onClick={() => void removeAlert(rule)}
                                      className="ml-auto h-6 px-2 text-red"
                                      title={`Remove the alert ${rule.name}`}
                                    >
                                      <IconTrash size={13} />
                                    </Button>
                                  </li>
                                ))}
                              </ul>
                            )}
                          </div>

                          {deliveriesFor(entry.rules).length > 0 ? (
                            <ToggleFormArea title="Recent deliveries">
                              <ul className="grid gap-1">
                                {deliveriesFor(entry.rules)
                                  .slice(0, 6)
                                  .map((delivery) => (
                                    <li
                                      key={delivery.id}
                                      className="flex flex-wrap items-center gap-x-3 text-[11px]"
                                    >
                                      <span className="text-fg">
                                        {
                                          entry.rules.find(
                                            (rule) =>
                                              rule.id === delivery.alertRuleId,
                                          )?.name ?? "removed alert"
                                        }
                                      </span>
                                      <span className="font-mono text-muted-foreground">
                                        {delivery.channel}
                                      </span>
                                      <span
                                        className={
                                          delivery.status === "failed"
                                            ? "text-red"
                                            : "text-muted-foreground"
                                        }
                                      >
                                        {delivery.status}
                                      </span>
                                      <span className="ml-auto font-mono text-muted-foreground">
                                        {when(delivery.createdAt)}
                                      </span>
                                    </li>
                                  ))}
                              </ul>
                            </ToggleFormArea>
                          ) : null}

                          {timed ? (
                            <Button
                              variant="ghost"
                              disabled={busy}
                              onClick={() =>
                                void removeSchedule(entry.schedules[0]!)
                              }
                              className="justify-self-start rounded-none text-red"
                            >
                              Stop
                            </Button>
                          ) : (
                            <Button
                              variant="ghost"
                              onClick={() => {
                                setTarget(entry.query.id);
                                setAdding("schedule");
                              }}
                              className="justify-self-start rounded-none"
                            >
                              Put this query on a timer
                            </Button>
                          )}
                        </div>
                      ) : null}
                    </li>
                  );
                })}
              </ul>
            )}
          </>
        }
      />

      {adding === "schedule" && chosen !== null ? (
        <ScheduleDialog
          query={chosen}
          onClose={() => setAdding(null)}
          onSaved={async () => {
            setAdding(null);
            await reload();
          }}
        />
      ) : null}

      {adding === "alert" && chosen !== null ? (
        <AlertDialog
          query={chosen}
          onClose={() => setAdding(null)}
          onSaved={async () => {
            setAdding(null);
            await reload();
          }}
        />
      ) : null}
    </div>
  );
}

function ScheduleDialog({
  query,
  onClose,
  onSaved,
}: {
  query: ISavedQueryListResponse["savedQueries"][number];
  onClose: () => void;
  onSaved: () => Promise<void>;
}) {
  // A schedule runs one saved query, and the row this was opened from already
  // said which. Writing a query is not this dialog's job — a Saved Query belongs
  // to the source it reads and is written there — so this turns one query into a
  // timer and nothing else.
  const [name, setName] = useState("");
  const [when, setWhen] = useState<IWhen>(DEFAULT_WHEN);
  const [timezone, setTimezone] = useState(
    Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC",
  );
  const [ttlSeconds, setTtlSeconds] = useState(3600);
  const [problem, setProblem] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const cron = buildCron(when);

  async function save(): Promise<void> {
    setBusy(true);
    setProblem(null);
    try {
      const input: ICreateScheduledJobRequest = {
        savedQueryId: query.id,
        name,
        cron,
        timezone,
        ttlSeconds,
      };
      await createScheduledJob(input);
      await onSaved();
    } catch (caught) {
      setProblem(messageFor(caught, "That schedule was not saved."));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open onOpenChange={(open) => (open ? undefined : onClose())}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>New schedule</DialogTitle>
        </DialogHeader>
        <div className="flex flex-col gap-4">
          {problem !== null ? <Alert>{problem}</Alert> : null}

          {/* The query was chosen before this dialog opened — the list it came
              from is one row, so a picker over it would offer no choice. */}
          <p className="text-xs text-muted-foreground">
            Scheduling <span className="font-mono text-fg">{query.name}</span>
          </p>


          <FieldGroup>
            <FieldLabel htmlFor="schedule-name">Name</FieldLabel>
            <Input
              id="schedule-name"
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="Hourly events"
            />
          </FieldGroup>
          <FieldGroup>
            <FieldLabel htmlFor="schedule-repeat">Runs</FieldLabel>
            <select
              id="schedule-repeat"
              value={when.repeat}
              onChange={(event) =>
                setWhen({ ...when, repeat: event.target.value as TRepeat })
              }
              className="h-9 rounded-md border border-input bg-background px-2 text-xs text-foreground"
            >
              {REPEATS.map((option) => (
                <option key={option.id} value={option.id}>
                  {option.label}
                </option>
              ))}
            </select>
          </FieldGroup>
          {when.repeat === "hourly" ? null : (
            <div className="grid grid-cols-2 gap-3">
              <FieldGroup>
                <FieldLabel htmlFor="schedule-hour">At hour</FieldLabel>
                <select
                  id="schedule-hour"
                  value={when.hour}
                  onChange={(event) => setWhen({ ...when, hour: event.target.value })}
                  className="h-9 rounded-md border border-input bg-background px-2 text-xs text-foreground"
                >
                  {HOURS.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </FieldGroup>
              <FieldGroup>
                <FieldLabel htmlFor="schedule-minute">Minute</FieldLabel>
                <select
                  id="schedule-minute"
                  value={when.minute}
                  onChange={(event) =>
                    setWhen({ ...when, minute: event.target.value })
                  }
                  className="h-9 rounded-md border border-input bg-background px-2 text-xs text-foreground"
                >
                  {MINUTES.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </FieldGroup>
            </div>
          )}
          {when.repeat === "weekly" ? (
            <FieldGroup>
              <FieldLabel htmlFor="schedule-weekday">On</FieldLabel>
              <select
                id="schedule-weekday"
                value={when.weekday}
                onChange={(event) => setWhen({ ...when, weekday: event.target.value })}
                className="h-9 rounded-md border border-input bg-background px-2 text-xs text-foreground"
              >
                {WEEKDAY_PRESETS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
                {WEEKDAYS.map((day) => (
                  <option key={day.value} value={day.value}>
                    {day.long}
                  </option>
                ))}
              </select>
            </FieldGroup>
          ) : null}
          {when.repeat === "monthly" ? (
            <FieldGroup>
              <FieldLabel htmlFor="schedule-day">On day</FieldLabel>
              <select
                id="schedule-day"
                value={when.dayOfMonth}
                onChange={(event) =>
                  setWhen({ ...when, dayOfMonth: event.target.value })
                }
                className="h-9 rounded-md border border-input bg-background px-2 text-xs text-foreground"
              >
                {Array.from({ length: 28 }, (_, index) => index + 1).map((day) => (
                  <option key={day} value={day}>
                    {day}
                  </option>
                ))}
              </select>
            </FieldGroup>
          ) : null}
          <p className="text-xs text-muted-foreground">
            {describeCron(cron)} ({timezone})
          </p>
          <FieldGroup>
            <FieldLabel htmlFor="schedule-tz">Timezone</FieldLabel>
            <Input
              id="schedule-tz"
              value={timezone}
              onChange={(event) => setTimezone(event.target.value)}
              className="font-mono"
            />
          </FieldGroup>
          <FieldGroup>
            <FieldLabel htmlFor="schedule-ttl">Answer stays fresh for</FieldLabel>
            <select
              id="schedule-ttl"
              value={ttlSeconds}
              onChange={(event) => setTtlSeconds(Number(event.target.value))}
              className="h-9 rounded-md border border-input bg-background px-2 font-mono text-xs text-foreground"
            >
              {FRESHNESS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </FieldGroup>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose} className={SMALL_BUTTON_CLASSNAME}>
            Cancel
          </Button>
          <Button
            onClick={() => void save()}
            disabled={busy || name.trim().length === 0}
            className={SMALL_BUTTON_CLASSNAME}
          >
            {busy ? "Saving…" : "Save schedule"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function AlertDialog({
  query,
  onClose,
  onSaved,
}: {
  query: ISavedQueryListResponse["savedQueries"][number];
  onClose: () => void;
  onSaved: () => Promise<void>;
}) {
  // An alert watches one saved query's column, and the row it was opened from
  // already said which — so it is named here rather than chosen from a list of
  // one.
  const [name, setName] = useState("");
  const [column, setColumn] = useState("");
  const [operator, setOperator] = useState<(typeof OPERATORS)[number]>(">=");
  const [threshold, setThreshold] = useState("");
  const [problem, setProblem] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function save(): Promise<void> {
    setBusy(true);
    setProblem(null);
    try {
      const input: ICreateAlertRuleRequest = {
        savedQueryId: query.id,
        name,
        column,
        operator,
        threshold: Number(threshold),
      };
      await createAlertRule(input);
      await onSaved();
    } catch (caught) {
      setProblem(messageFor(caught, "That alert was not saved."));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open onOpenChange={(open) => (open ? undefined : onClose())}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>New alert</DialogTitle>
        </DialogHeader>
        <div className="flex flex-col gap-4">
          {problem !== null ? <Alert>{problem}</Alert> : null}
          <p className="text-xs text-muted-foreground">
            Watching a column of{" "}
            <span className="font-mono text-fg">{query.name}</span>
          </p>
          <FieldGroup>
            <FieldLabel htmlFor="alert-name">Name</FieldLabel>
            <Input
              id="alert-name"
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="Events piling up"
            />
          </FieldGroup>
          <div className="grid grid-cols-[1fr_auto_1fr] items-end gap-2">
            <FieldGroup>
              <FieldLabel htmlFor="alert-column">Column</FieldLabel>
              <Input
                id="alert-column"
                value={column}
                onChange={(event) => setColumn(event.target.value)}
                placeholder="events"
                className="font-mono"
              />
            </FieldGroup>
            <FieldGroup>
              <FieldLabel htmlFor="alert-operator">Is</FieldLabel>
              <select
                id="alert-operator"
                value={operator}
                onChange={(event) =>
                  setOperator(event.target.value as (typeof OPERATORS)[number])
                }
                className="h-9 rounded-md border border-input bg-background px-2 font-mono text-xs text-foreground"
              >
                {OPERATORS.map((option) => (
                  <option key={option} value={option}>
                    {option}
                  </option>
                ))}
              </select>
            </FieldGroup>
            <FieldGroup>
              <FieldLabel htmlFor="alert-threshold">Than</FieldLabel>
              <Input
                id="alert-threshold"
                value={threshold}
                onChange={(event) => setThreshold(event.target.value)}
                placeholder="10"
                className="font-mono"
              />
            </FieldGroup>
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose} className={SMALL_BUTTON_CLASSNAME}>
            Cancel
          </Button>
          <Button
            onClick={() => void save()}
            disabled={
              busy ||
              name.trim().length === 0 ||
              column.trim().length === 0 ||
              threshold.trim().length === 0
            }
            className={SMALL_BUTTON_CLASSNAME}
          >
            {busy ? "Saving…" : "Save alert"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
