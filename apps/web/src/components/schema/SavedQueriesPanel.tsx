import { useEffect, useRef, useState } from "react";
import { IconBookmark, IconHistory, IconTrash } from "@tabler/icons-react";
import type { ISavedQuery } from "@heptadec/api/saved-query-contracts";
import {
  createSavedQuery,
  deleteSavedQuery,
  listSavedQueries,
  messageFor,
} from "../../api";
import { Alert, EmptyState } from "../ui/feedback";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { TABLE_ROW_CLASSNAME } from "../workspace";
import { VersionHistory } from "./VersionHistory";

export function SavedQueriesPanel({
  sourceId,
  activeSql,
  reloadToken,
  onLoad,
}: {
  sourceId: string;
  activeSql: string;
  reloadToken?: number;
  onLoad: (sql: string) => void;
}) {
  const [queries, setQueries] = useState<ISavedQuery[] | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [saving, setSaving] = useState(false);
  const [historyFor, setHistoryFor] = useState<string | null>(null);

  const currentSource = useRef(sourceId);

  useEffect(() => {
    currentSource.current = sourceId;
    setQueries(null);
    reload(sourceId);
  }, [sourceId, reloadToken]);

  async function reload(forSource: string): Promise<void> {
    try {
      const found = await listSavedQueries(forSource);
      if (currentSource.current === forSource) {
        setQueries(found.savedQueries);
      }
    } catch (caught) {
      if (currentSource.current === forSource) {
        setProblem(messageFor(caught, "Saved queries could not be read."));
      }
    }
  }

  async function save(): Promise<void> {
    setSaving(true);
    setProblem(null);
    try {
      const { savedQuery } = await createSavedQuery(sourceId, {
        name,
        sql: activeSql,
      });
      setQueries((current) => [...(current ?? []), savedQuery]);
      setName("");
    } catch (caught) {
      setProblem(messageFor(caught, "That query could not be saved."));
    } finally {
      setSaving(false);
    }
  }

  async function remove(query: ISavedQuery): Promise<void> {
    try {
      await deleteSavedQuery(query.id);
      setQueries((current) =>
        (current ?? []).filter((entry) => entry.id !== query.id),
      );
    } catch (caught) {
      setProblem(messageFor(caught, "That query could not be deleted."));
    }
  }

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
          onClick={() => void save()}
          disabled={saving || name.trim().length === 0 || activeSql.trim().length === 0}
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
                onClick={() => void remove(query)}
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
          onRestored={() => void reload(sourceId)}
          onClose={() => setHistoryFor(null)}
        />
      ) : null}
    </aside>
  );
}
