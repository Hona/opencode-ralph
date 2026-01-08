export type AdapterEvent =
  | { type: "output"; data: string }
  | { type: "exit"; code: number }
  | { type: "error"; message: string };

export interface ExecuteOptions {
  prompt: string;
  model?: string;
  cwd: string;
  signal: AbortSignal;
  cols: number;
  rows: number;
}

export interface AgentSession {
  events: AsyncIterable<AdapterEvent>;
  send: (input: string) => void;
  abort: () => void;
  done: Promise<{ exitCode?: number }>;
}

export interface AgentAdapter {
  readonly name: string;
  readonly displayName: string;
  readonly mode: "pty";
  isAvailable(): Promise<boolean>;
  execute(options: ExecuteOptions): Promise<AgentSession>;
}
