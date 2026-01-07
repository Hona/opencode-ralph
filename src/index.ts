#!/usr/bin/env bun
import yargs from "yargs";
import { hideBin } from "yargs/helpers";
import { acquireLock, releaseLock } from "./lock";
import { loadState, saveState, PersistedState, LoopOptions, trimEventsInPlace, LoopState, ToolEvent } from "./state";
import { confirm } from "./prompt";
import { getHeadHash, getDiffStats, getCommitsSince } from "./git";
import { startApp } from "./app";
import { runLoop } from "./loop";
import { initLog, log } from "./util/log";
import { readFileSync, existsSync } from "fs";
import { join } from "path";
import { homedir } from "os";

interface RalphConfig {
  model?: string;
  plan?: string;
  prompt?: string;
  promptFile?: string;
  server?: string;
  serverTimeout?: number;
  agent?: string;
  debug?: boolean;
}

function loadGlobalConfig(): RalphConfig {
  const configPath = join(homedir(), ".config", "ralph", "config.json");
  if (existsSync(configPath)) {
    try {
      const content = readFileSync(configPath, "utf-8");
      return JSON.parse(content) as RalphConfig;
    } catch {
      // Silently ignore invalid config
    }
  }
  return {};
}

const globalConfig = loadGlobalConfig();

