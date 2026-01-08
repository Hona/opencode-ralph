import { createSignal, type Accessor } from "solid-js";
import type { LoopState, ToolEvent, TokenUsage } from "../state";

/**
 * Loop status values representing the current state of the automation loop.
 */
export type LoopStatus = LoopState["status"];

/**
 * Action types for the loop state reducer.
 * Each action represents a discrete state transition.
 */
export type LoopAction =
  | { type: "START" }
  | { type: "PAUSE" }
  | { type: "RESUME" }
  | { type: "COMPLETE" }
  | { type: "ERROR"; error: string }
  | { type: "CLEAR_ERROR" }
  | { type: "SET_IDLE"; isIdle: boolean }
  | { type: "INCREMENT_ITERATION" }
  | { type: "SET_TASKS"; complete: number; total: number }
  | { type: "ADD_COMMIT" }
  | { type: "SET_LINES"; added: number; removed: number }
  | { type: "ADD_EVENT"; event: ToolEvent }
  | { type: "CLEAR_EVENTS" }
  | { type: "SET_SESSION"; sessionId: string; serverUrl: string; attached: boolean }
  | { type: "CLEAR_SESSION" }
  | { type: "SET_BACKOFF"; backoffMs: number; retryAt: number }
  | { type: "CLEAR_BACKOFF" }
  | { type: "SET_TOKENS"; tokens: TokenUsage }
  | { type: "RESET_TOKENS" };

/**
 * Initial state for the loop.
 * Used when creating a new loop state store.
 */
export const INITIAL_LOOP_STATE: LoopState = {
  status: "starting",
  iteration: 1,
  tasksComplete: 0,
  totalTasks: 0,
  commits: 0,
  linesAdded: 0,
  linesRemoved: 0,
  events: [],
  isIdle: true,
};

/**
 * Maximum number of events to keep in the events array.
 * Prevents unbounded memory growth.
 */
const MAX_EVENTS = 200;

/**
 * Reducer function for loop state transitions.
 * Pure function that takes current state and action, returns new state.
 *
 * @param state - Current loop state
 * @param action - Action to apply
 * @returns New loop state
 */
export function loopStateReducer(state: LoopState, action: LoopAction): LoopState {
  switch (action.type) {
    case "START":
      return { ...state, status: "running", isIdle: false };

    case "PAUSE":
      return { ...state, status: "paused" };

    case "RESUME":
      return { ...state, status: "running" };

    case "COMPLETE":
      return { ...state, status: "complete" };

    case "ERROR":
      return { ...state, status: "error", error: action.error };

    case "CLEAR_ERROR":
      return { ...state, status: "ready", error: undefined };

    case "SET_IDLE":
      return { ...state, isIdle: action.isIdle };

    case "INCREMENT_ITERATION":
      return { ...state, iteration: state.iteration + 1 };

    case "SET_TASKS":
      return {
        ...state,
        tasksComplete: action.complete,
        totalTasks: action.total,
      };

    case "ADD_COMMIT":
      return { ...state, commits: state.commits + 1 };

    case "SET_LINES":
      return {
        ...state,
        linesAdded: action.added,
        linesRemoved: action.removed,
      };

    case "ADD_EVENT": {
      const events = [...state.events, action.event];
      // Trim to max events to prevent unbounded growth
      if (events.length > MAX_EVENTS) {
        events.splice(0, events.length - MAX_EVENTS);
      }
      return { ...state, events };
    }

    case "CLEAR_EVENTS":
      return { ...state, events: [] };

    case "SET_SESSION":
      return {
        ...state,
        sessionId: action.sessionId,
        serverUrl: action.serverUrl,
        attached: action.attached,
      };

    case "CLEAR_SESSION":
      return {
        ...state,
        sessionId: undefined,
        serverUrl: undefined,
        attached: undefined,
      };

    case "SET_BACKOFF":
      return {
        ...state,
        errorBackoffMs: action.backoffMs,
        errorRetryAt: action.retryAt,
      };

    case "CLEAR_BACKOFF":
      return {
        ...state,
        errorBackoffMs: undefined,
        errorRetryAt: undefined,
      };

    case "SET_TOKENS":
      return { ...state, tokens: action.tokens };

    case "RESET_TOKENS":
      return { ...state, tokens: undefined };

    default:
      return state;
  }
}

