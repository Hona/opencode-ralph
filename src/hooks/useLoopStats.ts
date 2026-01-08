import { createSignal, type Accessor } from "solid-js";

/**
 * Statistics for the automation loop.
 * Aggregated view of iteration timing and progress metrics.
 */
export interface LoopStats {
  /** Array of completed iteration durations in milliseconds */
  iterationDurations: number[];
  /** Average iteration time in milliseconds, or null if no data */
  averageIterationMs: number | null;
  /** Total elapsed time (pause-aware) in milliseconds */
  elapsedMs: number;
  /** Estimated time remaining in milliseconds, or null if no data */
  etaMs: number | null;
  /** Whether the loop is currently paused */
  isPaused: boolean;
  /** Total time spent paused in milliseconds */
  totalPausedMs: number;
}

/**
 * Loop stats store with reactive signals and methods.
 */
export interface LoopStatsStore {
  /** Accessor for iteration durations array */
  iterationDurations: Accessor<number[]>;
  /** Accessor for average iteration time in ms (null if no data) */
  averageIterationMs: Accessor<number | null>;
  /** Accessor for total elapsed time (pause-aware) in ms */
  elapsedMs: Accessor<number>;
  /** Accessor for estimated remaining time in ms (null if no data) */
  etaMs: Accessor<number | null>;
  /** Accessor for total paused time in ms */
  totalPausedMs: Accessor<number>;
  /** Accessor for combined stats object */
  stats: Accessor<LoopStats>;

  /** Start tracking a new iteration (records start timestamp) */
  startIteration: () => void;
  /** End current iteration and record its duration */
  endIteration: () => void;
  /** Pause the timer - stops elapsed time accumulation */
  pause: () => void;
  /** Resume the timer - continues elapsed time accumulation */
  resume: () => void;
  /** Set the number of remaining tasks for ETA calculation */
  setRemainingTasks: (count: number) => void;
  /** Initialize with existing iteration times (for resuming state) */
  initialize: (startTime: number, iterationTimes: number[]) => void;
  /** Reset all stats to initial state */
  reset: () => void;
  /** Tick the elapsed time (call from interval) */
  tick: () => void;
}

/**
 * Creates a reactive loop stats store for tracking iteration timing and progress.
 *
 * This hook provides pause-aware elapsed time tracking, iteration duration
 * recording, and ETA calculation based on average iteration times.
 *
 * @example
 * ```tsx
 * const loopStats = createLoopStats();
 *
 * // Initialize from persisted state
 * loopStats.initialize(persistedState.startTime, persistedState.iterationTimes);
 *
 * // Track iterations
 * loopStats.startIteration();
 * // ... iteration work ...
 * loopStats.endIteration();
 *
 * // Handle pause/resume
 * loopStats.pause();
 * loopStats.resume();
 *
 * // Update ETA based on remaining tasks
 * loopStats.setRemainingTasks(5);
 *
 * // In component
 * <span>Elapsed: {formatDuration(loopStats.elapsedMs())}</span>
 * <span>ETA: {formatEta(loopStats.etaMs())}</span>
 * ```
 *
 * @returns LoopStatsStore with reactive accessors and methods
 */
export function createLoopStats(): LoopStatsStore {
  // Core state signals
  const [iterationDurations, setIterationDurations] = createSignal<number[]>([]);
  const [remainingTasks, setRemainingTasks] = createSignal<number>(0);
  const [isPaused, setIsPaused] = createSignal(false);

  // Timing state
  const [startTime, setStartTime] = createSignal<number>(Date.now());
  const [iterationStartTime, setIterationStartTime] = createSignal<number | null>(null);
  const [pauseStartTime, setPauseStartTime] = createSignal<number | null>(null);
  const [totalPausedMs, setTotalPausedMs] = createSignal(0);
  const [elapsedMs, setElapsedMs] = createSignal(0);

  /**
   * Calculate average iteration time from recorded durations.
   */
  function averageIterationMs(): number | null {
    const durations = iterationDurations();
    if (durations.length === 0) {
      return null;
    }
    const sum = durations.reduce((acc, time) => acc + time, 0);
    return sum / durations.length;
  }

  /**
   * Calculate estimated time remaining based on average iteration and remaining tasks.
   */
  function etaMs(): number | null {
    const avg = averageIterationMs();
    if (avg === null) {
      return null;
    }
    const remaining = remainingTasks();
    if (remaining <= 0) {
      return null;
    }
    return avg * remaining;
  }

  /**
   * Get combined stats as a single object.
   */
  function stats(): LoopStats {
    return {
      iterationDurations: iterationDurations(),
      averageIterationMs: averageIterationMs(),
      elapsedMs: elapsedMs(),
      etaMs: etaMs(),
      isPaused: isPaused(),
      totalPausedMs: totalPausedMs(),
    };
  }

  /**
   * Start tracking a new iteration.
   */
  function startIteration(): void {
    setIterationStartTime(Date.now());
  }

  /**
   * End current iteration and record its duration.
   */
  function endIteration(): void {
    const start = iterationStartTime();
    if (start === null) {
      return;
    }
    const duration = Date.now() - start;
    setIterationDurations((prev) => [...prev, duration]);
    setIterationStartTime(null);
  }

  /**
   * Pause the timer - stops elapsed time accumulation.
   */
  function pause(): void {
    if (isPaused()) {
      return;
    }
    setIsPaused(true);
    setPauseStartTime(Date.now());
  }

  /**
   * Resume the timer - continues elapsed time accumulation.
   */
  function resume(): void {
    if (!isPaused()) {
      return;
    }
    const pauseStart = pauseStartTime();
    if (pauseStart !== null) {
      const pauseDuration = Date.now() - pauseStart;
      setTotalPausedMs((prev) => prev + pauseDuration);
    }
    setIsPaused(false);
    setPauseStartTime(null);
  }

  /**
   * Initialize with existing iteration times (for resuming state).
   */
  function initialize(existingStartTime: number, existingIterationTimes: number[]): void {
    setStartTime(existingStartTime);
    setIterationDurations([...existingIterationTimes]);
    // Calculate initial elapsed time
    setElapsedMs(Date.now() - existingStartTime);
  }

  /**
   * Reset all stats to initial state.
   */
  function reset(): void {
    setIterationDurations([]);
    setRemainingTasks(0);
    setIsPaused(false);
    setStartTime(Date.now());
    setIterationStartTime(null);
    setPauseStartTime(null);
    setTotalPausedMs(0);
    setElapsedMs(0);
  }

  /**
   * Tick the elapsed time (call from interval).
   * Accounts for paused time to show active working time.
   */
  function tick(): void {
    if (isPaused()) {
      return;
    }
    const now = Date.now();
    const total = now - startTime();
    const paused = totalPausedMs();
    setElapsedMs(total - paused);
  }

  return {
    iterationDurations,
    averageIterationMs,
    elapsedMs,
    etaMs,
    totalPausedMs,
    stats,
    startIteration,
    endIteration,
    pause,
    resume,
    setRemainingTasks,
    initialize,
    reset,
    tick,
  };
}
