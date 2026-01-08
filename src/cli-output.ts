import type { LoopCallbacks } from "./loop";
import type { ToolEvent } from "./state";
import { createJsonFormatter } from "./formats/json";
import { createJsonlFormatter } from "./formats/jsonl";
import { createTextFormatter } from "./formats/text";

export type HeadlessEvent =
  | { type: "start"; timestamp?: number }
  | { type: "iteration_start"; iteration: number; timestamp?: number }
  | { type: "iteration_end"; iteration: number; durationMs: number; commits: number; timestamp?: number }
  | { type: "tool"; iteration: number; name: string; title: string; detail?: string; timestamp?: number }
  | { type: "reasoning"; iteration: number; text: string; timestamp?: number }
  | { type: "output"; data: string; timestamp?: number }
  | { type: "progress"; done: number; total: number; timestamp?: number }
  | { type: "stats"; commits: number; linesAdded: number; linesRemoved: number; timestamp?: number }
  | { type: "pause"; timestamp?: number }
  | { type: "resume"; timestamp?: number }
  | { type: "idle"; isIdle: boolean; timestamp?: number }
  | { type: "error"; message: string; timestamp?: number }
  | { type: "complete"; timestamp?: number };

export type HeadlessSummary = {
  exitCode: number;
  durationMs: number;
  tasksComplete: number;
  totalTasks: number;
  commits: number;
  linesAdded: number;
  linesRemoved: number;
};

export type HeadlessFormatter = {
  emit: (event: HeadlessEvent) => void;
  finalize: (summary: HeadlessSummary) => void;
};

export type HeadlessOutput = {
  callbacks: LoopCallbacks;
  emit: (event: HeadlessEvent) => void;
  emitStart: () => void;
  finalize: (exitCode: number) => void;
};

export function createHeadlessOutput(options: {
  format: string;
  timestamps: boolean;
  startTime?: number;
  write?: (text: string) => void;
}): HeadlessOutput {
  const format = options.format.toLowerCase();
  const formatter: HeadlessFormatter =
    format === "json"
      ? createJsonFormatter({ write: options.write })
      : format === "jsonl"
        ? createJsonlFormatter({ timestamps: options.timestamps, write: options.write })
        : createTextFormatter({ timestamps: options.timestamps, write: options.write });

  const stats = {
    startTime: options.startTime ?? Date.now(),
    tasksComplete: 0,
    totalTasks: 0,
    commits: 0,
    linesAdded: 0,
    linesRemoved: 0,
  };

  const withTimestamp = <T extends HeadlessEvent>(event: T): T => {
    if (!options.timestamps) return event;
    return { ...event, timestamp: event.timestamp ?? Date.now() };
  };

  const emit = (event: HeadlessEvent) => {
    formatter.emit(withTimestamp(event));
  };

  const emitStats = () => {
    emit({
      type: "stats",
      commits: stats.commits,
      linesAdded: stats.linesAdded,
      linesRemoved: stats.linesRemoved,
    });
  };

  const callbacks: LoopCallbacks = {
    onIterationStart: (iteration) => {
      emit({ type: "iteration_start", iteration });
    },
    onEvent: (event: ToolEvent) => {
      if (event.type === "spinner" || event.type === "separator") return;
      if (event.type === "tool") {
        emit({
          type: "tool",
          iteration: event.iteration,
          name: event.icon || "tool",
          title: event.text,
          detail: event.detail,
        });
        return;
      }
      if (event.type === "reasoning") {
        emit({
          type: "reasoning",
          iteration: event.iteration,
          text: event.text,
        });
      }
    },
    onIterationComplete: (iteration, duration, commits) => {
      emit({
        type: "iteration_end",
        iteration,
        durationMs: duration,
        commits,
      });
    },
    onTasksUpdated: (done, total) => {
      stats.tasksComplete = done;
      stats.totalTasks = total;
      emit({ type: "progress", done, total });
    },
    onCommitsUpdated: (commits) => {
      stats.commits = commits;
      emitStats();
    },
    onDiffUpdated: (added, removed) => {
      stats.linesAdded = added;
      stats.linesRemoved = removed;
      emitStats();
    },
    onPause: () => {
      emit({ type: "pause" });
    },
    onResume: () => {
      emit({ type: "resume" });
    },
    onComplete: () => {
      emit({ type: "complete" });
    },
    onError: (error) => {
      emit({ type: "error", message: error });
    },
    onIdleChanged: (isIdle) => {
      emit({ type: "idle", isIdle });
    },
  };

  return {
    callbacks,
    emit,
    emitStart: () => {
      emit({ type: "start" });
    },
    finalize: (exitCode) => {
      const durationMs = Date.now() - stats.startTime;
      formatter.finalize({
        exitCode,
        durationMs,
        tasksComplete: stats.tasksComplete,
        totalTasks: stats.totalTasks,
        commits: stats.commits,
        linesAdded: stats.linesAdded,
        linesRemoved: stats.linesRemoved,
      });
    },
  };
}
