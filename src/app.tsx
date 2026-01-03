import { render, useKeyboard } from "@opentui/solid";
import { createSignal, onCleanup, Setter } from "solid-js";
import { Header } from "./components/header";
import { Log } from "./components/log";
import { Footer } from "./components/footer";
import { PausedOverlay } from "./components/paused";
import type { LoopState, LoopOptions, PersistedState, ToolEvent } from "./state";
import { colors } from "./components/colors";
import { calculateEta } from "./util/time";

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

/**
 * Main App component with state signals.
 * Manages LoopState and elapsed time, rendering the full TUI layout.
 */
/**
 * Starts the TUI application and returns a promise that resolves when the app exits,
 * along with state setters for external updates.
 *
 * @param props - The application props including options, persisted state, and quit handler
 * @returns StartAppResult with exitPromise and stateSetters
 */
export function startApp(props: AppProps): StartAppResult {
  // Create a mutable reference to iteration times that can be updated externally
  let iterationTimesRef = [...props.persistedState.iterationTimes];
  
  const exitPromise = new Promise<void>((resolve) => {
    const onQuit = () => {
      props.onQuit();
      resolve();
    };

    render(
      () => <App {...props} onQuit={onQuit} iterationTimesRef={iterationTimesRef} />,
      {
        targetFps: 30,
        exitOnCtrlC: false,
      }
    );
  });

  // Return state setters that will be available after render
  const stateSetters: AppStateSetters = {
    setState: (update) => {
      if (globalSetState) {
        return globalSetState(update);
      }
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
  // State signal for loop state
  const [state, setState] = createSignal<LoopState>({
    status: "starting",
    iteration: props.persistedState.iterationTimes.length,
    tasksComplete: 0,
    totalTasks: 0,
    commits: 0,
    events: [],
  });

  // Signal to track iteration times (for ETA calculation)
  const [iterationTimes, setIterationTimes] = createSignal<number[]>(
    props.iterationTimesRef || [...props.persistedState.iterationTimes]
  );

  // Export the state setter to module scope for external access
  globalSetState = setState;
  globalUpdateIterationTimes = (times: number[]) => setIterationTimes(times);

  // Track elapsed time from the persisted start time
  const [elapsed, setElapsed] = createSignal(
    Date.now() - props.persistedState.startTime
  );

  // Update elapsed time periodically
  const elapsedInterval = setInterval(() => {
    setElapsed(Date.now() - props.persistedState.startTime);
  }, 1000);

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
    // p key: toggle pause
    if (e.name === "p" && !e.ctrl && !e.meta) {
      togglePause();
      return;
    }

    // q key: quit
    if (e.name === "q" && !e.ctrl && !e.meta) {
      props.onQuit();
      return;
    }

    // Ctrl+C: quit
    if (e.name === "c" && e.ctrl) {
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
      <Log events={state().events} />
      <Footer
        commits={state().commits}
        elapsed={elapsed()}
        paused={state().status === "paused"}
      />
      <PausedOverlay visible={state().status === "paused"} />
    </box>
  );
}
