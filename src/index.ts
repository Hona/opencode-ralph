#!/usr/bin/env bun
import yargs from "yargs";
import { hideBin } from "yargs/helpers";
import { acquireLock, releaseLock } from "./lock";
import { loadState, saveState, PersistedState, LoopOptions } from "./state";
import { confirm } from "./prompt";
import { getHeadHash } from "./git";
import { startApp } from "./app";
import { runLoop } from "./loop";

const argv = await yargs(hideBin(process.argv))
  .scriptName("ralph")
  .usage("$0 [options]")
  .option("plan", {
    alias: "p",
    type: "string",
    description: "Path to the plan file",
    default: "plan.md",
  })
  .option("model", {
    alias: "m",
    type: "string",
    description: "Model to use (provider/model format)",
    default: "opencode/claude-opus-4-5",
  })
  .option("prompt", {
    type: "string",
    description: "Custom prompt template (use {plan} as placeholder)",
  })
  .option("reset", {
    alias: "r",
    type: "boolean",
    description: "Reset state and start fresh",
    default: false,
  })
  .help()
  .alias("h", "help")
  .version(false)
  .strict()
  .parse();

// Acquire lock to prevent multiple instances
const lockAcquired = await acquireLock();
if (!lockAcquired) {
  console.error("Another ralph instance is running");
  process.exit(1);
}

// Load existing state if present
const existingState = await loadState();

// Determine the state to use after confirmation prompts
let stateToUse: PersistedState | null = null;
let shouldReset = argv.reset;

if (existingState && !shouldReset) {
  if (existingState.planFile === argv.plan) {
    // Same plan file - ask to continue
    const continueRun = await confirm("Continue previous run?");
    if (continueRun) {
      stateToUse = existingState;
    } else {
      shouldReset = true;
    }
  } else {
    // Different plan file - ask to reset
    const resetForNewPlan = await confirm("Reset state for new plan?");
    if (resetForNewPlan) {
      shouldReset = true;
    } else {
      // User chose not to reset - exit gracefully
      console.log("Exiting without changes.");
      await releaseLock();
      process.exit(0);
    }
  }
}

// Create fresh state if needed
if (!stateToUse) {
  const headHash = await getHeadHash();
  stateToUse = {
    startTime: Date.now(),
    initialCommitHash: headHash,
    iterationTimes: [],
    planFile: argv.plan,
  };
  await saveState(stateToUse);
}

// Create LoopOptions from CLI arguments
const loopOptions: LoopOptions = {
  planFile: argv.plan,
  model: argv.model,
  prompt: argv.prompt || "",
};

// Create abort controller for cancellation
const abortController = new AbortController();

// Start the TUI app and get state setters
const { exitPromise, stateSetters } = startApp({
  options: loopOptions,
  persistedState: stateToUse,
  onQuit: () => {
    abortController.abort();
  },
});

// Start the loop in parallel - callbacks will be wired up in task 11.7
// For now, we just start the loop without full callback wiring
runLoop(loopOptions, stateToUse, {
  onIterationStart: (_iteration) => {
    // TODO: Wire up in 11.7
  },
  onEvent: (_event) => {
    // TODO: Wire up in 11.7
  },
  onIterationComplete: (_iteration, _duration, _commits) => {
    // TODO: Wire up in 11.7
  },
  onTasksUpdated: (_done, _total) => {
    // TODO: Wire up in 11.7
  },
  onCommitsUpdated: (_commits) => {
    // TODO: Wire up in 11.7
  },
  onPause: () => {
    // TODO: Wire up in 11.7
  },
  onResume: () => {
    // TODO: Wire up in 11.7
  },
  onComplete: () => {
    // TODO: Wire up in 11.7
  },
  onError: (_error) => {
    // TODO: Wire up in 11.7
  },
}, abortController.signal).catch((error) => {
  console.error("Loop error:", error);
});

// Wait for the app to exit
await exitPromise;
