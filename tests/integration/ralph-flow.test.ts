import { describe, it, expect, beforeEach, afterEach, mock } from "bun:test";
import { unlink } from "node:fs/promises";

// --- Mock Setup ---

// Create mock functions that we can inspect
const mockSessionCreate = mock(() =>
  Promise.resolve({ data: { id: "test-session-123" } })
);
const mockPromptAsync = mock(() => Promise.resolve());

// Mock event stream that simulates a complete iteration
function createMockEventStream() {
  const events = [
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
mock.module("@opencode-ai/sdk", () => ({
  createOpencodeServer: mock(() =>
    Promise.resolve({
      url: "http://localhost:4190",
      close: mock(() => {}),
    })
  ),
  createOpencodeClient: mock(() => ({
    session: {
      create: mockSessionCreate,
      promptAsync: mockPromptAsync,
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
  });

  beforeEach(() => {
    callbackOrder = [];
    capturedEvents = [];
    capturedTasks = null;
    capturedCommits = null;
    cleanupFiles = [];

    // Reset mocks
    mockSessionCreate.mockClear();
    mockPromptAsync.mockClear();
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
    // Clean up .ralph-done file if created during test
    try {
      await unlink(".ralph-done");
    } catch {
      // Ignore
    }
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

    // 3. onTasksUpdated - after parsing plan
    expect(callbackOrder[2]).toStartWith("onTasksUpdated:");

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
    expect(mockPromptAsync).toHaveBeenCalled();

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
});
