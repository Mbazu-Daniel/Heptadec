import { useCallback, useEffect, useState } from "react";
import { IconTrash } from "@tabler/icons-react";
import type {
  IAlertRule,
  ICreateAlertRuleRequest,
} from "@heptadec/api/alert-contracts";
import type { ISavedQueryListResponse } from "@heptadec/api/saved-query-contracts";
import {
  createAlertRule,
  deleteAlertRule,
  listAlertDeliveries,
  listAlertRules,
  listAllSavedQueries,
  listNotificationChannels,
  messageFor,
} from "../api";
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

const OPERATORS = [">", ">=", "<", "<=", "="] as const;

export function Alerts() {
  const [rules, setRules] = useState<IAlertRule[] | null>(null);
  const [queries, setQueries] = useState<ISavedQueryListResponse["savedQueries"]>([]);
  const [log, setLog] = useState<Awaited<ReturnType<typeof listAlertDeliveries>> | null>(
    null,
  );
  const [problem, setProblem] = useState<string | null>(null);
  const [channelCount, setChannelCount] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [creating, setCreating] = useState(false);

  const reload = useCallback(async () => {
    setProblem(null);
    try {
      const [loaded, saved, deliveries, connected] = await Promise.all([
        listAlertRules(),
        listAllSavedQueries(),
        listAlertDeliveries(),
        listNotificationChannels(),
      ]);
      setRules(loaded.alertRules);
      setQueries(saved.savedQueries);
      setLog(deliveries);
      setChannelCount(connected.notificationChannels.length);
    } catch (caught) {
      setProblem(messageFor(caught, "The alerts could not be loaded."));
    }
  }, []);

  useEffect(() => {
    void reload();
  }, [reload]);

  async function remove(rule: IAlertRule): Promise<void> {
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

  return (
    <div className={VIEW_CLASSNAME}>
      <div className="flex h-11 shrink-0 items-center gap-2 border-b border-border px-4">
        <span className="ml-auto font-mono text-[10px] text-muted-foreground">
          {rules === null ? "" : `${rules.length} rules`}
        </span>
        <Button
          onClick={() => setCreating(true)}
          className="h-7 gap-1.5 border-transparent bg-cyan px-3 text-xs font-semibold text-black hover:bg-cyan/85 hover:text-black"
        >
          New alert
        </Button>
      </div>

      <Workspace
        view={
          <>
            {problem !== null ? <Alert className="mb-3">{problem}</Alert> : null}
            {rules === null ? (
              <p className="py-8 text-center font-mono text-xs text-muted-foreground">
                Loading the alerts.
              </p>
            ) : (
              <>
                {rules.length === 0 ? (
                  <EmptyState
                    title="No alerts yet"
                    body="Watch a column of a saved query: when a scheduled run breaches the threshold, the alert goes to every notification channel you have connected."
                  />
                ) : (
                  <table className={TABLE_CLASSNAME} aria-label="Alert rules">
                    <thead>
                      <tr>
                        <th scope="col" className={TABLE_HEAD_CLASSNAME}>
                          Alert
                        </th>
                        <th scope="col" className={TABLE_HEAD_CLASSNAME}>
                          Query
                        </th>
                        <th scope="col" className={TABLE_HEAD_CLASSNAME}>
                          Fires when
                        </th>
                        <th scope="col" className={TABLE_HEAD_CLASSNAME}>
                          Goes to
                        </th>
                        <th scope="col" className={TABLE_HEAD_CLASSNAME}>
                          <span className="sr-only">Remove</span>
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {rules.map((rule) => (
                        <tr key={rule.id} className={TABLE_ROW_CLASSNAME}>
                          <td className={`${TABLE_CELL_CLASSNAME} font-medium`}>
                            {rule.name}
                          </td>
                          <td
                            className={`${TABLE_CELL_CLASSNAME} truncate font-mono text-muted-foreground`}
                          >
                            {nameOfQuery(queries, rule.savedQueryId)}
                          </td>
                          <td className={`${TABLE_CELL_CLASSNAME} font-mono text-xs`}>
                            {rule.column} {rule.operator} {rule.threshold}
                          </td>
                          <td
                            className={`${TABLE_CELL_CLASSNAME} text-xs text-muted-foreground`}
                          >
                            {channelCount === null ? null : `${channelCount} connected channels`}
                          </td>
                          <td className={TABLE_CELL_CLASSNAME}>
                            <Button
                              variant="ghost"
                              disabled={busy}
                              onClick={() => void remove(rule)}
                              className={`${SMALL_BUTTON_CLASSNAME} text-red`}
                              title={`Remove ${rule.name}`}
                            >
                              <IconTrash size={14} />
                            </Button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}

                {log !== null && log.alertDeliveries.length > 0 ? (
                  <div className="mt-10">
                    <h2 className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                      Delivery log
                    </h2>
                    <table
                      className={`${TABLE_CLASSNAME} mt-2`}
                      aria-label="Alert deliveries"
                    >
                      <thead>
                        <tr>
                          <th scope="col" className={TABLE_HEAD_CLASSNAME}>
                            When
                          </th>
                          <th scope="col" className={TABLE_HEAD_CLASSNAME}>
                            Alert
                          </th>
                          <th scope="col" className={TABLE_HEAD_CLASSNAME}>
                            Channel
                          </th>
                          <th scope="col" className={TABLE_HEAD_CLASSNAME}>
                            Status
                          </th>
                          <th scope="col" className={TABLE_HEAD_CLASSNAME}>
                            Detail
                          </th>
                        </tr>
                      </thead>
                      <tbody>
                        {log.alertDeliveries.map((delivery) => (
                          <tr key={delivery.id} className={TABLE_ROW_CLASSNAME}>
                            <td
                              className={`${TABLE_CELL_CLASSNAME} font-mono text-xs text-muted-foreground`}
                            >
                              {new Date(delivery.createdAt).toLocaleString()}
                            </td>
                            <td className={TABLE_CELL_CLASSNAME}>
                              {nameOfRule(rules, delivery.alertRuleId)}
                            </td>
                            <td
                              className={`${TABLE_CELL_CLASSNAME} font-mono text-xs text-muted-foreground`}
                            >
                              {delivery.channel}
                            </td>
                            <td
                              className={`${TABLE_CELL_CLASSNAME} font-mono text-xs ${
                                delivery.status === "sent" ? "text-cyan" : "text-red"
                              }`}
                            >
                              {delivery.status}
                            </td>
                            <td className={TABLE_CELL_CLASSNAME}>
                              <span className="block max-w-[420px] truncate text-xs text-muted-foreground">
                                {delivery.error ?? delivery.message}
                              </span>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : null}
              </>
            )}
          </>
        }
      />

      {creating ? (
        <AlertDialog
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

function nameOfQuery(queries: ISavedQueryListResponse["savedQueries"], id: string): string {
  return queries.find((query) => query.id === id)?.name ?? "that query";
}

function nameOfRule(rules: IAlertRule[], id: string): string {
  return rules.find((rule) => rule.id === id)?.name ?? "removed alert";
}

function AlertDialog({
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
        savedQueryId,
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
          <FieldGroup>
            <FieldLabel htmlFor="alert-query">Query</FieldLabel>
            <select
              id="alert-query"
              value={savedQueryId}
              onChange={(event) => setSavedQueryId(event.target.value)}
              className="h-9 rounded-md border border-input bg-background px-2 font-mono text-xs text-foreground"
            >
              {queries.map((query) => (
                <option key={query.id} value={query.id}>
                  {query.name}
                </option>
              ))}
            </select>
          </FieldGroup>
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
              savedQueryId === "" ||
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
