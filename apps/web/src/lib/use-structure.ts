import { useCallback, useEffect, useState } from "react";
import type { IStructureResponse } from "@heptadec/api/schema-contracts";
import { fetchStructure, messageFor, refreshStructure } from "../api";

/**
 * How long a first read of a source is worth waiting for.
 *
 * The app reads a source's structure in the background, so the screen opened
 * right after saving one meets a structure that is still on its way. Asking again
 * for a bounded while beats telling the user there is nothing here.
 */
const POLLS = 6;

const POLL_MS = 2_500;

export interface IStructureView {
  /** What the app can say about this source's structure, or nothing yet. */
  structure: IStructureResponse | null;
  /** The first read is still happening and there is nothing to show for it. */
  loading: boolean;
  /** The read the app was asked to do could not be done. */
  problem: string | null;
  refreshing: boolean;
  /** Say the structure is wanted again, now, rather than at the next tick. */
  refresh: () => Promise<void>;
}

/** Nothing stored and a sync on its way is the one answer worth asking again for. */
function isWaiting(structure: IStructureResponse): boolean {
  return (
    structure.syncing &&
    structure.objects.length === 0 &&
    structure.tables.length === 0
  );
}

export function useStructure(sourceId: string): IStructureView {
  const [shown, setShown] = useState<{
    id: string;
    structure: IStructureResponse;
  } | null>(null);
  const [waiting, setWaiting] = useState(true);
  const [problem, setProblem] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [cycle, setCycle] = useState(0);

  useEffect(() => {
    let live = true;
    setWaiting(true);
    setProblem(null);
    void (async () => {
      for (let attempt = 0; attempt < POLLS; attempt += 1) {
        try {
          const found = await fetchStructure(sourceId);
          if (!live) {
            return;
          }
          setShown({ id: sourceId, structure: found });
          if (!isWaiting(found)) {
            setWaiting(false);
            return;
          }
        } catch (caught: unknown) {
          if (live) {
            setProblem(messageFor(caught, "That structure could not be read."));
            setWaiting(false);
          }
          return;
        }
        await new Promise((resolve) => setTimeout(resolve, POLL_MS));
      }
      if (live) {
        setWaiting(false);
      }
    })();
    return () => {
      live = false;
    };
  }, [sourceId, cycle]);

  const refresh = useCallback(async (): Promise<void> => {
    setRefreshing(true);
    try {
      await refreshStructure(sourceId);
      setCycle((count) => count + 1);
    } catch (caught: unknown) {
      setProblem(messageFor(caught, "That structure could not be read."));
    } finally {
      setRefreshing(false);
    }
  }, [sourceId]);

  return {
    structure: shown?.id === sourceId ? shown.structure : null,
    loading: waiting,
    problem,
    refreshing,
    refresh,
  };
}
