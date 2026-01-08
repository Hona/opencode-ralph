import { createHeadlessOutput } from "./cli-output";
import { runLoop as defaultRunLoop } from "./loop";
import { saveState, type LoopOptions, type PersistedState } from "./state";

export type HeadlessRunOptions = {
  loopOptions: LoopOptions;
  persistedState: PersistedState;
  format: string;
  timestamps: boolean;
  maxIterations?: number;
  maxTime?: number;
};

export async function runHeadlessMode(
  options: HeadlessRunOptions,
  runLoop: typeof defaultRunLoop = defaultRunLoop,
): Promise<number> {
  const { loopOptions, persistedState, format, timestamps, maxIterations, maxTime } = options;
  const abortController = new AbortController();
  const output = createHeadlessOutput({ format, timestamps });
  output.emitStart();

  let exitCode = 0;
  let completed = false;
  let limitTimer: ReturnType<typeof setTimeout> | undefined;

  const requestAbort = (code: number, message?: string) => {
    if (exitCode === 0) {
      exitCode = code;
    }
    if (message) {
      output.emit({ type: "error", message });
    }
    abortController.abort();
  };

  if (typeof maxTime === "number" && maxTime > 0) {
    limitTimer = setTimeout(() => {
      requestAbort(3, `max-time reached (${maxTime}s)`);
    }, maxTime * 1000);
  }

  const callbacks = output.callbacks;

  const headlessCallbacks = {
    ...callbacks,
    onIterationStart: (iteration: number) => {
      callbacks.onIterationStart(iteration);
      if (typeof maxIterations === "number" && maxIterations > 0 && iteration > maxIterations) {
        requestAbort(3, `max-iterations reached (${maxIterations})`);
      }
    },
    onIterationComplete: (iteration: number, duration: number, commits: number) => {
      callbacks.onIterationComplete(iteration, duration, commits);
      persistedState.iterationTimes.push(duration);
      void saveState(persistedState);
    },
    onPause: () => {
      callbacks.onPause();
      requestAbort(2, "Paused in headless mode");
    },
    onComplete: () => {
      completed = true;
      callbacks.onComplete();
    },
    onRawOutput: (data: string) => {
      output.emit({ type: "output", data });
    },
  };

  const onSigint = () => requestAbort(2, "Interrupted (SIGINT)");
  const onSigterm = () => requestAbort(2, "Interrupted (SIGTERM)");
  process.on("SIGINT", onSigint);
  process.on("SIGTERM", onSigterm);

  try {
    await runLoop(loopOptions, persistedState, headlessCallbacks, abortController.signal);
    if (!completed && exitCode === 0 && abortController.signal.aborted) {
      exitCode = 2;
    }
  } catch {
    if (exitCode === 0) {
      exitCode = 1;
    }
  } finally {
    if (limitTimer) clearTimeout(limitTimer);
    process.off("SIGINT", onSigint);
    process.off("SIGTERM", onSigterm);
    output.finalize(exitCode);
  }

  return exitCode;
}
