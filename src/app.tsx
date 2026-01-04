import { render, useKeyboard, useRenderer } from "@opentui/solid";
import { createSignal, onCleanup, onMount, Setter } from "solid-js";
import { Header } from "./components/header";
import { Log } from "./components/log";
import { Footer } from "./components/footer";
import { PausedOverlay } from "./components/paused";
import type { LoopState, LoopOptions, PersistedState, ToolEvent } from "./state";
import { colors } from "./components/colors";
import { calculateEta } from "./util/time";
import { log } from "./util/log";

type AppProps = {
  options: LoopOptions;
  persistedState: PersistedState;
  onQuit: () => void;
  iterationTimesRef?: number[];
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

// Mount synchronization - resolves when App component mounts
let mountResolve: (() => void) | null = null;

/**
 * Main App component with state signals.
 * Manages LoopState and elapsed time, rendering the full TUI layout.
 */
/**
 * Starts the TUI application and returns a promise that resolves when the app exits,
 * along with state setters for external updates.
 *
 * @param props - The application props including options, persisted state, and quit handler
 * @returns Promise<StartAppResult> with exitPromise and stateSetters
 */
export async function startApp(props: AppProps): Promise<StartAppResult> {
  log("app", "startApp called");
  
  // Create a mutable reference to iteration times that can be updated externally
  let iterationTimesRef = [...props.persistedState.iterationTimes];
  
  // Create mount promise to wait for component initialization
  const mountPromise = new Promise<void>((resolve) => {
    mountResolve = resolve;
  });
  
  // Create exit promise with resolver
  let exitResolve!: () => void;
  const exitPromise = new Promise<void>((resolve) => {
    exitResolve = resolve;
  });
  
  const onQuit = () => {
    log("app", "onQuit called");
    props.onQuit();
    exitResolve();
  };

  log("app", "Calling render()");
  
  // Await render to ensure CLI renderer is fully initialized
  await render(
    () => <App {...props} onQuit={onQuit} iterationTimesRef={iterationTimesRef} />,
    {
      targetFps: 15, // Reduced from 30 to lower CPU usage
      exitOnCtrlC: false,
    }
  );
  
  log("app", "render() completed, waiting for component mount");
  
  // Wait for component to mount so globalSetState is available
  await mountPromise;
  
  log("app", "Component mounted, state setters ready");

  // Return state setters that will be available after render
  const stateSetters: AppStateSetters = {
    setState: (update) => {
      if (globalSetState) {
        return globalSetState(update);
      }
      log("app", "WARNING: setState called but globalSetState is null");
      return {} as LoopState;
    },
    updateIterationTimes: (times) => {
      iterationTimesRef.length = 0;
      iterationTimesRef.push(...times);
      if (globalUpdateIterationTimes) {
        globalUpdateIterationTimes(times);
      }
    },
  };

  return { exitPromise, stateSetters };
}

export function App(props: AppProps) {
  // Get renderer for cleanup on quit
  const renderer = useRenderer();
  
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

  // Export the state setter to module scope for external access
  globalSetState = setState;
  globalUpdateIterationTimes = (times: number[]) => setIterationTimes(times);
  
  // Signal that component is mounted and state setters are ready
  onMount(() => {
    log("app", "App component mounted");
    if (mountResolve) {
      mountResolve();
      mountResolve = null; // Clean up
    }
  });

  // Track elapsed time from the persisted start time
  const [elapsed, setElapsed] = createSignal(
    Date.now() - props.persistedState.startTime
  );

  // Update elapsed time periodically (2000ms to reduce render frequency)
  // Skip updates when idle to reduce unnecessary re-renders
  const elapsedInterval = setInterval(() => {
    if (!state().isIdle) {
      setElapsed(Date.now() - props.persistedState.startTime);
    }
  }, 2000);

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

  // Keyboard handling
  useKeyboard((e) => {
    log("app", "Keyboard event", { name: e.name, ctrl: e.ctrl, meta: e.meta });
    
    // p key: toggle pause
    if (e.name === "p" && !e.ctrl && !e.meta) {
      log("app", "Toggle pause");
      togglePause();
      return;
    }

    // q key: quit
    if (e.name === "q" && !e.ctrl && !e.meta) {
      log("app", "Quit via 'q' key");
      renderer.destroy();
      props.onQuit();
      return;
    }

    // Ctrl+C: quit
    if (e.name === "c" && e.ctrl) {
      log("app", "Quit via Ctrl+C");
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
      <Log events={state().events} isRunning={state().status === "running"} />
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
