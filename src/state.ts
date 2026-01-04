export type PersistedState = {
  startTime: number; // When run started (epoch ms)
  initialCommitHash: string; // HEAD at start
  iterationTimes: number[]; // Duration of each completed iteration (ms)
  planFile: string; // Which plan file we're working on
};

export type LoopState = {
  status: "starting" | "running" | "paused" | "complete" | "error";
  iteration: number;
  tasksComplete: number;
  totalTasks: number;
  commits: number;
  linesAdded: number;
  linesRemoved: number;
  events: ToolEvent[];
  error?: string;
};

export type ToolEvent = {
  iteration: number;
  type: "tool" | "separator";
  icon?: string;
  text: string;
  timestamp: number;
  duration?: number; // For separators: iteration duration
  commitCount?: number; // For separators: commits this iteration
};

export const STATE_FILE = ".ralph-state.json";
export const MAX_EVENTS = 200;

export async function loadState(): Promise<PersistedState | null> {
  const file = Bun.file(STATE_FILE);
  if (!(await file.exists())) {
    return null;
  }
  return await file.json();
}

export async function saveState(state: PersistedState): Promise<void> {
  await Bun.write(STATE_FILE, JSON.stringify(state, null, 2));
}

export type LoopOptions = {
  planFile: string;
  model: string;
  prompt: string;
};
