import type { HeadlessEvent, HeadlessFormatter, HeadlessSummary } from "../cli-output";

type TextFormatterOptions = {
  timestamps: boolean;
  write?: (text: string) => void;
};

const formatTimestamp = (timestamp: number) => {
  return new Date(timestamp).toISOString();
};

export function createTextFormatter(options: TextFormatterOptions): HeadlessFormatter {
  const write = options.write ?? ((text: string) => process.stdout.write(text));

  const lineWithTimestamp = (event: HeadlessEvent, line: string) => {
    if (!options.timestamps || !event.timestamp) {
      return line;
    }
    return `[${formatTimestamp(event.timestamp)}] ${line}`;
  };

  const emit = (event: HeadlessEvent) => {
    let line = "";
    switch (event.type) {
      case "start":
        line = "start";
        break;
      case "iteration_start":
        line = `iteration ${event.iteration} start`;
        break;
      case "iteration_end":
        line = `iteration ${event.iteration} end duration_ms=${event.durationMs} commits=${event.commits}`;
        break;
      case "tool": {
        const detail = event.detail ? ` (${event.detail})` : "";
        line = `tool ${event.name} ${event.title}${detail}`;
        break;
      }
      case "reasoning":
        line = `thought ${event.text}`;
        break;
      case "output":
        line = event.data;
        break;
      case "progress":
        line = `progress ${event.done}/${event.total}`;
        break;
      case "stats":
        line = `stats commits=${event.commits} +${event.linesAdded} -${event.linesRemoved}`;
        break;
      case "pause":
        line = "pause";
        break;
      case "resume":
        line = "resume";
        break;
      case "idle":
        line = `idle ${event.isIdle}`;
        break;
      case "error":
        line = `error ${event.message}`;
        break;
      case "complete":
        line = "complete";
        break;
    }

    if (!line) return;

    if (event.type === "output") {
      write(line);
      return;
    }

    write(lineWithTimestamp(event, line) + "\n");
  };

  const finalize = (_summary: HeadlessSummary) => {};

  return { emit, finalize };
}