/**
 * Loop state store with reactive signals and dispatch method.
 */
export interface LoopStateStore {
  /** Accessor for the full loop state */
  state: Accessor<LoopState>;

  /** Dispatch an action to update the state */
  dispatch: (action: LoopAction) => void;

  // Derived helpers for common status checks
  /** Returns true if the loop is currently running */
  isRunning: Accessor<boolean>;
  /** Returns true if the loop is paused */
  isPaused: Accessor<boolean>;
  /** Returns true if the loop is idle (waiting for LLM response) */
  isIdle: Accessor<boolean>;
  /** Returns true if the loop has completed */
  isComplete: Accessor<boolean>;
  /** Returns true if the loop is in an error state */
  isError: Accessor<boolean>;
  /** Returns true if the loop is starting */
  isStarting: Accessor<boolean>;

  // Session-related derived helpers
  /** Returns true if there is an active session */
  hasSession: Accessor<boolean>;
  /** Returns the current session ID if any */
  sessionId: Accessor<string | undefined>;
  /** Returns the server URL if connected */
  serverUrl: Accessor<string | undefined>;
  /** Returns true if attached to an external session */
  isAttached: Accessor<boolean>;

  // Backoff-related derived helpers
  /** Returns true if currently in error backoff */
  isInBackoff: Accessor<boolean>;
  /** Returns the retry timestamp if in backoff, undefined otherwise */
  retryAt: Accessor<number | undefined>;
}

/**
 * Creates a reactive loop state store.
 *
 * Uses a reducer pattern for predictable state transitions.
 * Provides derived accessors for common state checks to reduce boilerplate
 * in consuming components.
 *
 * @example
 * ```tsx
 * const loop = createLoopState();
 *
 * // Dispatch actions to update state
 * loop.dispatch({ type: "START" });
 * loop.dispatch({ type: "SET_TASKS", complete: 5, total: 10 });
 *
 * // Use derived helpers in components
 * <Show when={loop.isRunning()}>Running...</Show>
 * <Show when={loop.hasSession()}>Session: {loop.sessionId()}</Show>
 * ```
 *
 * @param initialState - Optional initial state (defaults to INITIAL_LOOP_STATE)
 * @returns LoopStateStore with reactive accessors and dispatch method
 */
export function createLoopState(
  initialState: LoopState = INITIAL_LOOP_STATE
): LoopStateStore {
  const [state, setState] = createSignal<LoopState>(initialState);

  /**
   * Dispatch an action to update the state.
   * Uses the reducer to compute the new state.
   */
  function dispatch(action: LoopAction): void {
    setState((prev) => loopStateReducer(prev, action));
  }

  // Derived helpers for status checks
  const isRunning: Accessor<boolean> = () => state().status === "running";
  const isPaused: Accessor<boolean> = () => state().status === "paused";
  const isIdle: Accessor<boolean> = () => state().isIdle;
  const isComplete: Accessor<boolean> = () => state().status === "complete";
  const isError: Accessor<boolean> = () => state().status === "error";
  const isStarting: Accessor<boolean> = () => state().status === "starting";

  // Session-related derived helpers
  const hasSession: Accessor<boolean> = () => state().sessionId !== undefined;
  const sessionId: Accessor<string | undefined> = () => state().sessionId;
  const serverUrl: Accessor<string | undefined> = () => state().serverUrl;
  const isAttached: Accessor<boolean> = () => state().attached === true;

  // Backoff-related derived helpers
  const isInBackoff: Accessor<boolean> = () => state().errorBackoffMs !== undefined;
  const retryAt: Accessor<number | undefined> = () => state().errorRetryAt;

  return {
    state,
    dispatch,
    isRunning,
    isPaused,
    isIdle,
    isComplete,
    isError,
    isStarting,
    hasSession,
    sessionId,
    serverUrl,
    isAttached,
    isInBackoff,
    retryAt,
  };
}
