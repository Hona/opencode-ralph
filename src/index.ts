#!/usr/bin/env bun
import yargs from "yargs";
import { hideBin } from "yargs/helpers";
import { extend } from "@opentui/core";
import { acquireLock, releaseLock } from "./lock";
import { loadState, saveState, PersistedState, LoopOptions, trimEventsInPlace, LoopState } from "./state";
import { confirm } from "./prompt";
import { getHeadHash, getDiffStats, getCommitsSince } from "./git";
import { startApp } from "./app";
import { runLoop } from "./loop";
import { runHeadlessMode } from "./headless";
import { initLog, log } from "./util/log";
import { readFileSync, existsSync } from "fs";
import { join } from "path";
import { homedir } from "os";

async function registerGhosttyTerminal(): Promise<void> {
  try {
    const module = await import("ghostty-opentui/terminal-buffer");
    const GhosttyTerminalRenderable = module.GhosttyTerminalRenderable;
    extend({ "ghostty-terminal": GhosttyTerminalRenderable });
  } catch (error) {
    throw new Error(`ghostty-opentui not available: ${String(error)}`);
  }
}

function assertPtySupport(): void {
  const bunVersion = process.versions.bun;
  if (!bunVersion) return;

  const required = process.platform === "win32" ? "1.1.0" : "1.0.0";
  if (!isVersionAtLeast(bunVersion, required)) {
    throw new Error(`Bun ${required}+ is required for PTY adapters (detected ${bunVersion}).`);
  }
}

function isVersionAtLeast(current: string, required: string): boolean {
  const parse = (value: string) => value.split(".").map((part) => Number(part.replace(/\D/g, "")));
  const [cMajor = 0, cMinor = 0, cPatch = 0] = parse(current);
  const [rMajor = 0, rMinor = 0, rPatch = 0] = parse(required);

  if (cMajor !== rMajor) return cMajor > rMajor;
  if (cMinor !== rMinor) return cMinor > rMinor;
  return cPatch >= rPatch;
}

// Version is injected at build time via Bun's define
declare const RALPH_VERSION: string | undefined;

// In dev mode, fall back to reading from package.json
const version: string =
  typeof RALPH_VERSION !== "undefined"
    ? RALPH_VERSION
    : JSON.parse(readFileSync(join(import.meta.dir, "../package.json"), "utf-8")).version + "-dev";

