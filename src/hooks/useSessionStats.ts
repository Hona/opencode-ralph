import { createSignal, type Accessor } from "solid-js";

/**
 * Token usage statistics for a session.
 * Tracks input, output, reasoning tokens and cache usage.
 */
export interface SessionTokens {
  /** Total input tokens consumed */
  input: number;
  /** Total output tokens generated */
  output: number;
  /** Reasoning tokens (extended thinking) */
  reasoning: number;
  /** Tokens read from cache (cost savings) */
  cacheRead: number;
  /** Tokens written to cache */
  cacheWrite: number;
}

/**
 * Partial token update - all fields optional for incremental updates.
 */
export type TokenUpdate = Partial<SessionTokens>;

/**
 * Session stats store with reactive signals and mutation methods.
 */
export interface SessionStatsStore {
  /** Accessor for total input tokens */
  input: Accessor<number>;
  /** Accessor for total output tokens */
  output: Accessor<number>;
  /** Accessor for reasoning tokens */
  reasoning: Accessor<number>;
  /** Accessor for cache read tokens */
  cacheRead: Accessor<number>;
  /** Accessor for cache write tokens */
  cacheWrite: Accessor<number>;
  /** Accessor for combined totals as SessionTokens object */
  totals: Accessor<SessionTokens>;
  /** Reset all counters to zero */
  reset: () => void;
  /** Add tokens to the running totals (increments, not replaces) */
  addTokens: (tokens: TokenUpdate) => void;
}

/**
 * Creates a reactive session stats store for tracking token usage.
 * 
 * Each token counter is a separate signal for fine-grained reactivity -
 * components can subscribe to only the counters they care about.
 * 
 * @example
 * ```tsx
 * const stats = createSessionStats();
 * 
 * // In SSE event handler:
 * stats.addTokens({ input: 150, output: 50 });
 * 
 * // In component:
 * <span>Input: {stats.input()}</span>
 * 
 * // On session end:
 * stats.reset();
 * ```
 * 
 * @returns SessionStatsStore with reactive accessors and mutation methods
 */
export function createSessionStats(): SessionStatsStore {
  // Individual signals for fine-grained reactivity
  const [input, setInput] = createSignal(0);
  const [output, setOutput] = createSignal(0);
  const [reasoning, setReasoning] = createSignal(0);
  const [cacheRead, setCacheRead] = createSignal(0);
  const [cacheWrite, setCacheWrite] = createSignal(0);

  /**
   * Reset all counters to zero.
   * Call this at session start to clear previous session's stats.
   */
  function reset(): void {
    setInput(0);
    setOutput(0);
    setReasoning(0);
    setCacheRead(0);
    setCacheWrite(0);
  }

  /**
   * Add tokens to the running totals.
   * This increments the counters, not replaces them.
   * 
   * @param tokens - Partial token update with values to add
   */
  function addTokens(tokens: TokenUpdate): void {
    if (tokens.input !== undefined && tokens.input > 0) {
      setInput((prev) => prev + tokens.input!);
    }
    if (tokens.output !== undefined && tokens.output > 0) {
      setOutput((prev) => prev + tokens.output!);
    }
    if (tokens.reasoning !== undefined && tokens.reasoning > 0) {
      setReasoning((prev) => prev + tokens.reasoning!);
    }
    if (tokens.cacheRead !== undefined && tokens.cacheRead > 0) {
      setCacheRead((prev) => prev + tokens.cacheRead!);
    }
    if (tokens.cacheWrite !== undefined && tokens.cacheWrite > 0) {
      setCacheWrite((prev) => prev + tokens.cacheWrite!);
    }
  }

  /**
   * Derived accessor for combined totals.
   * Creates a new object on each access (for passing to display components).
   */
  function totals(): SessionTokens {
    return {
      input: input(),
      output: output(),
      reasoning: reasoning(),
      cacheRead: cacheRead(),
      cacheWrite: cacheWrite(),
    };
  }

  return {
    input,
    output,
    reasoning,
    cacheRead,
    cacheWrite,
    totals,
    reset,
    addTokens,
  };
}
