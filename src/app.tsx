import { render, useKeyboard, useRenderer } from "@opentui/solid";
import type { KeyEvent } from "@opentui/core";
import { createSignal, onCleanup, Setter } from "solid-js";
import { Header } from "./components/header";
import { Log } from "./components/log";
import { Footer } from "./components/footer";
import { PausedOverlay } from "./components/paused";
import type { LoopState, LoopOptions, PersistedState } from "./state";
import { colors } from "./components/colors";
import { calculateEta } from "./util/time";
import { log } from "./util/log";

type AppProps = {
  options: LoopOptions;
  persistedState: PersistedState;
  onQuit: () => void;
  iterationTimesRef?: number[];
  onKeyboardEvent?: () => void; // Called when first keyboard event is received
};

/**
 * State setters returned from startApp to allow external state updates.
 */
export type AppStateSetters = {
  setState: Setter<LoopState>;
  updateIterationTimes: (times: number[]) => void;
};

/**
 * Result of starting the app - contains both the exit promise and state setters.
 */
export type StartAppResult = {
  exitPromise: Promise<void>;
  stateSetters: AppStateSetters;
};

// Module-level state setters that will be populated when App renders
let globalSetState: Setter<LoopState> | null = null;
let globalUpdateIterationTimes: ((times: number[]) => void) | null = null;



/**
 * Main App component with state signals.
 * Manages LoopState and elapsed time, rendering the full TUI layout.
 */
/**
 * Props for starting the app, including optional keyboard detection callback.
 */
export type StartAppProps = {
  options: LoopOptions;
  persistedState: PersistedState;
  onQuit: () => void;
  onKeyboardEvent?: () => void; // Called once when first keyboard event is received
};

/**
 * Starts the TUI application and returns a promise that resolves when the app exits,
 * along with state setters for external updates.
 *
 * @param props - The application props including options, persisted state, and quit handler
 * @returns Promise<StartAppResult> with exitPromise and stateSetters
 */
export async function startApp(props: StartAppProps): Promise<StartAppResult> {
  // Create a mutable reference to iteration times that can be updated externally
  let iterationTimesRef = [...props.persistedState.iterationTimes];
  
  // Create exit promise with resolver
  let exitResolve!: () => void;
  const exitPromise = new Promise<void>((resolve) => {
    exitResolve = resolve;
  });
  
  const onQuit = () => {
    log("app", "onQuit callback invoked");
    props.onQuit();
    exitResolve();
  };

  // Await render to ensure CLI renderer is fully initialized
  await render(
    () => (
      <App
        options={props.options}
        persistedState={props.persistedState}
        onQuit={onQuit}
        iterationTimesRef={iterationTimesRef}
        onKeyboardEvent={props.onKeyboardEvent}
      />
    ),
    {
      targetFps: 30, // Balanced FPS: OpenCode uses 60, but 30 is sufficient for ralph's logging TUI
      gatherStats: false, // Disable stats gathering for performance (matches OpenCode)
      exitOnCtrlC: false,
      useKittyKeyboard: {}, // Enable Kitty keyboard protocol for improved key event handling
    }
  );

  // State setters are set during App component body execution, so they're
  // available immediately after render() completes.
  if (!globalSetState || !globalUpdateIterationTimes) {
    throw new Error(
      "State setters not initialized after render. This indicates the App component did not execute."
    );
  }

  const stateSetters: AppStateSetters = {
    setState: globalSetState,
    updateIterationTimes: (times) => {
      iterationTimesRef.length = 0;
      iterationTimesRef.push(...times);
      globalUpdateIterationTimes!(times);
    },
  };

  return { exitPromise, stateSetters };
}

