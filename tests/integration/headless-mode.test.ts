import { describe, it, expect, beforeEach, mock } from "bun:test";
import { runHeadlessMode } from "../../src/headless";

const mockRunLoop = mock(
  async (_options: any, _state: any, _callbacks: any, _signal: AbortSignal) => {}
);

const baseOptions = {
  planFile: "plan.md",
  model: "opencode/test",
  prompt: "test",
};

const baseState = {
  startTime: Date.now(),
  initialCommitHash: "abc123",
  iterationTimes: [],
  planFile: "plan.md",
};

describe("headless mode", () => {
  beforeEach(() => {
    mockRunLoop.mockReset();
  });

  it("returns 0 on complete", async () => {
    mockRunLoop.mockImplementation(async (_options, _state, callbacks) => {
      callbacks.onIterationStart(1);
      callbacks.onComplete();
    });

    const exitCode = await runHeadlessMode({
      loopOptions: { ...baseOptions },
      persistedState: { ...baseState },
      format: "json",
      timestamps: false,
    }, mockRunLoop);

    expect(exitCode).toBe(0);
  });

  it("returns 2 on pause", async () => {
    mockRunLoop.mockImplementation(async (_options, _state, callbacks) => {
      callbacks.onPause();
    });

    const exitCode = await runHeadlessMode({
      loopOptions: { ...baseOptions },
      persistedState: { ...baseState },
      format: "json",
      timestamps: false,
    }, mockRunLoop);

    expect(exitCode).toBe(2);
  });

  it("returns 3 when max-iterations exceeded", async () => {
    mockRunLoop.mockImplementation(async (_options, _state, callbacks) => {
      callbacks.onIterationStart(1);
      callbacks.onIterationStart(2);
    });

    const exitCode = await runHeadlessMode({
      loopOptions: { ...baseOptions },
      persistedState: { ...baseState },
      format: "json",
      timestamps: false,
      maxIterations: 1,
    }, mockRunLoop);

    expect(exitCode).toBe(3);
  });
});
