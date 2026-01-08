import { createSignal, type Accessor } from "solid-js";
import type { ActivityEventType } from "../types/events";

// Re-export ActivityEventType for consumers that import from this module
export type { ActivityEventType } from "../types/events";

/**
 * Maximum number of activity events to keep in the log.
 * Prevents unbounded memory growth.
 */
const MAX_ACTIVITY_EVENTS = 100;

/**
 * An activity event in the log.
 * Represents a discrete action or state change during the session.
 */
export interface ActivityEvent {
  /** Unique identifier for the event */
  id: string;
  /** Timestamp when the event occurred (epoch ms) */
  timestamp: number;
  /** Type of event for categorization and styling */
  type: ActivityEventType;
  /** Human-readable message describing the event */
  message: string;
  /** Optional additional detail (e.g., file path, tool args) */
  detail?: string;
  /** Whether this is a verbose/debug event (dim styling) */
  verbose?: boolean;
}

/**
 * Options for logging an activity event.
 */
export interface LogOptions {
  /** Type of event */
  type: ActivityEventType;
  /** Event message */
  message: string;
  /** Optional detail string */
  detail?: string;
  /** Mark as verbose (dim styling) */
  verbose?: boolean;
}

/**
 * Activity log store with reactive signals and mutation methods.
 */
export interface ActivityLogStore {
  /** Accessor for the array of activity events */
  events: Accessor<ActivityEvent[]>;
  /** Accessor for the count of events */
  count: Accessor<number>;
  /** Log a new activity event */
  log: (options: LogOptions) => void;
  /** Clear all events */
  clear: () => void;
  /** Get the most recent event (or undefined if empty) */
  latest: Accessor<ActivityEvent | undefined>;
}

/**
 * Generate a unique ID for an activity event.
 * Uses timestamp + random suffix for uniqueness.
 */
function generateEventId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

/**
 * Creates a reactive activity log store for tracking session activity.
 *
 * The activity log provides a chronological record of events during
 * the session, including tool usage, file operations, errors, and
 * other significant actions.
 *
 * Events are automatically trimmed to prevent unbounded memory growth.
 * The maximum number of events kept is defined by MAX_ACTIVITY_EVENTS.
 *
 * @example
 * ```tsx
 * const activityLog = createActivityLog();
 *
 * // Log events during operation
 * activityLog.log({
 *   type: "file_edit",
 *   message: "Modified config file",
 *   detail: "src/config.ts",
 * });
 *
 * activityLog.log({
 *   type: "reasoning",
 *   message: "Analyzing code structure",
 *   verbose: true,
 * });
 *
 * // In component
 * <For each={activityLog.events()}>
 *   {(event) => <ActivityRow event={event} />}
 * </For>
 *
 * // On session end
 * activityLog.clear();
 * ```
 *
 * @returns ActivityLogStore with reactive accessors and mutation methods
 */
export function createActivityLog(): ActivityLogStore {
  const [events, setEvents] = createSignal<ActivityEvent[]>([]);

  /**
   * Log a new activity event.
   * Automatically trims oldest events when limit is reached.
   *
   * @param options - Event options including type, message, and optional detail
   */
  function log(options: LogOptions): void {
    const event: ActivityEvent = {
      id: generateEventId(),
      timestamp: Date.now(),
      type: options.type,
      message: options.message,
      detail: options.detail,
      verbose: options.verbose,
    };

    setEvents((prev) => {
      const next = [...prev, event];
      // Auto-trim oldest events when limit exceeded
      if (next.length > MAX_ACTIVITY_EVENTS) {
        return next.slice(-MAX_ACTIVITY_EVENTS);
      }
      return next;
    });
  }

  /**
   * Clear all events from the log.
   * Call this at session start or when resetting state.
   */
  function clear(): void {
    setEvents([]);
  }

  /**
   * Derived accessor for event count.
   */
  function count(): number {
    return events().length;
  }

  /**
   * Derived accessor for the most recent event.
   */
  function latest(): ActivityEvent | undefined {
    const all = events();
    return all.length > 0 ? all[all.length - 1] : undefined;
  }

  return {
    events,
    count,
    log,
    clear,
    latest,
  };
}
