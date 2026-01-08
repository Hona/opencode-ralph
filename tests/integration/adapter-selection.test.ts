import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { TempDir, cleanupRalphFiles } from "../helpers/temp-files";
import { getHeadHash } from "../../src/git";
import { getAdapter, registerAdapter } from "../../src/adapters/registry";

const fakeAdapter = {
  name: "fake",
  displayName: "Fake Adapter",
  mode: "pty" as const,
  isAvailable: async () => true,
  execute: async () => ({
    events: (async function* () {
      yield { type: "output", data: "hello" };
      yield { type: "exit", code: 0 };
    })(),
    send: (_input: string) => {},
    abort: () => {},
    done: Promise.resolve({ exitCode: 0 }),
  }),
};

const { runLoop } = await import("../../src/loop.js");

describe("adapter selection", () => {
  const tempDir = new TempDir();

  beforeEach(async () => {
    await tempDir.create();
    await cleanupRalphFiles();
  });

  afterEach(async () => {
    await tempDir.cleanup();
    await cleanupRalphFiles();
  });

  it("routes PTY adapter output through onRawOutput", async () => {
    const controller = new AbortController();
    let output = "";
    let adapterMode: string | undefined;
    const planFile = await tempDir.write("plan.md", "- [ ] task\n");
    const initialCommitHash = await getHeadHash();

    if (!getAdapter("fake")) {
      registerAdapter(fakeAdapter as any);
    }

    await runLoop(
      {
        planFile,
        model: "opencode/test",
        prompt: "test",
        adapter: "fake",
      },
      {
        startTime: Date.now(),
        initialCommitHash,
        iterationTimes: [],
        planFile,
      },
      {
        onIterationStart: () => {},
        onEvent: () => {},
        onIterationComplete: () => {
          controller.abort();
        },
        onTasksUpdated: () => {},
        onCommitsUpdated: () => {},
        onDiffUpdated: () => {},
        onPause: () => {},
        onResume: () => {},
        onComplete: () => {},
        onError: () => {},
        onIdleChanged: () => {},
        onRawOutput: (data) => {
          output += data;
        },
        onAdapterModeChanged: (mode) => {
          adapterMode = mode;
        },
      },
      controller.signal
    );

    expect(output).toBe("hello");
    expect(adapterMode).toBe("pty");
  });
});