interface RalphConfig {
  adapter?: string;
  model?: string;
  plan?: string;
  prompt?: string;
  promptFile?: string;
  server?: string;
  serverTimeout?: number;
  agent?: string;
  headless?: boolean;
  format?: string;
  timestamps?: boolean;
  yes?: boolean;
  autoReset?: boolean;
  maxIterations?: number;
  maxTime?: number;
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
    .option("headless", {
      alias: "H",
      type: "boolean",
      description: "Run without the TUI (CI-friendly output)",
      default: globalConfig.headless ?? false,
    })
    .option("plan", {
      alias: "p",
      type: "string",
      description: "Path to the plan file",
      default: globalConfig.plan || "plan.md",
    })
    .option("adapter", {
      type: "string",
      description: "Adapter to use (opencode-server, opencode-run, codex)",
      default: globalConfig.adapter || "opencode-server",
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
    .option("yes", {
      type: "boolean",
      description: "Auto-confirm prompts",
      default: globalConfig.yes ?? false,
    })
    .option("auto-reset", {
      type: "boolean",
      description: "Auto-reset when prompts cannot be shown (use --no-auto-reset to disable)",
      default: globalConfig.autoReset ?? true,
    })
    .option("format", {
      type: "string",
      description: "Headless output format (text, jsonl, json)",
      choices: ["text", "jsonl", "json"],
      default: globalConfig.format || "text",
    })
    .option("timestamps", {
      type: "boolean",
      description: "Include timestamps in headless output",
      default: globalConfig.timestamps ?? false,
    })
    .option("max-iterations", {
      type: "number",
      description: "Maximum iterations before aborting (headless)",
      default: globalConfig.maxIterations,
    })
    .option("max-time", {
      type: "number",
      description: "Maximum time in seconds before aborting (headless)",
      default: globalConfig.maxTime,
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
    .help("h")
    .version(version)
    .alias("v", "version")
    .strict()
    .parse();

  // Acquire lock to prevent multiple instances
  const lockAcquired = await acquireLock();
  if (!lockAcquired) {
    console.error("Another ralph instance is running");
    process.exitCode = 1;
    return;
  }

  let exitCode = 0;

  try {
    // Load existing state if present
    const existingState = await loadState();
    
    // Log whether state was found (before initLog, so use console)
    if (existingState) {
      console.log(`Found existing state: ${existingState.iterationTimes.length} iterations, started at ${new Date(existingState.startTime).toISOString()}`);
    } else {
      console.log("No existing state found, will create fresh state");
    }

    const autoYes = argv.yes || argv.headless;
    const canPrompt = process.stdin.isTTY && !autoYes;

    // Determine the state to use after confirmation prompts
    let stateToUse: PersistedState | null = null;
    let shouldReset = argv.reset;

    if (existingState && !shouldReset) {
      const samePlan = existingState.planFile === argv.plan;

      if (autoYes) {
        if (samePlan) {
          stateToUse = existingState;
        } else {
          shouldReset = true;
        }
      } else if (!canPrompt) {
        if (argv.autoReset) {
          console.log("No TTY available for prompt; auto-resetting.");
          shouldReset = true;
        } else {
          console.error("No TTY available for prompt and --no-auto-reset set. Exiting.");
          exitCode = 2;
          return;
        }
      } else if (samePlan) {
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
          return;
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
      adapter: argv.adapter,
      agent: argv.agent,
      debug: argv.debug,
    };

    let adapterMode: "sdk" | "pty" =
      loopOptions.adapter && loopOptions.adapter !== "opencode-server" ? "pty" : "sdk";

    if (adapterMode === "pty") {
      try {
        assertPtySupport();
      } catch (error) {
        exitCode = 1;
        console.error(error instanceof Error ? error.message : String(error));
        return;
      }
    }

    if (argv.headless) {
      exitCode = await runHeadlessMode({
        loopOptions,
        persistedState: stateToUse,
        format: argv.format,
        timestamps: argv.timestamps,
        maxIterations: argv.maxIterations,
        maxTime: argv.maxTime,
      });
      return;
    }

    if (adapterMode === "pty") {
      try {
        await registerGhosttyTerminal();
      } catch (error) {
        exitCode = 1;
        console.error(error instanceof Error ? error.message : String(error));
        return;
      }
    }

// Create abort controller for cancellation
    const abortController = new AbortController();

    // Keep event loop alive on Windows - stdin.resume() doesn't keep Bun's event loop active
    // This interval ensures the process stays alive until explicitly exited
    const keepaliveInterval = setInterval(() => {}, 60000);

    // Task 4.3: Declare fallback timeout variable early so cleanup() can reference it
    let fallbackTimeout: ReturnType<typeof setTimeout> | undefined;
    // Phase 3.3: Declare fallback raw mode flag early so cleanup() can reference it
    let fallbackRawModeEnabled = false;

    // Cleanup function for graceful shutdown
    async function cleanup() {
      log("main", "cleanup() called");
      clearInterval(keepaliveInterval);
      if (fallbackTimeout) clearTimeout(fallbackTimeout); // Task 4.3: Clean up fallback timeout
      // Phase 3.3: Restore raw mode if fallback enabled it
      if (fallbackRawModeEnabled && process.stdin.isTTY) {
        try {
          process.stdin.setRawMode(false);
          log("main", "Raw mode restored to normal during cleanup");
        } catch {
          // Ignore errors - stdin may already be closed
        }
      }
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
    // Once OpenTUI keyboard events ARE received, the fallback is permanently disabled
    // AND the stdin listener is removed to prevent any double-handling.
    let keyboardWorking = false;
    let fallbackEnabled = false;
    let fallbackFirstKeyLogged = false; // Phase 1.2: Only log first fallback key to avoid spam
    let fallbackStdinHandler: ((data: Buffer) => Promise<void>) | null = null;
    const KEYBOARD_FALLBACK_TIMEOUT_MS = 5000; // 5 seconds before enabling fallback
    
    /**
     * Permanently disable the fallback stdin handler.
     * Called when OpenTUI keyboard is confirmed working.
     */
    const disableFallbackHandler = () => {
      if (fallbackStdinHandler && fallbackEnabled) {
        process.stdin.off("data", fallbackStdinHandler);
        fallbackStdinHandler = null;
        fallbackEnabled = false;
        // Phase 3.3: Restore raw mode if we enabled it
        if (fallbackRawModeEnabled && process.stdin.isTTY) {
          process.stdin.setRawMode(false);
          fallbackRawModeEnabled = false;
          log("main", "Raw mode restored to normal");
        }
        log("main", "Fallback stdin handler removed - OpenTUI has exclusive keyboard control");
      }
    };
    
    const onKeyboardEvent = () => {
      // OpenTUI keyboard is working - disable any fallback permanently
      keyboardWorking = true;
      log("main", "OpenTUI keyboard confirmed working, disabling fallback");
      disableFallbackHandler();
    };
    
    // Set up a delayed fallback that only activates if keyboard isn't working
    fallbackTimeout = setTimeout(() => {
      if (keyboardWorking) {
        log("main", "Keyboard working before timeout, no fallback needed");
        return;
      }
      
      // OpenTUI keyboard may not be working - enable fallback stdin handler
      fallbackEnabled = true;
      log("main", "Enabling fallback stdin handler (OpenTUI keyboard not detected after 5s)");
      
      // Set stdin to raw mode for single-keypress detection
      if (process.stdin.isTTY) {
        process.stdin.setRawMode(true);
        fallbackRawModeEnabled = true; // Phase 3.3: Track raw mode for cleanup
      }
      process.stdin.resume();
      
      // Create and store the handler so we can remove it later
      fallbackStdinHandler = async (data: Buffer) => {
        // If OpenTUI keyboard started working, ignore this event
        // (handler will be removed shortly by disableFallbackHandler)
        if (keyboardWorking) {
          return;
        }
        
        const char = data.toString();
        // Phase 1.2: Only log first fallback key to avoid spam
        if (!fallbackFirstKeyLogged) {
          fallbackFirstKeyLogged = true;
          log("main", "First fallback stdin key event", { 
            char: char.replace(/\x03/g, "^C"),
          });
        }
        
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
      };
      
      process.stdin.on("data", fallbackStdinHandler);
    }, KEYBOARD_FALLBACK_TIMEOUT_MS);

    // Handle SIGINT (Ctrl+C) and SIGTERM signals for graceful shutdown
    // NOTE: When stdin is in raw mode, Ctrl+C sends 0x03 character instead of SIGINT.
    // SIGINT will still fire if something else sends the signal (e.g., kill -INT).
    process.on("SIGINT", async () => {
      if (quitRequested) {
        log("main", "SIGINT received but quit already requested, ignoring");
        return;
      }
      log("main", "SIGINT received");
      await requestQuit("SIGINT");
    });

    process.on("SIGTERM", async () => {
      if (quitRequested) {
        log("main", "SIGTERM received but quit already requested, ignoring");
        return;
      }
      log("main", "SIGTERM received");
      await requestQuit("SIGTERM");
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
    const MAX_TERMINAL_BUFFER = 20000;

    stateSetters.setState((prev) => ({
      ...prev,
      adapterMode,
    }));

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

    // In debug mode, skip automatic loop start - set state to ready and wait
    if (loopOptions.debug) {
      log("main", "Debug mode: skipping automatic loop start, setting state to ready");
      stateSetters.setState((prev) => ({
        ...prev,
        status: "ready",   // Ready status for debug mode
        iteration: 0,      // No iteration running yet
        isIdle: true,      // Waiting for user input
      }));
      // Don't start the loop - wait for user to manually create sessions
      await exitPromise;
      log("main", "Debug mode: exit received, cleaning up");
      return;
    }

    // Start in ready state - create pause file and set initial state
    // User must press 'p' to begin the loop
    const PAUSE_FILE = ".ralph-pause";
    await Bun.write(PAUSE_FILE, String(process.pid));
    stateSetters.setState((prev) => ({
      ...prev,
      status: "ready",
    }));
    log("main", "Starting in ready state - press 'p' to begin");

    // Start the loop in parallel with callbacks wired to app state
    log("main", "Starting loop (paused)");
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
      onRawOutput: (data) => {
        batchedUpdater.queueUpdate((prev) => {
          const existing = prev.terminalBuffer || "";
          let next = existing + data;
          if (next.length > MAX_TERMINAL_BUFFER) {
            next = next.slice(-MAX_TERMINAL_BUFFER);
          }
          return { terminalBuffer: next };
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
        // Reset tokens to zero for new session (fresh token tracking per session)
        const isPty = adapterMode === "pty";
        stateSetters.setState((prev) => ({
          ...prev,
          sessionId: isPty ? undefined : session.sessionId,
          serverUrl: isPty ? undefined : session.serverUrl,
          attached: isPty ? undefined : session.attached,
          tokens: undefined, // Reset token counters on session start
        }));
        // Store sendMessage function for steering overlay
        stateSetters.setSendMessage(session.sendMessage);
      },
      onSessionEnded: (_sessionId) => {
        // Clear session fields when session ends
        // Also clear token display when no active session
        stateSetters.setState((prev) => ({
          ...prev,
          sessionId: undefined,
          serverUrl: undefined,
          attached: undefined,
          tokens: undefined, // Clear token display when session ends
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
      onAdapterModeChanged: (mode) => {
        adapterMode = mode;
        stateSetters.setState((prev) => ({
          ...prev,
          adapterMode: mode,
          terminalBuffer: mode === "pty" ? "" : prev.terminalBuffer,
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
  } catch (error) {
    exitCode = 1;
    log("main", "ERROR in main", { error: error instanceof Error ? error.message : String(error) });
    console.error("Error:", error instanceof Error ? error.message : String(error));
  } finally {
    log("main", "FINALLY BLOCK ENTERED");
    await releaseLock();
    log("main", "Lock released");
    process.exitCode = exitCode;
  }
}

// Error handling wrapper for the main function
main().catch((error) => {
  console.error("Error:", error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
