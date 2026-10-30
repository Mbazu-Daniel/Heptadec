import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { IconBookmark, IconHistory, IconTrash } from "@tabler/icons-react";
import type { ISavedQuery } from "@heptadec/api/saved-query-contracts";
import {
  createSavedQuery,
  deleteSavedQuery,
  listSavedQueries,
  messageFor,
} from "../../api";
import { dataSourceKeys } from "../../lib/queries";
import { Alert, EmptyState } from "../ui/feedback";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { TABLE_ROW_CLASSNAME } from "../workspace";
import { VersionHistory } from "./VersionHistory";

export function SavedQueriesPanel({
  sourceId,
  activeSql,
  onLoad,
}: {
  sourceId: string;
  activeSql: string;
  onLoad: (sql: string) => void;
}) {
  const queryClient = useQueryClient();
  const savedQueriesKey = dataSourceKeys.savedQueries(sourceId);
  const queriesQuery = useQuery({
    queryKey: savedQueriesKey,
    queryFn: () => listSavedQueries(sourceId),
  });
  const queries = queriesQuery.data?.savedQueries ?? null;

  const [name, setName] = useState("");
  const [historyFor, setHistoryFor] = useState<string | null>(null);

  const save = useMutation({
    mutationFn: () =>
      createSavedQuery(sourceId, { name, sql: activeSql }),
    onSuccess: () => {
      setName("");
      queryClient.invalidateQueries({ queryKey: savedQueriesKey });
    },
  });
  const remove = useMutation({
    mutationFn: (query: ISavedQuery) => deleteSavedQuery(query.id),
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: savedQueriesKey }),
  });

  const problem =
    queriesQuery.isError
      ? messageFor(queriesQuery.error, "Saved queries could not be read.")
      : save.isError
        ? messageFor(save.error, "That query could not be saved.")
        : remove.isError
          ? messageFor(remove.error, "That query could not be deleted.")
          : null;

  return (
    <aside className="flex w-full flex-col gap-3 overflow-auto bg-card/40 px-4 py-4">
      <h2 className="text-[12px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
        Saved queries
      </h2>

      <div className="flex flex-col gap-2">
        <Input
          value={name}
          onChange={(event) => setName(event.target.value)}
          placeholder="Name this query"
          aria-label="Saved query name"
          className="h-8 px-2 text-xs"
        />
        <Button
          onClick={() => save.mutate()}
          disabled={
            save.isPending || name.trim().length === 0 || activeSql.trim().length === 0
          }
          className="h-8 gap-1.5 text-xs"
        >
          <IconBookmark size={14} />
          Save current statement
        </Button>
      </div>

      {problem !== null ? <Alert>{problem}</Alert> : null}

      {queries === null ? (
        <p className="font-mono text-[11px] text-muted-foreground">Loading…</p>
      ) : queries.length === 0 ? (
        <EmptyState
          title="No saved queries"
          body="Name a statement above to save it."
        />
      ) : (
        <ul className="flex flex-col gap-1">
          {queries.map((query) => (
            <li
              key={query.id}
              className={`flex items-center gap-1.5 px-2 py-1.5 ${TABLE_ROW_CLASSNAME}`}
            >
              <button
                type="button"
                onClick={() => onLoad(query.sql)}
                title={query.sql}
                className="min-w-0 flex-1 text-left text-xs text-fg hover:text-cyan"
              >
                <span className="block truncate font-medium">{query.name}</span>
              </button>
              <Button
                variant="ghost"
                onClick={() => setHistoryFor(query.id)}
                className="h-7 w-7 shrink-0 p-0 text-muted-foreground hover:text-fg"
                title={`History of ${query.name}`}
              >
                <IconHistory size={14} />
              </Button>
              <Button
                variant="ghost"
                onClick={() => remove.mutate(query)}
                className="h-7 w-7 shrink-0 p-0 text-red"
                title={`Delete ${query.name}`}
              >
                <IconTrash size={14} />
              </Button>
            </li>
          ))}
        </ul>
      )}

      {historyFor !== null ? (
        <VersionHistory
          savedQueryId={historyFor}
          onRestored={() =>
            queryClient.invalidateQueries({ queryKey: savedQueriesKey })
          }
          onClose={() => setHistoryFor(null)}
        />
      ) : null}
    </aside>
  );
}
