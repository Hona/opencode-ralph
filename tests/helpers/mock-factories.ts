/**
 * Mock factories for creating test data with sensible defaults.
 * Use these to create consistent mock objects in tests.
 */
import type { PersistedState, LoopOptions, ToolEvent } from "../../src/state";

/**
 * Creates a mock PersistedState with sensible defaults.
 * Override any field by passing it in the overrides object.
 *
 * @example
 * ```ts
 * // With defaults
 * const state = createMockPersistedState();
 *
 * // With overrides
 * const state = createMockPersistedState({
 *   iterationTimes: [60000, 120000],
 *   planFile: "custom-plan.md",
 * });
 * ```
 */
export function createMockPersistedState(
  overrides?: Partial<PersistedState>
): PersistedState {
  return {
    startTime: 1704067200000, // 2024-01-01T00:00:00.000Z
    initialCommitHash: "abc123def456789012345678901234567890abcd",
    iterationTimes: [],
    planFile: "plan.md",
    ...overrides,
  };
}

/**
 * Creates a mock LoopOptions with sensible defaults.
 * Override any field by passing it in the overrides object.
 *
 * @example
 * ```ts
 * // With defaults
 * const options = createMockLoopOptions();
 *
 * // With overrides
 * const options = createMockLoopOptions({
 *   model: "openai/gpt-4",
 *   prompt: "Custom prompt for {plan}",
 * });
 * ```
 */
export function createMockLoopOptions(
  overrides?: Partial<LoopOptions>
): LoopOptions {
  return {
    planFile: "plan.md",
    model: "anthropic/claude-sonnet-4",
    prompt: "READ all of {plan}. Pick ONE task. Complete it. Commit change.",
    serverUrl: undefined,
    serverTimeoutMs: undefined,
    ...overrides,
  };
}

/**
 * Creates a mock ToolEvent with sensible defaults.
 * Override any field by passing it in the overrides object.
 *
 * @example
 * ```ts
 * // Tool event with defaults
 * const event = createMockToolEvent();
 *
 * // Separator event
 * const separator = createMockToolEvent({
 *   type: "separator",
 *   text: "iteration 1",
 *   duration: 60000,
 *   commitCount: 2,
 * });
 *
 * // Custom tool event
 * const toolEvent = createMockToolEvent({
 *   icon: "Write",
 *   text: "src/index.ts",
 * });
 * ```
 */
export function createMockToolEvent(
  overrides?: Partial<ToolEvent>
): ToolEvent {
  return {
    iteration: 1,
    type: "tool",
    icon: "Read",
    text: "plan.md",
    timestamp: Date.now(),
    ...overrides,
  };
}

/**
 * Creates a mock separator ToolEvent with sensible defaults.
 * This is a convenience function for creating separator events.
 *
 * @example
 * ```ts
 * const separator = createMockSeparatorEvent({
 *   iteration: 3,
 *   duration: 120000,
 *   commitCount: 5,
 * });
 * ```
 */
export function createMockSeparatorEvent(
  overrides?: Partial<ToolEvent>
): ToolEvent {
  const iteration = overrides?.iteration ?? 1;
  return {
    iteration,
    type: "separator",
    text: `iteration ${iteration}`,
    timestamp: Date.now(),
    duration: 60000,
    commitCount: 1,
    ...overrides,
  };
}
