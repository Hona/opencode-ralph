import { describe, it, expect, beforeEach, afterEach, mock } from "bun:test";
import { unlink } from "node:fs/promises";
import { cleanupRalphFiles } from "../helpers/temp-files";

// --- Mock Setup ---

// Create mock functions that we can inspect
const mockSessionCreate = mock(() =>
  Promise.resolve({ data: { id: "test-session-123" } })
);
const mockSessionPrompt = mock(() => Promise.resolve());

// Mock event stream that simulates a complete iteration
function createMockEventStream() {
  const events = [
    // Server connected event - triggers prompt send
    {
      type: "server.connected",
      properties: {},
    },
    // Tool completion event
    {
      type: "message.part.updated",
      properties: {
        part: {
          sessionID: "test-session-123",
          type: "tool",
          tool: "read",
          state: {
            status: "completed",
            title: "Reading file.ts",
            input: { path: "file.ts" },
            time: { end: Date.now() },
          },
        },
      },
    },
    // Another tool completion
    {
      type: "message.part.updated",
      properties: {
        part: {
          sessionID: "test-session-123",
          type: "tool",
          tool: "edit",
          state: {
            status: "completed",
            title: "Editing file.ts",
            input: { path: "file.ts" },
            time: { end: Date.now() + 100 },
          },
        },
      },
    },
    // Session idle - signals completion
    {
      type: "session.idle",
      properties: {
        sessionID: "test-session-123",
      },
    },
  ];

  return {
    stream: (async function* () {
      for (const event of events) {
        yield event;
      }
    })(),
  };
}

const mockEventSubscribe = mock(() => Promise.resolve(createMockEventStream()));

// Mock the SDK module
mock.module("@opencode-ai/sdk/v2", () => ({
  createOpencodeServer: mock(() =>
    Promise.resolve({
      url: "http://localhost:4190",
      close: mock(() => {}),
    })
  ),
  createOpencodeClient: mock(() => ({
    session: {
      create: mockSessionCreate,
      prompt: mockSessionPrompt,
    },
    event: {
      subscribe: mockEventSubscribe,
    },
  })),
}));

// Import the module under test AFTER mocking
const { runLoop } = await import("../../src/loop.js");
import type { LoopCallbacks } from "../../src/loop.js";
import type { PersistedState, LoopOptions } from "../../src/state.js";

