import { useCallback, useEffect, useState } from "react";
import { IconTrash } from "@tabler/icons-react";
import type {
  ICreateScheduledJobRequest,
  IScheduledJob,
} from "@heptadec/api/scheduler-contracts";
import type { ISavedQueryListResponse } from "@heptadec/api/saved-query-contracts";
import type { IDataSource } from "@heptadec/api/data-source-contracts";
import {
  createSavedQuery,
  createScheduledJob,
  deleteScheduledJob,
  listAllSavedQueries,
  listDataSources,
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
import {
  SMALL_BUTTON_CLASSNAME,
  TABLE_CELL_CLASSNAME,
  TABLE_CLASSNAME,
  TABLE_HEAD_CLASSNAME,
  TABLE_ROW_CLASSNAME,
  VIEW_CLASSNAME,
  Workspace,
} from "./workspace";

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

function freshness(seconds: number): string {
  return (
    FRESHNESS.find((option) => option.value === seconds)?.label ?? `${seconds}s`
  );
}

export function Schedules() {
  const [jobs, setJobs] = useState<IScheduledJob[] | null>(null);
  const [queries, setQueries] = useState<ISavedQueryListResponse["savedQueries"]>([]);
  const [problem, setProblem] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [creating, setCreating] = useState(false);

  const reload = useCallback(async () => {
    setProblem(null);
    try {
      const [schedules, saved] = await Promise.all([
        listScheduledJobs(),
        listAllSavedQueries(),
      ]);
      setJobs(schedules.scheduledJobs);
      setQueries(saved.savedQueries);
    } catch (caught) {
      setProblem(messageFor(caught, "The schedules could not be loaded."));
    }
  }, []);

  useEffect(() => {
    void reload();
  }, [reload]);

  async function remove(job: IScheduledJob): Promise<void> {
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

  return (
    <div className={VIEW_CLASSNAME}>
      <div className="flex h-11 shrink-0 items-center gap-2 border-b border-border px-4">
        <span className="ml-auto font-mono text-[10px] text-muted-foreground">
          {jobs === null ? "" : `${jobs.length} scheduled`}
        </span>
        <Button
          onClick={() => setCreating(true)}
          className="h-7 gap-1.5 border-transparent bg-cyan px-3 text-xs font-semibold text-black hover:bg-cyan/85 hover:text-black"
        >
          New schedule
        </Button>
      </div>

      <Workspace
        view={
          <>
            {problem !== null ? <Alert className="mb-3">{problem}</Alert> : null}
            {jobs === null ? (
              <p className="py-8 text-center font-mono text-xs text-muted-foreground">
                Loading the schedules.
              </p>
            ) : jobs.length === 0 ? (
              <EmptyState
                title="Nothing is scheduled yet"
                body="Put a saved query on a timer: its result is cached, and every dashboard reading it stays current."
              />
            ) : (
              <table className={TABLE_CLASSNAME} aria-label="Schedules">
                <thead>
                  <tr>
                    <th scope="col" className={TABLE_HEAD_CLASSNAME}>
                      Schedule
                    </th>
                    <th scope="col" className={TABLE_HEAD_CLASSNAME}>
                      Query
                    </th>
                    <th scope="col" className={TABLE_HEAD_CLASSNAME}>
                      When
                    </th>
                    <th scope="col" className={TABLE_HEAD_CLASSNAME}>
                      Fresh for
                    </th>
                    <th scope="col" className={TABLE_HEAD_CLASSNAME}>
                      Next run
                    </th>
                    <th scope="col" className={TABLE_HEAD_CLASSNAME}>
                      Last run
                    </th>
                    <th scope="col" className={TABLE_HEAD_CLASSNAME}>
                      <span className="sr-only">Remove</span>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {jobs.map((job) => (
                    <tr key={job.id} className={TABLE_ROW_CLASSNAME}>
                      <td className={`${TABLE_CELL_CLASSNAME} font-medium`}>
                        {job.name}
                      </td>
                      <td
                        className={`${TABLE_CELL_CLASSNAME} truncate font-mono text-muted-foreground`}
                      >
                        {job.savedQueryName}
                      </td>
                      <td
                        className={`${TABLE_CELL_CLASSNAME} text-xs`}
                        title={job.cron}
                      >
                        {describeCron(job.cron)}
                        <span className="ml-2 font-mono text-[10px] text-muted-foreground">
                          {job.timezone}
                        </span>
                      </td>
                      <td
                        className={`${TABLE_CELL_CLASSNAME} text-xs text-muted-foreground`}
                      >
                        {freshness(job.ttlSeconds)}
                      </td>
                      <td className={`${TABLE_CELL_CLASSNAME} font-mono text-xs`}>
                        {when(job.nextRunAt)}
                      </td>
                      <td
                        className={`${TABLE_CELL_CLASSNAME} font-mono text-xs text-muted-foreground`}
                      >
                        {when(job.lastRunAt)}
                      </td>
                      <td className={TABLE_CELL_CLASSNAME}>
                        <Button
                          variant="ghost"
                          disabled={busy}
                          onClick={() => void remove(job)}
                          className={`${SMALL_BUTTON_CLASSNAME} text-red`}
                          title={`Remove ${job.name}`}
                        >
                          <IconTrash size={14} />
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </>
        }
      />

      {creating ? (
        <ScheduleDialog
          queries={queries}
          onClose={() => setCreating(false)}
          onSaved={async () => {
            setCreating(false);
            await reload();
          }}
        />
      ) : null}
    </div>
  );
}

function ScheduleDialog({
  queries,
  onClose,
  onSaved,
}: {
  queries: ISavedQueryListResponse["savedQueries"];
  onClose: () => void;
  onSaved: () => Promise<void>;
}) {
  const [savedQueryId, setSavedQueryId] = useState(queries[0]?.id ?? "");
  const [name, setName] = useState("");
  const [when, setWhen] = useState<IWhen>(DEFAULT_WHEN);
  const [timezone, setTimezone] = useState(
    Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC",
  );
  const [ttlSeconds, setTtlSeconds] = useState(3600);
  const [problem, setProblem] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [writing, setWriting] = useState(false);
  const [sources, setSources] = useState<IDataSource[]>([]);
  const [sourceId, setSourceId] = useState("");
  const [queryName, setQueryName] = useState("");
  const [querySql, setQuerySql] = useState("");

  useEffect(() => {
    void listDataSources().then(
      (found) => {
        setSources(found.dataSources);
        setSourceId((current) => current || (found.dataSources[0]?.id ?? ""));
      },
      () => undefined,
    );
  }, []);

  const cron = buildCron(when);

  async function writeQuery(): Promise<void> {
    setWriting(true);
    setProblem(null);
    try {
      const created = await createSavedQuery(sourceId, {
        name: queryName,
        sql: querySql,
      });
      setSavedQueryId(created.savedQuery.id);
      if (name.trim() === "") {
        setName(created.savedQuery.name);
      }
    } catch (caught) {
      setProblem(messageFor(caught, "That query was not saved."));
    } finally {
      setWriting(false);
    }
  }

  async function save(): Promise<void> {
    setBusy(true);
    setProblem(null);
    try {
      const input: ICreateScheduledJobRequest = {
        savedQueryId,
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
          <FieldGroup>
            <FieldLabel htmlFor="schedule-query">Query</FieldLabel>
            {queries.length === 0 && savedQueryId === "" ? (
              <p className="text-xs text-muted-foreground">
                You have no saved queries yet. Write one below and it will be
                used for this schedule.
              </p>
            ) : null}
            <select
              id="schedule-query"
              value={savedQueryId}
              onChange={(event) => setSavedQueryId(event.target.value)}
              className="h-9 rounded-md border border-input bg-background px-2 font-mono text-xs text-foreground"
            >
              <option value="">Choose a query</option>
              {queries.map((query) => (
                <option key={query.id} value={query.id}>
                  {query.name}
                </option>
              ))}
            </select>
          </FieldGroup>

          <details className="rounded-md border border-border px-3 py-2">
            <summary className="cursor-pointer text-xs text-muted-foreground">
              {savedQueryId === "" ? "Add a query" : "Add a different query"}
            </summary>
            <div className="flex flex-col gap-3 pt-3">
              <FieldGroup>
                <FieldLabel htmlFor="new-query-source">Data source</FieldLabel>
                <select
                  id="new-query-source"
                  value={sourceId}
                  onChange={(event) => setSourceId(event.target.value)}
                  className="h-9 rounded-md border border-input bg-background px-2 text-xs text-foreground"
                >
                  {sources.map((entry) => (
                    <option key={entry.id} value={entry.id}>
                      {entry.name}
                    </option>
                  ))}
                </select>
              </FieldGroup>
              <FieldGroup>
                <FieldLabel htmlFor="new-query-name">Query name</FieldLabel>
                <Input
                  id="new-query-name"
                  value={queryName}
                  onChange={(event) => setQueryName(event.target.value)}
                  placeholder="Events by region"
                />
              </FieldGroup>
              <FieldGroup>
                <FieldLabel htmlFor="new-query-sql">Statement</FieldLabel>
                <textarea
                  id="new-query-sql"
                  value={querySql}
                  onChange={(event) => setQuerySql(event.target.value)}
                  rows={4}
                  placeholder="SELECT region, count(*) AS events FROM events GROUP BY region"
                  className="w-full rounded-md border border-input bg-background p-2 font-mono text-xs text-foreground"
                />
              </FieldGroup>
              <div>
                <Button
                  variant="ghost"
                  onClick={() => void writeQuery()}
                  disabled={writing || sourceId === "" || queryName.trim() === "" || querySql.trim() === ""}
                  className={SMALL_BUTTON_CLASSNAME}
                >
                  {writing ? "Saving…" : "Save query and use it"}
                </Button>
              </div>
            </div>
          </details>

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
            disabled={busy || savedQueryId === "" || name.trim().length === 0}
            className={SMALL_BUTTON_CLASSNAME}
          >
            {busy ? "Saving…" : "Save schedule"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
