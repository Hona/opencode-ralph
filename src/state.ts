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
  isIdle: boolean; // True when waiting for LLM response, false when tool events are arriving
  // Session lifecycle fields for steering mode
  sessionId?: string;
  serverUrl?: string;
  attached?: boolean;
};

export type ToolEvent = {
  iteration: number;
  type: "tool" | "separator" | "spinner" | "reasoning";
  icon?: string;
  text: string;
  timestamp: number;
  duration?: number; // For separators: iteration duration
  commitCount?: number; // For separators: commits this iteration
};

export const STATE_FILE = ".ralph-state.json";
export const MAX_EVENTS = 200;

/**
 * Trims an events array to keep only the most recent MAX_EVENTS.
 * Used to prevent unbounded memory growth from event accumulation.
 */
export function trimEvents(events: ToolEvent[]): ToolEvent[] {
  if (events.length > MAX_EVENTS) {
    return events.slice(-MAX_EVENTS);
  }
  return events;
}

/**
 * Trims an events array in-place to keep only the most recent MAX_EVENTS.
 * Mutates the array directly to avoid allocations.
 */
export function trimEventsInPlace(events: ToolEvent[]): void {
  if (events.length > MAX_EVENTS) {
    // Remove excess events from the beginning
    events.splice(0, events.length - MAX_EVENTS);
  }
}

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
  serverUrl?: string;
  serverTimeoutMs?: number;
};

/**
 * Information about the current active session.
 * Used for steering mode and session lifecycle management.
 */
export type SessionInfo = {
  sessionId: string;
  serverUrl: string;
  attached: boolean;
  sendMessage: (message: string) => Promise<void>;
};
