import { render, useKeyboard, useRenderer } from "@opentui/solid";
import type { KeyEvent } from "@opentui/core";
import { createSignal, onCleanup, onMount, Setter } from "solid-js";
import { Header } from "./components/header";
import { Log } from "./components/log";
import { Footer } from "./components/footer";
import { PausedOverlay } from "./components/paused";
import { SteeringOverlay } from "./components/steering";
import { DialogProvider, DialogStack, useDialog, useInputFocus } from "./context/DialogContext";
import { CommandProvider, useCommand, type CommandOption } from "./context/CommandContext";
import { DialogSelect, type SelectOption } from "./ui/DialogSelect";
import { DialogAlert } from "./ui/DialogAlert";
import { keymap, matchesKeybind } from "./lib/keymap";
import type { LoopState, LoopOptions, PersistedState } from "./state";
import { detectInstalledTerminals, type KnownTerminal } from "./lib/terminal-launcher";
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
  setSendMessage: (fn: ((message: string) => Promise<void>) | null) => void;
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
let globalSendMessage: ((message: string) => Promise<void>) | null = null;



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
    setSendMessage: (fn) => {
      globalSendMessage = fn;
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

  // Steering mode state signals
  const [commandMode, setCommandMode] = createSignal(false);
  const [commandInput, setCommandInput] = createSignal("");

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

  /**
   * Show the command palette dialog.
   * Converts registered commands to SelectOptions for the dialog.
   */
  const showCommandPalette = () => {
    // This function will be passed to CommandProvider's onShowPalette callback
    // The actual implementation uses the dialog context inside AppContent
  };

  return (
    <DialogProvider>
      <CommandProvider onShowPalette={showCommandPalette}>
        <AppContent
          state={state}
          setState={setState}
          commandMode={commandMode}
          setCommandMode={setCommandMode}
          setCommandInput={setCommandInput}
          eta={eta}
          elapsed={elapsed}
          togglePause={togglePause}
          renderer={renderer}
          onQuit={props.onQuit}
          onKeyboardEvent={props.onKeyboardEvent}
          keyboardEventNotified={keyboardEventNotified}
          setKeyboardEventNotified={(v: boolean) => { keyboardEventNotified = v; }}
        />
      </CommandProvider>
    </DialogProvider>
  );
}

/**
 * Props for the inner AppContent component.
 */
type AppContentProps = {
  state: () => LoopState;
  setState: Setter<LoopState>;
  commandMode: () => boolean;
  setCommandMode: (v: boolean) => void;
  setCommandInput: (v: string) => void;
  eta: () => number | null;
  elapsed: () => number;
  togglePause: () => Promise<void>;
  renderer: ReturnType<typeof useRenderer>;
  onQuit: () => void;
  onKeyboardEvent?: () => void;
  keyboardEventNotified: boolean;
  setKeyboardEventNotified: (v: boolean) => void;
};

/**
 * Inner component that uses context hooks for dialogs and commands.
 * Separated from App to be inside the context providers.
 */