// When run via the bin wrapper, RALPH_USER_CWD contains the user's actual working directory
// Change back to it so plan.md and other paths resolve correctly
const userCwd = process.env.RALPH_USER_CWD;
if (userCwd) {
  process.chdir(userCwd);
}

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
  
  // Tracking stats for logging
  let totalUpdatesQueued = 0;
  let totalFlushes = 0;
  let lastLogTime = Date.now();
  const LOG_INTERVAL_MS = 10000; // Log stats every 10 seconds

  function flush() {
    if (pendingUpdates.length === 0) return;
    
    const updates = pendingUpdates;
    const batchSize = updates.length;
    pendingUpdates = [];
    timeoutId = null;
    totalFlushes++;

    // Log batching stats periodically to avoid log spam
    const now = Date.now();
    if (now - lastLogTime >= LOG_INTERVAL_MS) {
      const avgBatchSize = totalFlushes > 0 ? (totalUpdatesQueued / totalFlushes).toFixed(1) : "0";
      log("batcher", "Batching stats", {
        totalUpdatesQueued,
        totalFlushes,
        avgBatchSize,
        currentBatchSize: batchSize,
      });
      lastLogTime = now;
    }

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
      totalUpdatesQueued++;
      
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
  // Add global error handlers early to catch any issues
  process.on("uncaughtException", (err) => {
    log("main", "UNCAUGHT EXCEPTION", { error: err.message, stack: err.stack });
    console.error("Uncaught:", err);
  });

  process.on("unhandledRejection", (reason) => {
    log("main", "UNHANDLED REJECTION", { reason: String(reason) });
    console.error("Unhandled rejection:", reason);
  });

  const argv = await yargs(hideBin(process.argv))
    .scriptName("ralph")
    .usage("$0 [options]")
    .option("plan", {
      alias: "p",
      type: "string",
      description: "Path to the plan file",
      default: globalConfig.plan || "plan.md",
    })
    .option("model", {
      alias: "m",
      type: "string",
      description: "Model to use (provider/model format)",
      default: globalConfig.model || "opencode/claude-opus-4-5",
    })
    .option("prompt", {
      type: "string",
      description: "Custom prompt template (use {plan} as placeholder)",
      default: globalConfig.prompt,
    })
    .option("prompt-file", {
      type: "string",
      description: "Path to prompt file",
      default: globalConfig.promptFile || ".ralph-prompt.md",
    })
    .option("reset", {
      alias: "r",
      type: "boolean",
      description: "Reset state and start fresh",
      default: false,
    })
    .option("server", {
      alias: "s",
      type: "string",
      description: "URL of existing OpenCode server to connect to",
      default: globalConfig.server,
    })
    .option("server-timeout", {
      type: "number",
      description: "Health check timeout in ms for external server",
      default: globalConfig.serverTimeout ?? 5000,
    })
    .option("agent", {
      alias: "a",
      type: "string",
      description: "Agent to use (e.g., 'build', 'plan', 'general')",
      default: globalConfig.agent,
    })
    .option("debug", {
      alias: "d",
      type: "boolean",
      description: "Debug mode - manual session creation",
      default: globalConfig.debug ?? false,
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
      promptFile: argv.promptFile,
      serverUrl: argv.server,
      serverTimeoutMs: argv.serverTimeout,
      agent: argv.agent,
      debug: argv.debug,
    };

// Create abort controller for cancellation
    const abortController = new AbortController();

    // Keep event loop alive on Windows - stdin.resume() doesn't keep Bun's event loop active
    // This interval ensures the process stays alive until explicitly exited
    const keepaliveInterval = setInterval(() => {}, 60000);

    // Task 4.3: Declare fallback timeout variable early so cleanup() can reference it
    let fallbackTimeout: ReturnType<typeof setTimeout> | undefined;

    // Cleanup function for graceful shutdown
    async function cleanup() {
      log("main", "cleanup() called");
      clearInterval(keepaliveInterval);
      if (fallbackTimeout) clearTimeout(fallbackTimeout); // Task 4.3: Clean up fallback timeout
      abortController.abort();
      await releaseLock();
      log("main", "cleanup() done");
    }

    // Fallback quit handler (useful if TUI key events fail)
    let quitRequested = false;
    async function requestQuit(source: string, payload?: unknown) {
      if (quitRequested) return;
      quitRequested = true;
      log("main", "Quit requested", { source, payload });
      await cleanup();
      process.exit(0);
    }

    // Task 4.3: Conditional stdin fallback for keyboard handling
    // OpenTUI expects exclusive control over stdin, so we DON'T add a handler by default.
    // However, if OpenTUI's keyboard handling fails (no events received within 5 seconds
    // of first user input attempt), we fall back to raw stdin as a last resort.
    // 
    // The fallback is only activated if:
    // 1. No keyboard events received from OpenTUI after startup
    // 2. A timeout has elapsed (indicating OpenTUI may not be working)
    //
    // Once OpenTUI keyboard events ARE received, the fallback is permanently disabled.
    let keyboardWorking = false;
    let fallbackEnabled = false;
    const KEYBOARD_FALLBACK_TIMEOUT_MS = 5000; // 5 seconds before enabling fallback
    
    const onKeyboardEvent = () => {
      // OpenTUI keyboard is working - disable any fallback
      keyboardWorking = true;
      log("main", "OpenTUI keyboard confirmed working, fallback disabled");
    };
    
    // Set up a delayed fallback that only activates if keyboard isn't working
    fallbackTimeout = setTimeout(() => {
      if (keyboardWorking) {
        log("main", "Keyboard working before timeout, no fallback needed");
        return;
      }
      
      // OpenTUI keyboard may not be working - enable fallback stdin handler
      fallbackEnabled = true;
      log("main", "Enabling fallback stdin handler (OpenTUI keyboard not detected)");
      
      // Set stdin to raw mode for single-keypress detection
      if (process.stdin.isTTY) {
        process.stdin.setRawMode(true);
      }
      process.stdin.resume();
      
      process.stdin.on("data", async (data: Buffer) => {
        // If OpenTUI keyboard started working, ignore fallback
        if (keyboardWorking) {
          return;
        }
        
        const char = data.toString();
        log("main", "Fallback stdin received", { char: char.replace(/\x03/g, "^C") });
        
        // Handle 'q' for quit
        if (char === "q" || char === "Q") {
          await requestQuit("fallback-stdin-q");
        }
        // Handle Ctrl+C (0x03)
        if (char === "\x03") {
          await requestQuit("fallback-stdin-ctrl-c");
        }
        // Handle 'p' for pause toggle
        if (char === "p" || char === "P") {
          log("main", "Fallback stdin: toggle pause");
          const PAUSE_FILE = ".ralph-pause";
          const file = Bun.file(PAUSE_FILE);
          const exists = await file.exists();
          if (exists) {
            const fs = await import("node:fs/promises");
            await fs.unlink(PAUSE_FILE);
          } else {
            await Bun.write(PAUSE_FILE, String(process.pid));
          }
        }
      });
    }, KEYBOARD_FALLBACK_TIMEOUT_MS);

    // Handle SIGINT (Ctrl+C) and SIGTERM signals for graceful shutdown
    process.on("SIGINT", async () => {
      log("main", "SIGINT received");
      await cleanup();
      log("main", "SIGINT cleanup done, exiting");
      process.exit(0);
    });

    process.on("SIGTERM", async () => {
      log("main", "SIGTERM received");
      await cleanup();
      log("main", "SIGTERM cleanup done, exiting");
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
      onKeyboardEvent, // Task 4.3: Callback to detect if OpenTUI keyboard is working
    });
    log("main", "TUI app started, state setters available");

    // Create batched updater for coalescing rapid state changes
    // Use 100ms debounce for better batching during high event throughput
    const batchedUpdater = createBatchStateUpdater(stateSetters.setState, 100);

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

    // In debug mode, skip automatic loop start - set state to idle and wait
    if (loopOptions.debug) {
      log("main", "Debug mode: skipping automatic loop start, setting state to idle");
      stateSetters.setState((prev) => ({
        ...prev,
        status: "idle",    // Idle status for debug mode
        iteration: 0,      // No iteration running yet
        isIdle: true,      // Waiting for user input
      }));
      // Don't start the loop - wait for user to manually create sessions
      await exitPromise;
      log("main", "Debug mode: exit received, cleaning up");
      return;
    }

    // Start the loop in parallel with callbacks wired to app state
    log("main", "Starting loop");
    runLoop(loopOptions, stateToUse, {
      onIterationStart: (iteration) => {
        log("main", "onIterationStart", { iteration });
        stateSetters.setState((prev) => ({
          ...prev,
          status: "running",
          iteration,
        }));
      },
      onEvent: (event) => {
        // Debounce event updates to batch rapid events within 50ms window
        // Mutate existing array in-place to avoid allocations
        batchedUpdater.queueUpdate((prev) => {
          // For tool events, ensure spinner stays at the end of the array
          if (event.type === "tool") {
            // Find and remove spinner temporarily
            const spinnerIndex = prev.events.findIndex((e) => e.type === "spinner");
            let spinner: typeof event | undefined;
            if (spinnerIndex !== -1) {
              spinner = prev.events.splice(spinnerIndex, 1)[0];
            }
            // Add the tool event
            prev.events.push(event);
            // Re-add spinner at the end
            if (spinner) {
              prev.events.push(spinner);
            }
          } else {
            prev.events.push(event);
          }
          trimEventsInPlace(prev.events);
          return { events: prev.events };
        });
      },
      onIterationComplete: (iteration, duration, commits) => {
        // Mutate the separator event in-place and remove spinner
        stateSetters.setState((prev) => {
          for (const event of prev.events) {
            if (event.type === "separator" && event.iteration === iteration) {
              event.duration = duration;
              event.commitCount = commits;
              break;
            }
          }
          // Remove spinner event for this iteration
          const spinnerIndex = prev.events.findIndex(
            (e) => e.type === "spinner" && e.iteration === iteration
          );
          if (spinnerIndex !== -1) {
            prev.events.splice(spinnerIndex, 1);
          }
          // Return same events array reference - mutation is sufficient to trigger re-render
          return { ...prev };
        });
        // Update persisted state with the new iteration time
        stateToUse.iterationTimes.push(duration);
        saveState(stateToUse);
        // Update the iteration times in the app for ETA calculation
        stateSetters.updateIterationTimes([...stateToUse.iterationTimes]);
      },
      onTasksUpdated: (done, total) => {
        log("main", "onTasksUpdated", { done, total });
        stateSetters.setState((prev) => ({
          ...prev,
          tasksComplete: done,
          totalTasks: total,
        }));
      },
      onCommitsUpdated: (commits) => {
        // Debounce commits updates - these can lag slightly for better batching
        batchedUpdater.queueUpdate(() => ({
          commits,
        }));
      },
      onDiffUpdated: (added, removed) => {
        // Debounce diff updates - these can lag slightly for better batching
        batchedUpdater.queueUpdate(() => ({
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
      onIdleChanged: (isIdle) => {
        // Update isIdle state for idle mode optimization
        stateSetters.setState((prev) => ({
          ...prev,
          isIdle,
        }));
      },
      onSessionCreated: (session) => {
        // Store session info in state for steering mode
        stateSetters.setState((prev) => ({
          ...prev,
          sessionId: session.sessionId,
          serverUrl: session.serverUrl,
          attached: session.attached,
        }));
        // Store sendMessage function for steering overlay
        stateSetters.setSendMessage(session.sendMessage);
      },
      onSessionEnded: (_sessionId) => {
        // Clear session fields when session ends
        stateSetters.setState((prev) => ({
          ...prev,
          sessionId: undefined,
          serverUrl: undefined,
          attached: undefined,
        }));
        // Clear sendMessage function
        stateSetters.setSendMessage(null);
      },
      onBackoff: (backoffMs, retryAt) => {
        // Update state with backoff info for retry countdown display
        stateSetters.setState((prev) => ({
          ...prev,
          errorBackoffMs: backoffMs,
          errorRetryAt: retryAt,
        }));
      },
      onBackoffCleared: () => {
        // Clear backoff fields when retry begins
        stateSetters.setState((prev) => ({
          ...prev,
          errorBackoffMs: undefined,
          errorRetryAt: undefined,
        }));
      },
      onTokens: (tokens) => {
        // Accumulate token usage for footer display
        batchedUpdater.queueUpdate((prev) => {
          const existing = prev.tokens || {
            input: 0,
            output: 0,
            reasoning: 0,
            cacheRead: 0,
            cacheWrite: 0,
          };
          return {
            tokens: {
              input: existing.input + tokens.input,
              output: existing.output + tokens.output,
              reasoning: existing.reasoning + tokens.reasoning,
              cacheRead: existing.cacheRead + tokens.cacheRead,
              cacheWrite: existing.cacheWrite + tokens.cacheWrite,
            },
          };
        });
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
    log("main", "FINALLY BLOCK ENTERED");
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
