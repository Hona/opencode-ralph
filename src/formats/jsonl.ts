import type { HeadlessEvent, HeadlessFormatter, HeadlessSummary } from "../cli-output";

type JsonlFormatterOptions = {
  timestamps: boolean;
  write?: (text: string) => void;
};

export function createJsonlFormatter(options: JsonlFormatterOptions): HeadlessFormatter {
  const write = options.write ?? ((text: string) => process.stdout.write(text));

  const emit = (event: HeadlessEvent) => {
    if (!options.timestamps && "timestamp" in event) {
      const { timestamp: _ignored, ...rest } = event;
      write(JSON.stringify(rest) + "\n");
      return;
    }
    write(JSON.stringify(event) + "\n");
  };

  const finalize = (_summary: HeadlessSummary) => {};

  return { emit, finalize };
}
