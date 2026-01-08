import type { HeadlessFormatter, HeadlessSummary } from "../cli-output";

type JsonFormatterOptions = {
  write?: (text: string) => void;
};

export function createJsonFormatter(options: JsonFormatterOptions): HeadlessFormatter {
  const write = options.write ?? ((text: string) => process.stdout.write(text));

  const emit = (_event: unknown) => {};

  const finalize = (summary: HeadlessSummary) => {
    write(JSON.stringify(summary) + "\n");
  };

  return { emit, finalize };
}