describe("ralph flow integration", () => {
  const testPlanFile = "tests/fixtures/plans/partial-complete.md";
  let cleanupFiles: string[] = [];

  // Track callback invocations
  let callbackOrder: string[] = [];
  let capturedEvents: Array<{ type: string; text?: string }> = [];
  let capturedTasks: { done: number; total: number } | null = null;
  let capturedCommits: number | null = null;

  const createTestCallbacks = (): LoopCallbacks => ({
    onIterationStart: (iteration: number) => {
      callbackOrder.push(`onIterationStart:${iteration}`);
    },
    onEvent: (event) => {
      callbackOrder.push(`onEvent:${event.type}`);
      capturedEvents.push({ type: event.type, text: event.text });
    },
    onTasksUpdated: (done, total) => {
      callbackOrder.push(`onTasksUpdated:${done}/${total}`);
      capturedTasks = { done, total };
    },
    onCommitsUpdated: (commits) => {
      callbackOrder.push(`onCommitsUpdated:${commits}`);
      capturedCommits = commits;
    },
    onDiffUpdated: (added, removed) => {
      callbackOrder.push(`onDiffUpdated:+${added}/-${removed}`);
    },
    onIterationComplete: (iteration, duration, commits) => {
      callbackOrder.push(`onIterationComplete:${iteration}`);
    },
    onPause: () => {
      callbackOrder.push("onPause");
    },
    onResume: () => {
      callbackOrder.push("onResume");
    },
    onComplete: () => {
      callbackOrder.push("onComplete");
    },
    onError: (error) => {
      callbackOrder.push(`onError:${error}`);
    },
    onIdleChanged: (isIdle) => {
      callbackOrder.push(`onIdleChanged:${isIdle}`);
    },
  });

  beforeEach(() => {
    callbackOrder = [];
    capturedEvents = [];
    capturedTasks = null;
    capturedCommits = null;
    cleanupFiles = [];

    // Reset mocks
    mockSessionCreate.mockClear();
    mockSessionPrompt.mockClear();
    mockEventSubscribe.mockClear();
  });

  afterEach(async () => {
    // Cleanup any test files created
    for (const file of cleanupFiles) {
      try {
        await unlink(file);
      } catch {
        // Ignore if file doesn't exist
      }
    }
    // Clean up all ralph-specific files (.ralph-lock, .ralph-pause, .ralph-done, .ralph-state.json)
    await cleanupRalphFiles();
  });

  it("should call callbacks in correct order during iteration", async () => {
    const options: LoopOptions = {
      planFile: testPlanFile,
      model: "anthropic/claude-sonnet-4",
      prompt: "Test prompt for {plan}",
    };

    const persistedState: PersistedState = {
      startTime: Date.now(),
      initialCommitHash: "abc123",
      iterationTimes: [],
      planFile: testPlanFile,
    };

    const callbacks = createTestCallbacks();
    const controller = new AbortController();

    // Create .ralph-done file to stop after first iteration
    cleanupFiles.push(".ralph-done");
    
    // Schedule creation of .ralph-done after a short delay to allow one iteration
    setTimeout(async () => {
      await Bun.write(".ralph-done", "");
    }, 50);

    await runLoop(options, persistedState, callbacks, controller.signal);

    // Verify callback order
    // 1. onIterationStart
    expect(callbackOrder[0]).toBe("onIterationStart:1");

    // 2. onEvent (separator) - added at iteration start
    expect(callbackOrder[1]).toBe("onEvent:separator");

    // 3. onEvent (spinner) - added after separator
    expect(callbackOrder[2]).toBe("onEvent:spinner");

    // 4. onTasksUpdated - after parsing plan
    expect(callbackOrder[3]).toStartWith("onTasksUpdated:");

    // 4. onEvent (tool events) - from the mock stream
    const toolEventIndices = callbackOrder
      .map((c, i) => (c === "onEvent:tool" ? i : -1))
      .filter((i) => i !== -1);
    expect(toolEventIndices.length).toBeGreaterThanOrEqual(1);

    // 5. onIterationComplete
    expect(callbackOrder).toContain("onIterationComplete:1");

    // 6. onCommitsUpdated
    const commitsIndex = callbackOrder.findIndex((c) =>
      c.startsWith("onCommitsUpdated:")
    );
    expect(commitsIndex).toBeGreaterThan(-1);

    // Verify onComplete was called (due to .ralph-done file)
    expect(callbackOrder).toContain("onComplete");
  });

  it("should capture tool events with correct data", async () => {
    const options: LoopOptions = {
      planFile: testPlanFile,
      model: "anthropic/claude-sonnet-4",
      prompt: "Test prompt for {plan}",
    };

    const persistedState: PersistedState = {
      startTime: Date.now(),
      initialCommitHash: "abc123",
      iterationTimes: [],
      planFile: testPlanFile,
    };

    const callbacks = createTestCallbacks();
    const controller = new AbortController();

    // Create .ralph-done file to stop after first iteration
    cleanupFiles.push(".ralph-done");
    setTimeout(async () => {
      await Bun.write(".ralph-done", "");
    }, 50);

    await runLoop(options, persistedState, callbacks, controller.signal);

    // Verify separator event
    const separatorEvent = capturedEvents.find((e) => e.type === "separator");
    expect(separatorEvent).toBeDefined();
    expect(separatorEvent?.text).toContain("iteration 1");

    // Verify tool events were captured
    const toolEvents = capturedEvents.filter((e) => e.type === "tool");
    expect(toolEvents.length).toBeGreaterThanOrEqual(1);
  });

  it("should create session and send prompt", async () => {
    const options: LoopOptions = {
      planFile: testPlanFile,
      model: "anthropic/claude-sonnet-4",
      prompt: "Custom prompt for {plan}",
    };

    const persistedState: PersistedState = {
      startTime: Date.now(),
      initialCommitHash: "abc123",
      iterationTimes: [],
      planFile: testPlanFile,
    };

    const callbacks = createTestCallbacks();
    const controller = new AbortController();

    // Create .ralph-done file to stop after first iteration
    cleanupFiles.push(".ralph-done");
    setTimeout(async () => {
      await Bun.write(".ralph-done", "");
    }, 50);

    await runLoop(options, persistedState, callbacks, controller.signal);

    // Verify session was created (at least once per iteration)
    expect(mockSessionCreate).toHaveBeenCalled();

    // Verify prompt was sent (at least once per iteration)
    expect(mockSessionPrompt).toHaveBeenCalled();

    // Verify events were subscribed to (at least once per iteration)
    expect(mockEventSubscribe).toHaveBeenCalled();
  });

  it("should parse task counts from plan file", async () => {
    const options: LoopOptions = {
      planFile: testPlanFile,
      model: "anthropic/claude-sonnet-4",
      prompt: "Test prompt for {plan}",
    };

    const persistedState: PersistedState = {
      startTime: Date.now(),
      initialCommitHash: "abc123",
      iterationTimes: [],
      planFile: testPlanFile,
    };

    const callbacks = createTestCallbacks();
    const controller = new AbortController();

    // Create .ralph-done file to stop after first iteration
    cleanupFiles.push(".ralph-done");
    setTimeout(async () => {
      await Bun.write(".ralph-done", "");
    }, 50);

    await runLoop(options, persistedState, callbacks, controller.signal);

    // Verify tasks were parsed (partial-complete.md has mix of done/not done)
    expect(capturedTasks).not.toBeNull();
    expect(capturedTasks!.total).toBeGreaterThan(0);
  });

  it("should detect .ralph-done file and call onComplete", async () => {
    const options: LoopOptions = {
      planFile: testPlanFile,
      model: "anthropic/claude-sonnet-4",
      prompt: "Test prompt for {plan}",
    };

    const persistedState: PersistedState = {
      startTime: Date.now(),
      initialCommitHash: "abc123",
      iterationTimes: [],
      planFile: testPlanFile,
    };

    const callbacks = createTestCallbacks();
    const controller = new AbortController();

    cleanupFiles.push(".ralph-done");

    // Create .ralph-done file BEFORE running the loop
    // This tests that the loop detects it at the start of the first iteration
    await Bun.write(".ralph-done", "");

    await runLoop(options, persistedState, callbacks, controller.signal);

    // Verify onComplete was called
    expect(callbackOrder).toContain("onComplete");

    // Verify the loop exited cleanly (no errors)
    const errorEvents = callbackOrder.filter((c) => c.startsWith("onError:"));
    expect(errorEvents).toHaveLength(0);

    // Verify .ralph-done file was deleted by the loop
    const doneFileExists = await Bun.file(".ralph-done").exists();
    expect(doneFileExists).toBe(false);
  });

  it("should exit cleanly when .ralph-done is created mid-iteration", async () => {
    const options: LoopOptions = {
      planFile: testPlanFile,
      model: "anthropic/claude-sonnet-4",
      prompt: "Test prompt for {plan}",
    };

    const persistedState: PersistedState = {
      startTime: Date.now(),
      initialCommitHash: "abc123",
      iterationTimes: [],
      planFile: testPlanFile,
    };

    const callbacks = createTestCallbacks();
    const controller = new AbortController();

    cleanupFiles.push(".ralph-done");

    // Schedule creation of .ralph-done after iteration starts but before it completes
    // This simulates the agent creating .ralph-done when all tasks are complete
    setTimeout(async () => {
      await Bun.write(".ralph-done", "");
    }, 100);

    await runLoop(options, persistedState, callbacks, controller.signal);

    // Verify at least one iteration started
    const iterationStartEvents = callbackOrder.filter((c) =>
      c.startsWith("onIterationStart:")
    );
    expect(iterationStartEvents.length).toBeGreaterThanOrEqual(1);

    // Verify onComplete was called
    expect(callbackOrder).toContain("onComplete");

    // Verify the loop exited cleanly (no errors)
    const errorEvents = callbackOrder.filter((c) => c.startsWith("onError:"));
    expect(errorEvents).toHaveLength(0);

    // Verify .ralph-done file was deleted
    const doneFileExists = await Bun.file(".ralph-done").exists();
    expect(doneFileExists).toBe(false);
  });

  it("should call onPause and onResume when .ralph-pause file is created and removed", async () => {
    const options: LoopOptions = {
      planFile: testPlanFile,
      model: "anthropic/claude-sonnet-4",
      prompt: "Test prompt for {plan}",
    };

    const persistedState: PersistedState = {
      startTime: Date.now(),
      initialCommitHash: "abc123",
      iterationTimes: [],
      planFile: testPlanFile,
    };

    const callbacks = createTestCallbacks();
    const controller = new AbortController();

    cleanupFiles.push(".ralph-pause");
    cleanupFiles.push(".ralph-done");

    // Create .ralph-pause file before starting the loop
    await Bun.write(".ralph-pause", "");

    // Schedule removal of .ralph-pause after the first pause check cycle (loop sleeps 1000ms when paused)
    setTimeout(async () => {
      await unlink(".ralph-pause").catch(() => {});
    }, 500);

    // Schedule creation of .ralph-done after resume to stop the loop
    // Need to wait for:
    // - Initial pause detection + 1000ms sleep
    // - Resume detection (pause file removed at 500ms, checked after sleep)
    // - Then we can complete
    setTimeout(async () => {
      await Bun.write(".ralph-done", "");
    }, 1200);

    await runLoop(options, persistedState, callbacks, controller.signal);

    // Verify onPause was called
    expect(callbackOrder).toContain("onPause");

    // Verify onResume was called after onPause
    const pauseIndex = callbackOrder.indexOf("onPause");
    const resumeIndex = callbackOrder.indexOf("onResume");
    expect(pauseIndex).toBeGreaterThan(-1);
    expect(resumeIndex).toBeGreaterThan(-1);
    expect(resumeIndex).toBeGreaterThan(pauseIndex);

    // Verify onComplete was called (due to .ralph-done file)
    expect(callbackOrder).toContain("onComplete");
  });

  it("should exit cleanly when abort signal is triggered mid-iteration", async () => {
    const options: LoopOptions = {
      planFile: testPlanFile,
      model: "anthropic/claude-sonnet-4",
      prompt: "Test prompt for {plan}",
    };

    const persistedState: PersistedState = {
      startTime: Date.now(),
      initialCommitHash: "abc123",
      iterationTimes: [],
      planFile: testPlanFile,
    };

    const callbacks = createTestCallbacks();
    const controller = new AbortController();

    // Schedule abort after the iteration starts but before it can complete multiple iterations
    // This gives time for the loop to start and begin processing
    setTimeout(() => {
      controller.abort();
    }, 100);

    // runLoop should exit without throwing when aborted
    await runLoop(options, persistedState, callbacks, controller.signal);

    // Verify the loop exited cleanly (no error callbacks)
    const errorEvents = callbackOrder.filter((c) => c.startsWith("onError:"));
    expect(errorEvents).toHaveLength(0);

    // Verify onComplete was NOT called (abort is different from completion)
    expect(callbackOrder).not.toContain("onComplete");

    // Verify at least one iteration started before abort
    const iterationStartEvents = callbackOrder.filter((c) =>
      c.startsWith("onIterationStart:")
    );
    expect(iterationStartEvents.length).toBeGreaterThanOrEqual(1);
  });

  it("should update state persistence across iterations via onIterationComplete callback", async () => {
    const options: LoopOptions = {
      planFile: testPlanFile,
      model: "anthropic/claude-sonnet-4",
      prompt: "Test prompt for {plan}",
    };

    // Create a fresh persisted state with empty iteration times
    const persistedState: PersistedState = {
      startTime: Date.now(),
      initialCommitHash: "abc123",
      iterationTimes: [],
      planFile: testPlanFile,
    };

    // Track iteration completion data
    let capturedIterationDurations: number[] = [];
    let iterationCompleteCallCount = 0;

    // Create callbacks that track and persist state like index.ts does
    const callbacks: LoopCallbacks = {
      onIterationStart: (iteration: number) => {
        callbackOrder.push(`onIterationStart:${iteration}`);
      },
      onEvent: (event) => {
        callbackOrder.push(`onEvent:${event.type}`);
      },
      onTasksUpdated: (done, total) => {
        callbackOrder.push(`onTasksUpdated:${done}/${total}`);
      },
      onCommitsUpdated: (commits) => {
        callbackOrder.push(`onCommitsUpdated:${commits}`);
      },
      onDiffUpdated: (added, removed) => {
        callbackOrder.push(`onDiffUpdated:+${added}/-${removed}`);
      },
      onIterationComplete: (iteration, duration, commits) => {
        callbackOrder.push(`onIterationComplete:${iteration}`);
        iterationCompleteCallCount++;

        // Simulate what index.ts does: update persisted state and save
        persistedState.iterationTimes.push(duration);
        capturedIterationDurations.push(duration);
      },
      onPause: () => {
        callbackOrder.push("onPause");
      },
      onResume: () => {
        callbackOrder.push("onResume");
      },
      onComplete: () => {
        callbackOrder.push("onComplete");
      },
      onError: (error) => {
        callbackOrder.push(`onError:${error}`);
      },
      onIdleChanged: (isIdle) => {
        callbackOrder.push(`onIdleChanged:${isIdle}`);
      },
    };

    const controller = new AbortController();

    // Create .ralph-done file to stop after first iteration
    cleanupFiles.push(".ralph-done");
    setTimeout(async () => {
      await Bun.write(".ralph-done", "");
    }, 50);

    await runLoop(options, persistedState, callbacks, controller.signal);

    // Verify onIterationComplete was called at least once
    expect(iterationCompleteCallCount).toBeGreaterThanOrEqual(1);

    // Verify iterationTimes array was updated
    expect(persistedState.iterationTimes.length).toBeGreaterThanOrEqual(1);

    // Verify captured durations match what's in persisted state
    expect(persistedState.iterationTimes).toEqual(capturedIterationDurations);

    // Verify duration values are non-negative numbers (can be 0 or very small with fast mocks)
    for (const duration of persistedState.iterationTimes) {
      expect(typeof duration).toBe("number");
      expect(duration).toBeGreaterThanOrEqual(0);
    }

    // Verify the state has all required fields intact
    expect(persistedState.startTime).toBeGreaterThan(0);
    expect(persistedState.initialCommitHash).toBe("abc123");
    expect(persistedState.planFile).toBe(testPlanFile);
  });
});
