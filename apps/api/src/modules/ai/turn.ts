import type { Context } from "hono";
import { streamSSE } from "hono/streaming";
import type { IAuthVars } from "../../common/middleware/require-session";

export interface ITurn {
  readonly startedAt: number;
  status(message: string): Promise<void>;
  delta(text: string): Promise<void>;
  skipped(titles: string[]): Promise<void>;
  problem(message: string): Promise<void>;
  done(payload: unknown): Promise<void>;
}

export interface ITurnFailure {
  readonly log: string;
  readonly message: string;
}

export function runTurn(
  c: Context<IAuthVars>,
  failure: ITurnFailure,
  work: (turn: ITurn) => Promise<void>,
): Response | Promise<Response> {
  const startedAt = Date.now();

  return streamSSE(c, async (stream) => {
    stream.onAbort(() => {
      void stream.abort();
    });

    const write = (event: string, payload: unknown) =>
      stream.writeSSE({ event, data: JSON.stringify(payload) });

    const turn: ITurn = {
      startedAt,
      status: (message) => write("status", { message }),
      delta: (text) => write("delta", { text }),
      skipped: (titles) => write("skipped", { titles }),
      problem: (message) => write("problem", { message }),
      done: (payload) => write("done", payload),
    };

    try {
      await work(turn);
    } catch (caught) {
      console.error(failure.log, caught);
      await turn.problem(failure.message);
    }
  });
}
