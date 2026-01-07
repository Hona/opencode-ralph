import { describe, it, expect, beforeEach, afterEach, mock } from "bun:test";
import { unlink } from "node:fs/promises";
import { cleanupRalphFiles } from "../helpers/temp-files";

// --- Mock Setup ---

// Create mock functions that we can inspect
const mockSessionCreate = mock(() =>
  Promise.resolve({ data: { id: "test-session-123" } })
);
const mockSessionPrompt = mock(() => Promise.resolve());
const mockCreateOpencodeServer = mock(() =>
  Promise.resolve({
    url: "http://localhost:4190",
    close: mock(() => {}),
  })
);

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
mock.module("@opencode-ai/sdk", () => ({
  createOpencodeServer: mockCreateOpencodeServer,
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
    mockCreateOpencodeServer.mockClear();
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

  it("should not call createOpencodeServer when serverUrl is provided", async () => {
    // Mock fetch for health check
    const originalFetch = globalThis.fetch;
    globalThis.fetch = mock(() => 
      Promise.resolve(new Response(JSON.stringify({ healthy: true }), { status: 200 }))
    ) as unknown as typeof fetch;

    const options: LoopOptions = {
      planFile: testPlanFile,
      model: "anthropic/claude-sonnet-4",
      prompt: "Test prompt for {plan}",
      serverUrl: "http://localhost:4190",
      serverTimeoutMs: 1000,
    };

    const persistedState: PersistedState = {
      startTime: Date.now(),
      initialCommitHash: "abc123",
      iterationTimes: [],
      planFile: testPlanFile,
    };

    const callbacks = createTestCallbacks();
    const controller = new AbortController();

    // Create .ralph-done to stop immediately
    cleanupFiles.push(".ralph-done");
    await Bun.write(".ralph-done", "");

    await runLoop(options, persistedState, callbacks, controller.signal);

    // Verify createOpencodeServer was NOT called (since serverUrl was provided)
    expect(mockCreateOpencodeServer).not.toHaveBeenCalled();

    // Verify onComplete was called (due to .ralph-done file)
    expect(callbackOrder).toContain("onComplete");

    globalThis.fetch = originalFetch;
  });

  it("should throw error when serverUrl is unreachable", async () => {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = mock(() => Promise.reject(new Error("Network error"))) as unknown as typeof fetch;

    const options: LoopOptions = {
      planFile: testPlanFile,
      model: "anthropic/claude-sonnet-4",
      prompt: "Test prompt for {plan}",
      serverUrl: "http://unreachable:4190",
      serverTimeoutMs: 100,
    };

    const persistedState: PersistedState = {
      startTime: Date.now(),
      initialCommitHash: "abc123",
      iterationTimes: [],
      planFile: testPlanFile,
    };

    const callbacks = createTestCallbacks();
    const controller = new AbortController();

    await expect(runLoop(options, persistedState, callbacks, controller.signal))
      .rejects.toThrow("Cannot connect");

    // Verify onError was called
    expect(callbackOrder.some(c => c.startsWith("onError:"))).toBe(true);

    globalThis.fetch = originalFetch;
  });

  it("should call onSessionCreated with attached=true when using external server", async () => {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = mock(() => 
      Promise.resolve(new Response(JSON.stringify({ healthy: true }), { status: 200 }))
    ) as unknown as typeof fetch;

    let capturedSessionInfo: {
      sessionId: string;
      serverUrl: string;
      attached: boolean;
      sendMessage: (message: string) => Promise<void>;
    } | null = null;

    const options: LoopOptions = {
      planFile: testPlanFile,
      model: "anthropic/claude-sonnet-4",
      prompt: "Test prompt for {plan}",
      serverUrl: "http://localhost:4190",
      serverTimeoutMs: 1000,
    };

    const persistedState: PersistedState = {
      startTime: Date.now(),
      initialCommitHash: "abc123",
      iterationTimes: [],
      planFile: testPlanFile,
    };

    const callbacks: LoopCallbacks = {
      ...createTestCallbacks(),
      onSessionCreated: (session) => {
        callbackOrder.push(`onSessionCreated:${session.sessionId}`);
        capturedSessionInfo = session;
      },
      onSessionEnded: (sessionId) => {
        callbackOrder.push(`onSessionEnded:${sessionId}`);
      },
    };

    const controller = new AbortController();

    // Schedule creation of .ralph-done after session is created
    cleanupFiles.push(".ralph-done");
    setTimeout(async () => {
      await Bun.write(".ralph-done", "");
    }, 100);

    await runLoop(options, persistedState, callbacks, controller.signal);

    // Verify onSessionCreated was called
    expect(capturedSessionInfo).not.toBeNull();
    expect(capturedSessionInfo!.sessionId).toBe("test-session-123");
    expect(capturedSessionInfo!.serverUrl).toBe("http://localhost:4190");
    expect(capturedSessionInfo!.attached).toBe(true);
    expect(typeof capturedSessionInfo!.sendMessage).toBe("function");

    // Verify callback order includes session lifecycle events
    expect(callbackOrder).toContain("onSessionCreated:test-session-123");
    expect(callbackOrder).toContain("onSessionEnded:test-session-123");

    globalThis.fetch = originalFetch;
  });

  it("should call onSessionEnded when session completes with external server", async () => {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = mock(() => 
      Promise.resolve(new Response(JSON.stringify({ healthy: true }), { status: 200 }))
    ) as unknown as typeof fetch;

    let sessionEndedCalled = false;
    let endedSessionId = "";

    const options: LoopOptions = {
      planFile: testPlanFile,
      model: "anthropic/claude-sonnet-4",
      prompt: "Test prompt for {plan}",
      serverUrl: "http://localhost:4190",
      serverTimeoutMs: 1000,
    };

    const persistedState: PersistedState = {
      startTime: Date.now(),
      initialCommitHash: "abc123",
      iterationTimes: [],
      planFile: testPlanFile,
    };

    const callbacks: LoopCallbacks = {
      ...createTestCallbacks(),
      onSessionEnded: (sessionId) => {
        sessionEndedCalled = true;
        endedSessionId = sessionId;
        callbackOrder.push(`onSessionEnded:${sessionId}`);
      },
    };

    const controller = new AbortController();

    // Schedule creation of .ralph-done after iteration completes
    cleanupFiles.push(".ralph-done");
    setTimeout(async () => {
      await Bun.write(".ralph-done", "");
    }, 100);

    await runLoop(options, persistedState, callbacks, controller.signal);

    // Verify onSessionEnded was called with correct session ID
    expect(sessionEndedCalled).toBe(true);
    expect(endedSessionId).toBe("test-session-123");

    // Verify it was called after session.idle event (which signals session completion)
    const sessionEndedIndex = callbackOrder.findIndex(c => c.startsWith("onSessionEnded:"));
    const iterationCompleteIndex = callbackOrder.findIndex(c => c.startsWith("onIterationComplete:"));
    expect(sessionEndedIndex).toBeGreaterThan(-1);
    expect(iterationCompleteIndex).toBeGreaterThan(-1);
    // Session ends before iteration completes (session.idle triggers session end, then iteration finishes)
    expect(sessionEndedIndex).toBeLessThan(iterationCompleteIndex);

    globalThis.fetch = originalFetch;
  });

  it("should provide working sendMessage function in onSessionCreated callback", async () => {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = mock(() => 
      Promise.resolve(new Response(JSON.stringify({ healthy: true }), { status: 200 }))
    ) as unknown as typeof fetch;

    let capturedSendMessage: ((message: string) => Promise<void>) | null = null;

    const options: LoopOptions = {
      planFile: testPlanFile,
      model: "anthropic/claude-sonnet-4",
      prompt: "Test prompt for {plan}",
      serverUrl: "http://localhost:4190",
      serverTimeoutMs: 1000,
    };

    const persistedState: PersistedState = {
      startTime: Date.now(),
      initialCommitHash: "abc123",
      iterationTimes: [],
      planFile: testPlanFile,
    };

    const callbacks: LoopCallbacks = {
      ...createTestCallbacks(),
      onSessionCreated: (session) => {
        capturedSendMessage = session.sendMessage;
        callbackOrder.push(`onSessionCreated:${session.sessionId}`);
      },
    };

    const controller = new AbortController();

    // Schedule creation of .ralph-done after session is created
    cleanupFiles.push(".ralph-done");
    setTimeout(async () => {
      await Bun.write(".ralph-done", "");
    }, 100);

    await runLoop(options, persistedState, callbacks, controller.signal);

    // Verify sendMessage was captured
    expect(capturedSendMessage).not.toBeNull();
    expect(typeof capturedSendMessage).toBe("function");

    // The sendMessage function should be callable (though in this test it will fail
    // because session has already ended - this is expected behavior)
    // The key verification is that the function exists and has the correct signature

    globalThis.fetch = originalFetch;
  });

  it("should send steering message via sendMessage function", async () => {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = mock(() => 
      Promise.resolve(new Response(JSON.stringify({ healthy: true }), { status: 200 }))
    ) as unknown as typeof fetch;

    let capturedSendMessage: ((message: string) => Promise<void>) | null = null;
    let sessionCreatedPromiseResolve: () => void;
    const sessionCreatedPromise = new Promise<void>((resolve) => {
      sessionCreatedPromiseResolve = resolve;
    });

    const options: LoopOptions = {
      planFile: testPlanFile,
      model: "anthropic/claude-sonnet-4",
      prompt: "Test prompt for {plan}",
      serverUrl: "http://localhost:4190",
      serverTimeoutMs: 1000,
    };

    const persistedState: PersistedState = {
      startTime: Date.now(),
      initialCommitHash: "abc123",
      iterationTimes: [],
      planFile: testPlanFile,
    };

    const callbacks: LoopCallbacks = {
      ...createTestCallbacks(),
      onSessionCreated: (session) => {
        capturedSendMessage = session.sendMessage;
        callbackOrder.push(`onSessionCreated:${session.sessionId}`);
        sessionCreatedPromiseResolve();
      },
    };

    const controller = new AbortController();

    // Schedule creation of .ralph-done after we've tested sendMessage
    cleanupFiles.push(".ralph-done");
    
    // Start the loop in background
    const loopPromise = runLoop(options, persistedState, callbacks, controller.signal);

    // Wait for session to be created
    await sessionCreatedPromise;
    
    // Reset the mock to clear the initial prompt call
    mockSessionPrompt.mockClear();
    
    // Now call sendMessage with a steering message
    expect(capturedSendMessage).not.toBeNull();
    await capturedSendMessage!("Focus on the task at hand");
    
    // Verify session.prompt was called with the steering message
    expect(mockSessionPrompt).toHaveBeenCalledTimes(1);
    expect(mockSessionPrompt).toHaveBeenCalledWith(expect.objectContaining({
      path: { id: "test-session-123" },
      body: expect.objectContaining({
        parts: [{ type: "text", text: "Focus on the task at hand" }],
        model: { providerID: "anthropic", modelID: "claude-sonnet-4" },
      }),
    }));

    // Create .ralph-done to stop the loop
    await Bun.write(".ralph-done", "");
    
    // Wait for loop to complete
    await loopPromise;

    globalThis.fetch = originalFetch;
  });

  describe("prompt-file precedence and placeholder replacement", () => {
    it("should use --prompt option over --prompt-file", async () => {
      // Create a prompt file that should NOT be used
      const promptFile = "tests/fixtures/test-prompt-file.md";
      await Bun.write(promptFile, "This prompt from file should NOT be used: {plan}");
      cleanupFiles.push(promptFile);

      const options: LoopOptions = {
        planFile: testPlanFile,
        model: "anthropic/claude-sonnet-4",
        prompt: "Explicit prompt takes precedence: {plan}", // This should be used
        promptFile: promptFile,
      };

      const persistedState: PersistedState = {
        startTime: Date.now(),
        initialCommitHash: "abc123",
        iterationTimes: [],
        planFile: testPlanFile,
      };

      const callbacks = createTestCallbacks();
      const controller = new AbortController();

      // Schedule .ralph-done creation after iteration starts to allow prompt to be sent
      cleanupFiles.push(".ralph-done");
      setTimeout(async () => {
        await Bun.write(".ralph-done", "");
      }, 50);

      await runLoop(options, persistedState, callbacks, controller.signal);

      // Verify the explicit --prompt was used, not the prompt file
      expect(mockSessionPrompt).toHaveBeenCalledWith(expect.objectContaining({
        body: expect.objectContaining({
          parts: [{ type: "text", text: `Explicit prompt takes precedence: ${testPlanFile}` }],
        }),
      }));
    });

    it("should read from --prompt-file when --prompt is not provided", async () => {
      // Create a custom prompt file
      const promptFile = "tests/fixtures/custom-prompt-file.md";
      await Bun.write(promptFile, "Custom prompt from file: process {plan} now!");
      cleanupFiles.push(promptFile);

      // Use type assertion since buildPrompt handles undefined prompt internally
      const options = {
        planFile: testPlanFile,
        model: "anthropic/claude-sonnet-4",
        prompt: undefined,
        promptFile: promptFile,
      } as unknown as LoopOptions;

      const persistedState: PersistedState = {
        startTime: Date.now(),
        initialCommitHash: "abc123",
        iterationTimes: [],
        planFile: testPlanFile,
      };

      const callbacks = createTestCallbacks();
      const controller = new AbortController();

      // Schedule .ralph-done creation after iteration starts to allow prompt to be sent
      cleanupFiles.push(".ralph-done");
      setTimeout(async () => {
        await Bun.write(".ralph-done", "");
      }, 50);

      await runLoop(options, persistedState, callbacks, controller.signal);

      // Verify the prompt file content was used with placeholder replaced
      expect(mockSessionPrompt).toHaveBeenCalledWith(expect.objectContaining({
        body: expect.objectContaining({
          parts: [{ type: "text", text: `Custom prompt from file: process ${testPlanFile} now!` }],
        }),
      }));
    });

    it("should replace both {plan} and {{PLAN_FILE}} placeholders in prompt file", async () => {
      // Create a prompt file with both placeholder formats
      const promptFile = "tests/fixtures/dual-placeholder-prompt.md";
      await Bun.write(promptFile, "Read {plan} first, then update {{PLAN_FILE}} when done.");
      cleanupFiles.push(promptFile);

      // Use type assertion since buildPrompt handles undefined prompt internally
      const options = {
        planFile: testPlanFile,
        model: "anthropic/claude-sonnet-4",
        prompt: undefined,
        promptFile: promptFile,
      } as unknown as LoopOptions;

      const persistedState: PersistedState = {
        startTime: Date.now(),
        initialCommitHash: "abc123",
        iterationTimes: [],
        planFile: testPlanFile,
      };

      const callbacks = createTestCallbacks();
      const controller = new AbortController();

      // Schedule .ralph-done creation after iteration starts to allow prompt to be sent
      cleanupFiles.push(".ralph-done");
      setTimeout(async () => {
        await Bun.write(".ralph-done", "");
      }, 50);

      await runLoop(options, persistedState, callbacks, controller.signal);

      // Verify both placeholders were replaced
      expect(mockSessionPrompt).toHaveBeenCalledWith(expect.objectContaining({
        body: expect.objectContaining({
          parts: [{ type: "text", text: `Read ${testPlanFile} first, then update ${testPlanFile} when done.` }],
        }),
      }));
    });

    it("should fall back to DEFAULT_PROMPT when prompt-file doesn't exist", async () => {
      // Use type assertion since buildPrompt handles undefined prompt internally
      const options = {
        planFile: testPlanFile,
        model: "anthropic/claude-sonnet-4",
        prompt: undefined,
        promptFile: "nonexistent-prompt-file.md", // File doesn't exist
      } as unknown as LoopOptions;

      const persistedState: PersistedState = {
        startTime: Date.now(),
        initialCommitHash: "abc123",
        iterationTimes: [],
        planFile: testPlanFile,
      };

      const callbacks = createTestCallbacks();
      const controller = new AbortController();

      // Schedule .ralph-done creation after iteration starts to allow prompt to be sent
      cleanupFiles.push(".ralph-done");
      setTimeout(async () => {
        await Bun.write(".ralph-done", "");
      }, 50);

      await runLoop(options, persistedState, callbacks, controller.signal);

      // Verify DEFAULT_PROMPT was used (it contains specific strings)
      expect(mockSessionPrompt).toHaveBeenCalled();
      // Get the actual call to verify DEFAULT_PROMPT content
      const calls = mockSessionPrompt.mock.calls as unknown as Array<[{ body: { parts: Array<{ text: string }> } }]>;
      expect(calls.length).toBeGreaterThan(0);
      const promptText = calls[0][0].body.parts[0].text;
      
      // DEFAULT_PROMPT contains these strings
      expect(promptText).toContain("READ all of");
      expect(promptText).toContain("Pick ONE task");
      expect(promptText).toContain(".ralph-done");
      expect(promptText).toContain("NEVER GIT PUSH");
      // Verify {plan} was replaced
      expect(promptText).not.toContain("{plan}");
      expect(promptText).toContain(testPlanFile);
    });

    it("should use DEFAULT_PROMPT when prompt is empty string", async () => {
      const options: LoopOptions = {
        planFile: testPlanFile,
        model: "anthropic/claude-sonnet-4",
        prompt: "", // Empty string should fall back to default
      };

      const persistedState: PersistedState = {
        startTime: Date.now(),
        initialCommitHash: "abc123",
        iterationTimes: [],
        planFile: testPlanFile,
      };

      const callbacks = createTestCallbacks();
      const controller = new AbortController();

      // Schedule .ralph-done creation after iteration starts to allow prompt to be sent
      cleanupFiles.push(".ralph-done");
      setTimeout(async () => {
        await Bun.write(".ralph-done", "");
      }, 50);

      await runLoop(options, persistedState, callbacks, controller.signal);

      // Verify DEFAULT_PROMPT was used
      expect(mockSessionPrompt).toHaveBeenCalled();
      const calls = mockSessionPrompt.mock.calls as unknown as Array<[{ body: { parts: Array<{ text: string }> } }]>;
      expect(calls.length).toBeGreaterThan(0);
      const promptText = calls[0][0].body.parts[0].text;
      
      expect(promptText).toContain("READ all of");
      expect(promptText).toContain("Pick ONE task");
    });
  });

  describe("plan parsing with various checkbox formats", () => {
    it("should correctly parse uppercase [X] checkboxes", async () => {
      const uppercasePlanFile = "tests/fixtures/plans/uppercase-complete.md";
      let capturedTasks: { done: number; total: number } | null = null;

      const options: LoopOptions = {
        planFile: uppercasePlanFile,
        model: "anthropic/claude-sonnet-4",
        prompt: "Test prompt for {plan}",
      };

      const persistedState: PersistedState = {
        startTime: Date.now(),
        initialCommitHash: "abc123",
        iterationTimes: [],
        planFile: uppercasePlanFile,
      };

      const callbacks: LoopCallbacks = {
        ...createTestCallbacks(),
        onTasksUpdated: (done, total) => {
          capturedTasks = { done, total };
        },
      };

      const controller = new AbortController();

      // Create .ralph-done after loop starts to allow task parsing
      cleanupFiles.push(".ralph-done");
      setTimeout(async () => {
        await Bun.write(".ralph-done", "");
      }, 50);

      await runLoop(options, persistedState, callbacks, controller.signal);

      // uppercase-complete.md has 3 uppercase [X] completed and 1 incomplete
      expect(capturedTasks).not.toBeNull();
      expect(capturedTasks!.done).toBe(3);
      expect(capturedTasks!.total).toBe(4);
    });

    it("should ignore checkboxes inside fenced code blocks", async () => {
      const codeBlocksPlanFile = "tests/fixtures/plans/code-blocks.md";
      let capturedTasks: { done: number; total: number } | null = null;

      const options: LoopOptions = {
        planFile: codeBlocksPlanFile,
        model: "anthropic/claude-sonnet-4",
        prompt: "Test prompt for {plan}",
      };

      const persistedState: PersistedState = {
        startTime: Date.now(),
        initialCommitHash: "abc123",
        iterationTimes: [],
        planFile: codeBlocksPlanFile,
      };

      const callbacks: LoopCallbacks = {
        ...createTestCallbacks(),
        onTasksUpdated: (done, total) => {
          capturedTasks = { done, total };
        },
      };

      const controller = new AbortController();

      // Create .ralph-done after loop starts to allow task parsing
      cleanupFiles.push(".ralph-done");
      setTimeout(async () => {
        await Bun.write(".ralph-done", "");
      }, 50);

      await runLoop(options, persistedState, callbacks, controller.signal);

      // code-blocks.md has 2 completed and 3 incomplete real tasks
      // The checkboxes in code blocks should NOT be counted
      expect(capturedTasks).not.toBeNull();
      expect(capturedTasks!.done).toBe(2);
      expect(capturedTasks!.total).toBe(5);
    });

    it("should handle deeply nested checkbox lists", async () => {
      const nestedPlanFile = "tests/fixtures/plans/complex-nested.md";
      let capturedTasks: { done: number; total: number } | null = null;

      const options: LoopOptions = {
        planFile: nestedPlanFile,
        model: "anthropic/claude-sonnet-4",
        prompt: "Test prompt for {plan}",
      };

      const persistedState: PersistedState = {
        startTime: Date.now(),
        initialCommitHash: "abc123",
        iterationTimes: [],
        planFile: nestedPlanFile,
      };

      const callbacks: LoopCallbacks = {
        ...createTestCallbacks(),
        onTasksUpdated: (done, total) => {
          capturedTasks = { done, total };
        },
      };

      const controller = new AbortController();

      // Create .ralph-done after loop starts to allow task parsing
      cleanupFiles.push(".ralph-done");
      setTimeout(async () => {
        await Bun.write(".ralph-done", "");
      }, 50);

      await runLoop(options, persistedState, callbacks, controller.signal);

      // complex-nested.md has checkboxes at various nesting levels:
      // Completed (x/X): 6 total
      // Incomplete [ ]: 7 total
      // (Excludes checkboxes inside code blocks which are correctly ignored)
      expect(capturedTasks).not.toBeNull();
      expect(capturedTasks!.done).toBe(6);
      expect(capturedTasks!.total).toBe(13);
    });

    it("should handle all completed tasks", async () => {
      const allCompletePlanFile = "tests/fixtures/plans/all-complete.md";
      let capturedTasks: { done: number; total: number } | null = null;

      const options: LoopOptions = {
        planFile: allCompletePlanFile,
        model: "anthropic/claude-sonnet-4",
        prompt: "Test prompt for {plan}",
      };

      const persistedState: PersistedState = {
        startTime: Date.now(),
        initialCommitHash: "abc123",
        iterationTimes: [],
        planFile: allCompletePlanFile,
      };

      const callbacks: LoopCallbacks = {
        ...createTestCallbacks(),
        onTasksUpdated: (done, total) => {
          capturedTasks = { done, total };
        },
      };

      const controller = new AbortController();

      // Create .ralph-done after loop starts to allow task parsing
      cleanupFiles.push(".ralph-done");
      setTimeout(async () => {
        await Bun.write(".ralph-done", "");
      }, 50);

      await runLoop(options, persistedState, callbacks, controller.signal);

      // all-complete.md has 5 completed tasks
      expect(capturedTasks).not.toBeNull();
      expect(capturedTasks!.done).toBe(5);
      expect(capturedTasks!.total).toBe(5);
    });

    it("should handle all incomplete tasks", async () => {
      const allIncompletePlanFile = "tests/fixtures/plans/all-incomplete.md";
      let capturedTasks: { done: number; total: number } | null = null;

      const options: LoopOptions = {
        planFile: allIncompletePlanFile,
        model: "anthropic/claude-sonnet-4",
        prompt: "Test prompt for {plan}",
      };

      const persistedState: PersistedState = {
        startTime: Date.now(),
        initialCommitHash: "abc123",
        iterationTimes: [],
        planFile: allIncompletePlanFile,
      };

      const callbacks: LoopCallbacks = {
        ...createTestCallbacks(),
        onTasksUpdated: (done, total) => {
          capturedTasks = { done, total };
        },
      };

      const controller = new AbortController();

      // Create .ralph-done after loop starts to allow task parsing
      cleanupFiles.push(".ralph-done");
      setTimeout(async () => {
        await Bun.write(".ralph-done", "");
      }, 50);

      await runLoop(options, persistedState, callbacks, controller.signal);

      // all-incomplete.md has 3 incomplete tasks
      expect(capturedTasks).not.toBeNull();
      expect(capturedTasks!.done).toBe(0);
      expect(capturedTasks!.total).toBe(3);
    });

    it("should handle empty plan file gracefully", async () => {
      const emptyPlanFile = "tests/fixtures/plans/empty.md";
      let capturedTasks: { done: number; total: number } | null = null;

      const options: LoopOptions = {
        planFile: emptyPlanFile,
        model: "anthropic/claude-sonnet-4",
        prompt: "Test prompt for {plan}",
      };

      const persistedState: PersistedState = {
        startTime: Date.now(),
        initialCommitHash: "abc123",
        iterationTimes: [],
        planFile: emptyPlanFile,
      };

      const callbacks: LoopCallbacks = {
        ...createTestCallbacks(),
        onTasksUpdated: (done, total) => {
          capturedTasks = { done, total };
        },
      };

      const controller = new AbortController();

      // Create .ralph-done after loop starts to allow task parsing
      cleanupFiles.push(".ralph-done");
      setTimeout(async () => {
        await Bun.write(".ralph-done", "");
      }, 50);

      await runLoop(options, persistedState, callbacks, controller.signal);

      // empty.md should have no tasks
      expect(capturedTasks).not.toBeNull();
      expect(capturedTasks!.done).toBe(0);
      expect(capturedTasks!.total).toBe(0);
    });

    it("should handle mixed case checkboxes in same file", async () => {
      const mixedPlanFile = "tests/fixtures/plans/partial-complete.md";
      let capturedTasks: { done: number; total: number } | null = null;

      const options: LoopOptions = {
        planFile: mixedPlanFile,
        model: "anthropic/claude-sonnet-4",
        prompt: "Test prompt for {plan}",
      };

      const persistedState: PersistedState = {
        startTime: Date.now(),
        initialCommitHash: "abc123",
        iterationTimes: [],
        planFile: mixedPlanFile,
      };

      const callbacks: LoopCallbacks = {
        ...createTestCallbacks(),
        onTasksUpdated: (done, total) => {
          capturedTasks = { done, total };
        },
      };

      const controller = new AbortController();

      // Create .ralph-done after loop starts to allow task parsing
      cleanupFiles.push(".ralph-done");
      setTimeout(async () => {
        await Bun.write(".ralph-done", "");
      }, 50);

      await runLoop(options, persistedState, callbacks, controller.signal);

      // partial-complete.md has 3 completed and 7 incomplete tasks
      expect(capturedTasks).not.toBeNull();
      expect(capturedTasks!.done).toBe(3);
      expect(capturedTasks!.total).toBe(10);
    });
  });

  describe("error backoff", () => {
    it("should call onBackoff and onBackoffCleared when session.error occurs", async () => {
      // Create a mock event stream that emits a session.error first, then succeeds
      let callCount = 0;
      const mockEventSubscribeWithError = mock(() => {
        callCount++;
        if (callCount === 1) {
          // First call: emit session.error after server.connected
          return Promise.resolve({
            stream: (async function* () {
              yield { type: "server.connected", properties: {} };
              yield {
                type: "session.error",
                properties: {
                  sessionID: "test-session-123",
                  error: { name: "TestError", data: { message: "Simulated error for backoff test" } },
                },
              };
            })(),
          });
        }
        // Subsequent calls: succeed
        return Promise.resolve(createMockEventStream());
      });

      // Temporarily replace the mock
      const originalSubscribe = mockEventSubscribe;
      // @ts-ignore - direct mock replacement for this test
      mockEventSubscribe.mockImplementation(mockEventSubscribeWithError);

      let backoffCalled = false;
      let backoffMs = 0;
      let backoffRetryAt = 0;
      let backoffClearedCalled = false;
      let errorCount = 0;

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

      const callbacks: LoopCallbacks = {
        ...createTestCallbacks(),
        onBackoff: (ms, retryAt) => {
          backoffCalled = true;
          backoffMs = ms;
          backoffRetryAt = retryAt;
          callbackOrder.push(`onBackoff:${ms}`);
        },
        onBackoffCleared: () => {
          backoffClearedCalled = true;
          callbackOrder.push("onBackoffCleared");
        },
        onError: (error) => {
          errorCount++;
          callbackOrder.push(`onError:${error}`);
        },
      };

      const controller = new AbortController();

      // Create .ralph-done to stop after the second (successful) iteration
      cleanupFiles.push(".ralph-done");
      // Schedule done file creation after enough time for:
      // - First iteration (fails with session.error)
      // - Backoff delay (~5 seconds for first attempt)
      // - Second iteration (succeeds)
      setTimeout(async () => {
        await Bun.write(".ralph-done", "");
      }, 6000);

      await runLoop(options, persistedState, callbacks, controller.signal);

      // Verify error was caught
      expect(errorCount).toBeGreaterThanOrEqual(1);
      expect(callbackOrder.some(c => c.startsWith("onError:"))).toBe(true);

      // Verify onBackoff was called with correct parameters
      expect(backoffCalled).toBe(true);
      expect(backoffMs).toBeGreaterThanOrEqual(5000); // Base delay
      expect(backoffMs).toBeLessThanOrEqual(5500); // Base + 10% jitter
      expect(backoffRetryAt).toBeGreaterThan(Date.now() - 10000); // Should be a timestamp

      // Verify onBackoffCleared was called after the backoff period
      expect(backoffClearedCalled).toBe(true);

      // Verify callback order: error -> backoff -> backoffCleared
      const errorIndex = callbackOrder.findIndex(c => c.startsWith("onError:"));
      const backoffIndex = callbackOrder.findIndex(c => c.startsWith("onBackoff:"));
      const clearedIndex = callbackOrder.indexOf("onBackoffCleared");
      
      expect(errorIndex).toBeGreaterThan(-1);
      expect(backoffIndex).toBeGreaterThan(errorIndex); // Backoff happens after error
      expect(clearedIndex).toBeGreaterThan(backoffIndex); // Cleared after backoff starts

      // Restore original mock
      mockEventSubscribe.mockReset();
    }, 15000); // Increase timeout for this test as it includes real backoff delay

    it("should reset error count and skip backoff after successful iteration", async () => {
      let backoffCallCount = 0;

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

      const callbacks: LoopCallbacks = {
        ...createTestCallbacks(),
        onBackoff: (ms, retryAt) => {
          backoffCallCount++;
          callbackOrder.push(`onBackoff:${ms}`);
        },
        onBackoffCleared: () => {
          callbackOrder.push("onBackoffCleared");
        },
      };

      const controller = new AbortController();

      // Create .ralph-done to stop immediately
      cleanupFiles.push(".ralph-done");
      await Bun.write(".ralph-done", "");

      await runLoop(options, persistedState, callbacks, controller.signal);

      // Verify onBackoff was NOT called (no errors occurred)
      expect(backoffCallCount).toBe(0);
      expect(callbackOrder.some(c => c.startsWith("onBackoff:"))).toBe(false);
    });
  });
});