export function App(props: AppProps) {
  // Get renderer for cleanup on quit
  const renderer = useRenderer();
  
  // Disable stdout interception to prevent OpenTUI from capturing stdout
  // which may interfere with logging and other output (matches OpenCode pattern).
  renderer.disableStdoutInterception();
  
  // State signal for loop state
  // Initialize iteration to length + 1 since we're about to start the next iteration
  const [state, setState] = createSignal<LoopState>({
    status: "starting",
    iteration: props.persistedState.iterationTimes.length + 1,
    tasksComplete: 0,
    totalTasks: 0,
    commits: 0,
    linesAdded: 0,
    linesRemoved: 0,
    events: [],
    isIdle: true, // Starts idle, waiting for first LLM response
  });

  // Signal to track iteration times (for ETA calculation)
  const [iterationTimes, setIterationTimes] = createSignal<number[]>(
    props.iterationTimesRef || [...props.persistedState.iterationTimes]
  );

  // Export wrapped state setter for external access. Calls requestRender()
  // after updates to ensure TUI refreshes on all platforms.
  globalSetState = (update) => {
    const result = setState(update);
    renderer.requestRender?.();
    return result;
  };
  globalUpdateIterationTimes = (times: number[]) => setIterationTimes(times);

  // Track elapsed time from the persisted start time
  const [elapsed, setElapsed] = createSignal(
    Date.now() - props.persistedState.startTime
  );

  // Update elapsed time periodically (5000ms to reduce render frequency)
  // Skip updates when idle or paused to reduce unnecessary re-renders
  const elapsedInterval = setInterval(() => {
    const currentState = state();
    if (!currentState.isIdle && currentState.status !== "paused") {
      setElapsed(Date.now() - props.persistedState.startTime);
    }
  }, 5000);

  onCleanup(() => {
    clearInterval(elapsedInterval);
    // Clean up module-level references
    globalSetState = null;
    globalUpdateIterationTimes = null;
  });

  // Calculate ETA based on iteration times and remaining tasks
  const eta = () => {
    const currentState = state();
    const remainingTasks = currentState.totalTasks - currentState.tasksComplete;
    return calculateEta(iterationTimes(), remainingTasks);
  };

  // Pause file path
  const PAUSE_FILE = ".ralph-pause";

  // Toggle pause by creating/deleting .ralph-pause file
  const togglePause = async () => {
    const file = Bun.file(PAUSE_FILE);
    const exists = await file.exists();
    if (exists) {
      // Resume: delete pause file and update status
      await Bun.write(PAUSE_FILE, ""); // Ensure file exists before unlinking
      const fs = await import("node:fs/promises");
      await fs.unlink(PAUSE_FILE);
      setState((prev) => ({ ...prev, status: "running" }));
    } else {
      // Pause: create pause file and update status
      await Bun.write(PAUSE_FILE, String(process.pid));
      setState((prev) => ({ ...prev, status: "paused" }));
    }
  };

  // Track if we've notified about keyboard events working (only notify once)
  let keyboardEventNotified = false;

  // Keyboard handling
  useKeyboard((e: KeyEvent) => {
    // Notify caller that OpenTUI keyboard handling is working
    // This allows the caller to skip setting up a fallback stdin handler
    if (!keyboardEventNotified && props.onKeyboardEvent) {
      keyboardEventNotified = true;
      props.onKeyboardEvent();
    }
    
    const key = e.name.toLowerCase();

    // p key: toggle pause
    if (key === "p" && !e.ctrl && !e.meta) {
      togglePause();
      return;
    }

    // q key: quit
    if (key === "q" && !e.ctrl && !e.meta) {
      log("app", "Quit requested via 'q' key");
      renderer.setTerminalTitle("");
      renderer.destroy();
      props.onQuit();
      return;
    }

    // Ctrl+C: quit
    if (key === "c" && e.ctrl) {
      log("app", "Quit requested via Ctrl+C");
      renderer.setTerminalTitle("");
      renderer.destroy();
      props.onQuit();
      return;
    }
  });

  return (
    <box
      flexDirection="column"
      width="100%"
      height="100%"
      backgroundColor={colors.bgDark}
    >
      <Header
        status={state().status}
        iteration={state().iteration}
        tasksComplete={state().tasksComplete}
        totalTasks={state().totalTasks}
        eta={eta()}
      />
      <Log events={state().events} isIdle={state().isIdle} />
      <Footer
        commits={state().commits}
        elapsed={elapsed()}
        paused={state().status === "paused"}
        linesAdded={state().linesAdded}
        linesRemoved={state().linesRemoved}
      />
      <PausedOverlay visible={state().status === "paused"} />
    </box>
  );
}
