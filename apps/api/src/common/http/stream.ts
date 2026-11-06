import type { Context } from "hono";
import { streamSSE } from "hono/streaming";
import type { IAuthVars } from "../middleware/require-session";

export interface IStreamEvents {
  readonly status: string;
  readonly delta: string;
  readonly skipped: string;
  readonly problem: string;
  readonly done: string;
}

export interface IStreamTurn {
  readonly startedAt: number;
  status(message: string): Promise<void>;
  delta(text: string): Promise<void>;
  skipped(titles: string[]): Promise<void>;
  problem(message: string): Promise<void>;
  done(payload: unknown): Promise<void>;
}

export interface IStreamFailure {
  readonly log: string;
  readonly message: string;
}

export function streamTurn(
  c: Context<IAuthVars>,
  events: IStreamEvents,
  failure: IStreamFailure,
  work: (turn: IStreamTurn) => Promise<void>,
): Response | Promise<Response> {
  const startedAt = Date.now();

  return streamSSE(c, async (stream) => {
    stream.onAbort(() => {
      void stream.abort();
    });

    const write = (event: string, payload: unknown) =>
      stream.writeSSE({ event, data: JSON.stringify(payload) });

    const turn: IStreamTurn = {
      startedAt,
      status: (message) => write(events.status, { message }),
      delta: (text) => write(events.delta, { text }),
      skipped: (titles) => write(events.skipped, { titles }),
      problem: (message) => write(events.problem, { message }),
      done: (payload) => write(events.done, payload),
    };

    try {
      await work(turn);
    } catch (caught) {
      console.error(failure.log, caught);
      await turn.problem(failure.message);
    }
  });
}