function AppContent(props: AppContentProps) {
  const dialog = useDialog();
  const command = useCommand();
  const { isInputFocused: dialogInputFocused } = useInputFocus();

  // Combined check for any input being focused
  const isInputFocused = () => props.commandMode() || dialogInputFocused();

  /**
   * Get the attach command string for the current session.
   * Returns null if no session is active.
   */
  const getAttachCommand = (): string | null => {
    const currentState = props.state();
    if (!currentState.sessionId) return null;
    
    const serverUrl = currentState.serverUrl || "http://localhost:10101";
    return `opencode attach ${serverUrl} --session ${currentState.sessionId}`;
  };

  /**
   * Show a dialog with the attach command for manual copying.
   * Used as fallback when clipboard is not available.
   */
  const showAttachCommandDialog = () => {
    const attachCmd = getAttachCommand();
    if (!attachCmd) {
      dialog.show(() => (
        <DialogAlert
          title="No Active Session"
          message="There is no active session to attach to."
          variant="warning"
        />
      ));
      return;
    }

    dialog.show(() => (
      <DialogAlert
        title="Attach Command"
        message={attachCmd}
        variant="info"
      />
    ));
  };

  // Register default commands on mount
  onMount(() => {
    // Register "Pause/Resume" command
    command.register("togglePause", () => [
      {
        title: props.state().status === "paused" ? "Resume" : "Pause",
        value: "togglePause",
        description: props.state().status === "paused" 
          ? "Resume the automation loop" 
          : "Pause the automation loop",
        keybind: keymap.togglePause.label,
        onSelect: () => {
          props.togglePause();
        },
      },
    ]);

    // Register "Copy attach command" action
    command.register("copyAttach", () => [
      {
        title: "Copy attach command",
        value: "copyAttach",
        description: "Show attach command for connecting another terminal",
        keybind: keymap.copyAttach.label,
        disabled: !props.state().sessionId,
        onSelect: () => {
          showAttachCommandDialog();
        },
      },
    ]);

    // Register "Choose default terminal" action
    command.register("terminalConfig", () => [
      {
        title: "Choose default terminal",
        value: "terminalConfig",
        description: "Select terminal for launching attach sessions",
        keybind: keymap.terminalConfig.label,
        onSelect: () => {
          showTerminalConfigDialog();
        },
      },
    ]);

    // Register "Toggle tasks panel" action
    command.register("toggleTasks", () => [
      {
        title: "Toggle tasks panel",
        value: "toggleTasks",
        description: "Show/hide the tasks checklist from plan file",
        keybind: keymap.toggleTasks.label,
        onSelect: () => {
          // Tasks panel not yet implemented (Phase 2.5)
          dialog.show(() => (
            <DialogAlert
              title="Tasks Panel"
              message="Tasks panel is not yet implemented.\n\nThis feature will show a checklist of tasks from your plan file."
              variant="info"
            />
          ));
        },
      },
    ]);
  });

  /**
   * Show terminal configuration dialog.
   * Lists detected terminals and allows user to select one.
   */
  const showTerminalConfigDialog = async () => {
    // Detect installed terminals
    const terminals = await detectInstalledTerminals();

    if (terminals.length === 0) {
      dialog.show(() => (
        <DialogAlert
          title="No Terminals Found"
          message="No supported terminal emulators were detected on your system."
          variant="warning"
        />
      ));
      return;
    }

    // Convert terminals to SelectOption format
    const options: SelectOption[] = terminals.map((terminal: KnownTerminal) => ({
      title: terminal.name,
      value: terminal.command,
      description: `Command: ${terminal.command}`,
    }));

    dialog.show(() => (
      <DialogSelect
        title="Choose Default Terminal"
        placeholder="Type to search terminals..."
        options={options}
        onSelect={(opt) => {
          const selected = terminals.find((t: KnownTerminal) => t.command === opt.value);
          if (selected) {
            // TODO: Save to config when config persistence is implemented
            log("app", "Terminal selected", { terminal: selected.name });
            dialog.show(() => (
              <DialogAlert
                title="Terminal Selected"
                message={`Selected: ${selected.name}\n\nNote: Config persistence not yet implemented.`}
                variant="info"
              />
            ));
          }
        }}
        onCancel={() => {}}
        borderColor={colors.cyan}
      />
    ));
  };

  /**
   * Detect if the `:` (colon) key was pressed.
   * Handles multiple keyboard configurations:
   * - Direct `:` character (Kitty protocol or non-US keyboards)
   * - Shift+`;` (US keyboard layout via raw mode)
   * - Semicolon with shift modifier
   */
  const isColonKey = (e: KeyEvent): boolean => {
    // Direct colon character (most common case with Kitty protocol)
    if (e.name === ":") return true;
    // Raw character is colon
    if (e.raw === ":") return true;
    // Shift+semicolon on US keyboard layout
    if (e.name === ";" && e.shift) return true;
    return false;
  };

  /**
   * Show the command palette dialog with all registered commands.
   */
  const showCommandPalette = () => {
    const commands = command.getCommands();
    const options = commands.map((cmd): CommandOption & { onSelect: () => void } => ({
      title: cmd.title,
      value: cmd.value,
      description: cmd.description,
      keybind: cmd.keybind,
      disabled: cmd.disabled,
      onSelect: cmd.onSelect,
    }));

    dialog.show(() => (
      <DialogSelect
        title="Command Palette"
        placeholder="Type to search commands..."
        options={options}
        onSelect={(opt) => {
          // Find and execute the command
          const cmd = commands.find(c => c.value === opt.value);
          cmd?.onSelect();
        }}
        onCancel={() => {}}
        borderColor={colors.purple}
      />
    ));
  };

  // Keyboard handling - now inside context providers
  useKeyboard((e: KeyEvent) => {
    // Notify caller that OpenTUI keyboard handling is working
    if (!props.keyboardEventNotified && props.onKeyboardEvent) {
      props.setKeyboardEventNotified(true);
      props.onKeyboardEvent();
    }

    // Skip if any input is focused (dialogs, steering mode, etc.)
    if (isInputFocused()) return;

    const key = e.name.toLowerCase();

    // Ctrl+P: open command palette
    if (matchesKeybind(e, keymap.commandPalette)) {
      log("app", "Command palette opened via Ctrl+P");
      showCommandPalette();
      return;
    }

    // : key: open steering mode (requires active session)
    if (isColonKey(e) && !e.ctrl && !e.meta) {
      const currentState = props.state();
      // Only allow steering when there's an active session
      if (currentState.sessionId) {
        log("app", "Steering mode opened via ':' key");
        props.setCommandMode(true);
        props.setCommandInput("");
      }
      return;
    }

    // p key: toggle pause (only when no modifiers)
    if (key === "p" && !e.ctrl && !e.meta && !e.shift) {
      props.togglePause();
      return;
    }

    // q key: quit
    if (key === "q" && !e.ctrl && !e.meta) {
      log("app", "Quit requested via 'q' key");
      props.renderer.setTerminalTitle("");
      props.renderer.destroy();
      props.onQuit();
      return;
    }

    // Ctrl+C: quit
    if (key === "c" && e.ctrl) {
      log("app", "Quit requested via Ctrl+C");
      props.renderer.setTerminalTitle("");
      props.renderer.destroy();
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
        status={props.state().status}
        iteration={props.state().iteration}
        tasksComplete={props.state().tasksComplete}
        totalTasks={props.state().totalTasks}
        eta={props.eta()}
      />
      <Log events={props.state().events} isIdle={props.state().isIdle} errorRetryAt={props.state().errorRetryAt} />
      <Footer
        commits={props.state().commits}
        elapsed={props.elapsed()}
        paused={props.state().status === "paused"}
        linesAdded={props.state().linesAdded}
        linesRemoved={props.state().linesRemoved}
        sessionActive={!!props.state().sessionId}
      />
      <PausedOverlay visible={props.state().status === "paused"} />
      <SteeringOverlay
        visible={props.commandMode()}
        onClose={() => {
          props.setCommandMode(false);
          props.setCommandInput("");
        }}
        onSend={async (message) => {
          if (globalSendMessage) {
            log("app", "Sending steering message", { message });
            await globalSendMessage(message);
          } else {
            log("app", "No sendMessage function available");
          }
        }}
      />
      <DialogStack />
    </box>
  );
}
