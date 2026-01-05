import { render, useKeyboard, useRenderer } from "@opentui/solid";
import { createSignal, createEffect, onCleanup, onMount, Setter } from "solid-js";
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
  
  log("app", "render() completed, state setters ready");

  // State setters are available immediately after render() completes.
  // The App component's function body runs during render, which sets up
  // globalSetState and globalUpdateIterationTimes. This follows the OpenCode
  // pattern: trust Solid's reactive system - no mount timing dependencies.
  //
  // Note: globalSetState is set in the App component body (not onMount),
  // so it's guaranteed to be available once render() resolves.
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

let rendererInfoLogged = false;

export function App(props: AppProps) {
  // Get renderer for cleanup on quit
  const renderer = useRenderer();

  if (!rendererInfoLogged) {
    rendererInfoLogged = true;
    try {
      const proto = Object.getPrototypeOf(renderer as any);
      log("app", "renderer", {
        keys: Object.keys(renderer as any),
        protoKeys: proto ? Object.getOwnPropertyNames(proto) : [],
      });
    } catch (e) {
      log("app", "renderer", { error: String(e) });
    }
    
    // Task 3.2: Verify renderer.keyInput exists and add direct listener for debugging
    const keyInput = (renderer as any).keyInput;
    log("app", "keyInput check", {
      exists: !!keyInput,
      type: typeof keyInput,
      hasOnMethod: typeof keyInput?.on === "function",
    });
    
    if (keyInput && typeof keyInput.on === "function") {
      // Add a direct debug listener to renderer.keyInput to verify events are reaching it
      const debugKeyListener = (e: any) => {
        log("app", "DIRECT keyInput listener fired", {
          name: e.name,
          sequence: e.sequence,
          eventType: e.eventType,
        });
      };
      keyInput.on("keypress", debugKeyListener);
      log("app", "Direct debug keypress listener added to renderer.keyInput");
      
      // Note: We don't clean this up since it's for debugging and the app lifecycle
      // handles cleanup on exit. In production, use onCleanup() to remove this.
    }
  }
  
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

  // Verification effect: logs whenever state changes to confirm reactivity is working.
  // This proves that setState triggers re-renders (task 2.5 verification).
  createEffect(() => {
    const s = state();
    log("app", "State changed (reactive effect)", {
      status: s.status,
      iteration: s.iteration,
      tasksComplete: s.tasksComplete,
      totalTasks: s.totalTasks,
      eventsCount: s.events.length,
      isIdle: s.isIdle,
    });
  });

  // Task 3.1: Verify that onMount fires - this is critical because useKeyboard 
  // registers its callback inside onMount, not during component body execution.
  onMount(() => {
    log("app", "onMount fired - keyboard handlers should now be registered");
  });

  // Export the state setter to module scope for external access.
  // We wrap setState to call requestRender() after updates - this helps ensure
  // the TUI refreshes on Windows where automatic redraw can sometimes stall.
  // Note: OpenCode only uses requestRender() sparingly for specific edge cases,
  // but we keep it here as a defensive measure for cross-platform reliability.
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

  // Keyboard handling
  // Task 3.1: Log to verify useKeyboard hook is being called
  log("app", "useKeyboard hook being registered (component body)");
  useKeyboard((e) => {
    // Task 3.1: This log verifies the callback is being invoked when keys are pressed
    log("app", "useKeyboard callback invoked", { 
      name: e.name, 
      ctrl: e.ctrl, 
      meta: e.meta, 
      shift: e.shift,
      sequence: e.sequence,
      eventType: e.eventType,
    });
    const key = String(e.name ?? "").toLowerCase();
    log("app", "Keyboard event processed", { key });

    // p key: toggle pause
    if (key === "p" && !(e as any).ctrl && !(e as any).meta) {
      log("app", "Toggle pause");
      togglePause();
      return;
    }

    // q key: quit
    if (key === "q" && !(e as any).ctrl && !(e as any).meta) {
      log("app", "Quit via 'q' key");
      (renderer as any).destroy?.();
      props.onQuit();
      return;
    }

    // Ctrl+C: quit
    if (key === "c" && (e as any).ctrl) {
      log("app", "Quit via Ctrl+C");
      (renderer as any).destroy?.();
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
