#!/usr/bin/env bun
import yargs from "yargs";
import { hideBin } from "yargs/helpers";
import { acquireLock, releaseLock } from "./lock";
import { loadState, saveState, PersistedState, LoopOptions, trimEvents, LoopState, ToolEvent } from "./state";
import { confirm } from "./prompt";
import { getHeadHash, getDiffStats, getCommitsSince } from "./git";
import { startApp } from "./app";
import { runLoop } from "./loop";
import { initLog, log } from "./util/log";

/**
 * Creates a batched state updater that coalesces rapid setState calls.
 * Updates arriving within the debounce window are merged and applied together.
 */
function createBatchStateUpdater(
  setState: (updater: (prev: LoopState) => LoopState) => void,
  debounceMs: number = 50
) {
  let pendingUpdates: Array<(prev: LoopState) => Partial<LoopState>> = [];
  let timeoutId: ReturnType<typeof setTimeout> | null = null;

  function flush() {
    if (pendingUpdates.length === 0) return;
    
    const updates = pendingUpdates;
    pendingUpdates = [];
    timeoutId = null;

    // Apply all pending updates in a single setState call
    setState((prev) => {
      let current = prev;
      for (const update of updates) {
        current = { ...current, ...update(current) };
      }
      return current;
    });
  }

  return {
    /**
     * Queue a partial state update to be batched with other updates.
     */
    queueUpdate(updater: (prev: LoopState) => Partial<LoopState>) {
      pendingUpdates.push(updater);
      
      if (timeoutId === null) {
        timeoutId = setTimeout(flush, debounceMs);
      }
    },
    
    /**
     * Immediately flush all pending updates without waiting for debounce.
     * Use for updates that need immediate feedback (iteration start/complete).
     */
    flushNow() {
      if (timeoutId !== null) {
        clearTimeout(timeoutId);
      }
      flush();
    }
  };
}

async function main() {
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

  try {
    // Load existing state if present
    const existingState = await loadState();
    
    // Log whether state was found (before initLog, so use console)
    if (existingState) {
      console.log(`Found existing state: ${existingState.iterationTimes.length} iterations, started at ${new Date(existingState.startTime).toISOString()}`);
    } else {
      console.log("No existing state found, will create fresh state");
    }

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

    // Initialize logging (reset log when state is reset)
    const isNewRun = !stateToUse;
    initLog(isNewRun);
    log("main", "Ralph starting", { plan: argv.plan, model: argv.model, reset: shouldReset });
    
    // Create fresh state if needed
    if (!stateToUse) {
      log("main", "Creating fresh state");
      const headHash = await getHeadHash();
      stateToUse = {
        startTime: Date.now(),
        initialCommitHash: headHash,
        iterationTimes: [],
        planFile: argv.plan,
      };
      await saveState(stateToUse);
    } else {
      log("main", "Resuming existing state", { iterations: stateToUse.iterationTimes.length });
    }

    // Create LoopOptions from CLI arguments
    const loopOptions: LoopOptions = {
      planFile: argv.plan,
      model: argv.model,
      prompt: argv.prompt || "",
    };

    // Create abort controller for cancellation
    const abortController = new AbortController();

    // Cleanup function for graceful shutdown
    async function cleanup() {
      abortController.abort();
      await releaseLock();
    }

    // Handle SIGINT (Ctrl+C) and SIGTERM signals for graceful shutdown
    process.on("SIGINT", async () => {
      await cleanup();
      process.exit(0);
    });

    process.on("SIGTERM", async () => {
      await cleanup();
      process.exit(0);
    });

    // Start the TUI app and get state setters
    log("main", "Starting TUI app");
    const { exitPromise, stateSetters } = await startApp({
      options: loopOptions,
      persistedState: stateToUse,
      onQuit: () => {
        log("main", "onQuit callback triggered");
        abortController.abort();
      },
    });
    log("main", "TUI app started, state setters available");

    // Create batched updater for coalescing rapid state changes
    const batchedUpdater = createBatchStateUpdater(stateSetters.setState, 50);

    // Fetch initial diff stats and commits on resume
    const initialDiff = await getDiffStats(stateToUse.initialCommitHash);
    const initialCommits = await getCommitsSince(stateToUse.initialCommitHash);
    stateSetters.setState((prev) => ({
      ...prev,
      linesAdded: initialDiff.added,
      linesRemoved: initialDiff.removed,
      commits: initialCommits,
    }));
    log("main", "Initial stats loaded", { diff: initialDiff, commits: initialCommits });

    // Start the loop in parallel with callbacks wired to app state
    log("main", "Starting loop");
    runLoop(loopOptions, stateToUse, {
      onIterationStart: (iteration) => {
        // Update state.iteration and status to running
        stateSetters.setState((prev) => ({
          ...prev,
          status: "running",
          iteration,
        }));
      },
      onEvent: (event) => {
        // Debounce event updates to batch rapid events within 50ms window
        batchedUpdater.queueUpdate((prev) => ({
          events: trimEvents([...prev.events, event]),
        }));
      },
      onIterationComplete: (iteration, duration, commits) => {
        // Update the separator event for this iteration with duration/commits
        stateSetters.setState((prev) => ({
          ...prev,
          events: prev.events.map((event) =>
            event.type === "separator" && event.iteration === iteration
              ? { ...event, duration, commitCount: commits }
              : event
          ),
        }));
        // Update persisted state with the new iteration time
        stateToUse.iterationTimes.push(duration);
        saveState(stateToUse);
        // Update the iteration times in the app for ETA calculation
        stateSetters.updateIterationTimes([...stateToUse.iterationTimes]);
      },
      onTasksUpdated: (done, total) => {
        // Update state.tasksComplete and state.totalTasks
        stateSetters.setState((prev) => ({
          ...prev,
          tasksComplete: done,
          totalTasks: total,
        }));
      },
      onCommitsUpdated: (commits) => {
        // Update state.commits
        stateSetters.setState((prev) => ({
          ...prev,
          commits,
        }));
      },
      onDiffUpdated: (added, removed) => {
        // Update state.linesAdded and state.linesRemoved
        stateSetters.setState((prev) => ({
          ...prev,
          linesAdded: added,
          linesRemoved: removed,
        }));
      },
      onPause: () => {
        // Update state.status to "paused"
        stateSetters.setState((prev) => ({
          ...prev,
          status: "paused",
        }));
      },
      onResume: () => {
        // Update state.status to "running"
        stateSetters.setState((prev) => ({
          ...prev,
          status: "running",
        }));
      },
      onComplete: () => {
        // Update state.status to "complete"
        stateSetters.setState((prev) => ({
          ...prev,
          status: "complete",
        }));
      },
      onError: (error) => {
        // Update state.status to "error" and set state.error
        stateSetters.setState((prev) => ({
          ...prev,
          status: "error",
          error,
        }));
      },
    }, abortController.signal).catch((error) => {
      log("main", "Loop error", { error: error instanceof Error ? error.message : String(error) });
      console.error("Loop error:", error);
    });

    // Wait for the app to exit, then cleanup
    log("main", "Waiting for exit");
    await exitPromise;
    log("main", "Exit received, cleaning up");
  } finally {
    await releaseLock();
    log("main", "Lock released, exiting process");
    process.exit(0);
  }
}

// Error handling wrapper for the main function
main().catch((error) => {
  console.error("Error:", error instanceof Error ? error.message : String(error));
  // Attempt to release lock even if main crashed
  releaseLock().finally(() => {
    process.exit(1);
  });
});
