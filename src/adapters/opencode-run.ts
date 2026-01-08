import type { AgentAdapter, AgentSession, ExecuteOptions, AdapterEvent } from "./types";
import { spawnPty } from "../pty/spawn";

async function createPtySession(
  pty: ReturnType<typeof spawnPty>,
  signal: AbortSignal
): Promise<AgentSession> {
  const pendingEvents: AdapterEvent[] = [];
  let resolveNext: ((value: IteratorResult<AdapterEvent>) => void) | null = null;
  let done = false;

  const pushEvent = (event: AdapterEvent) => {
    if (done) return;
    if (resolveNext) {
      resolveNext({ value: event, done: false });
      resolveNext = null;
    } else {
      pendingEvents.push(event);
    }
  };

  pty.onData((data) => {
    pushEvent({ type: "output", data });
  });

  const exitPromise = new Promise<{ exitCode?: number }>((resolve) => {
    pty.onExit(({ exitCode }) => {
      pushEvent({ type: "exit", code: exitCode });
      done = true;
      if (resolveNext) {
        resolveNext({ value: undefined as unknown as AdapterEvent, done: true });
      }
      resolve({ exitCode });
    });
  });

  const onAbort = () => {
    pty.cleanup();
  };
  signal.addEventListener("abort", onAbort, { once: true });

  async function* events(): AsyncGenerator<AdapterEvent> {
    try {
      while (!done) {
        if (pendingEvents.length > 0) {
          yield pendingEvents.shift()!;
        } else {
          const result = await new Promise<IteratorResult<AdapterEvent>>((resolve) => {
            resolveNext = resolve;
          });
          if (result.done) break;
          yield result.value;
        }
      }
    } finally {
      signal.removeEventListener("abort", onAbort);
      pty.cleanup();
    }
  }

  return {
    events: events(),
    send: (input) => pty.write(input + "\n"),
    abort: () => pty.kill(),
    done: exitPromise,
  };
}

export class OpencodeRunAdapter implements AgentAdapter {
  readonly name = "opencode-run";
  readonly displayName = "OpenCode (Headless)";
  readonly mode = "pty" as const;

  async isAvailable(): Promise<boolean> {
    try {
      const proc = Bun.spawn(["opencode", "--version"], {
        stdout: "ignore",
        stderr: "ignore",
      });
      const exitCode = await proc.exited;
      return exitCode === 0;
    } catch {
      return false;
    }
  }

  async execute(options: ExecuteOptions): Promise<AgentSession> {
    const { prompt, model, cwd, signal, cols, rows } = options;

    const args = ["opencode", "run", "--print"];
    if (model) {
      args.push("--model", model);
    }
    args.push(prompt);

    const pty = spawnPty(args, { cols, rows, cwd });
    const controller = new AbortController();
    const forwardAbort = () => controller.abort();
    signal.addEventListener("abort", forwardAbort, { once: true });

    const session = await createPtySession(pty, controller.signal);

    return {
      ...session,
      abort: () => {
        controller.abort();
        pty.kill();
      },
      done: session.done.finally(() => {
        signal.removeEventListener("abort", forwardAbort);
      }),
    };
  }
}
