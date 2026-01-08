import { render, useKeyboard, useRenderer } from "@opentui/solid";
import type { KeyEvent } from "@opentui/core";
import { createSignal, onCleanup, onMount, Setter, type Accessor } from "solid-js";
import { Header } from "./components/header";
import { Log } from "./components/log";
import { Footer } from "./components/footer";
import { PausedOverlay } from "./components/paused";
import { SteeringOverlay } from "./components/steering";
import { DialogProvider, DialogStack, useDialog, useInputFocus } from "./context/DialogContext";
import { CommandProvider, useCommand, type CommandOption } from "./context/CommandContext";
import { ToastProvider, useToast } from "./context/ToastContext";
import { ThemeProvider, useTheme } from "./context/ThemeContext";
import { ToastStack } from "./components/toast";
import { DialogSelect, type SelectOption } from "./ui/DialogSelect";
import { DialogAlert } from "./ui/DialogAlert";
import { DialogPrompt } from "./ui/DialogPrompt";
import { keymap, matchesKeybind, type KeybindDef } from "./lib/keymap";
import type { LoopState, LoopOptions, PersistedState } from "./state";
import { detectInstalledTerminals, launchTerminal, getAttachCommand as getAttachCmdFromTerminal, type KnownTerminal } from "./lib/terminal-launcher";
import { copyToClipboard, detectClipboardTool } from "./lib/clipboard";
import { loadConfig, setPreferredTerminal } from "./lib/config";
import { parsePlanTasks, type Task } from "./plan";
import { Tasks } from "./components/tasks";


import { log } from "./util/log";
import { createDebugSession } from "./loop";
import { createLoopState, type LoopStateStore, type LoopAction } from "./hooks/useLoopState";
import { createLoopStats, type LoopStatsStore } from "./hooks/useLoopStats";

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
  
  // Create loop state store using the hook architecture
  // This provides a reducer-based state management pattern with dispatch actions
  const loopStore = createLoopState({
    status: "starting",
    iteration: props.persistedState.iterationTimes.length + 1,
    tasksComplete: 0,
    totalTasks: 0,
    commits: 0,
    linesAdded: 0,
    linesRemoved: 0,
    events: [],
    isIdle: true,
  });
  
  // Create loop stats store for tracking iteration timing and ETA
  const loopStats = createLoopStats();
  
  // Initialize loop stats with persisted state
  loopStats.initialize(
    props.persistedState.startTime,
    props.persistedState.iterationTimes
  );
  
  // State signal for loop state (legacy - being migrated to loopStore)
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

  // Tasks panel state signals
  const [showTasks, setShowTasks] = createSignal(false);
  const [tasks, setTasks] = createSignal<Task[]>([]);

  // Function to refresh tasks from plan file
  const refreshTasks = async () => {
    if (props.options.planFile) {
      const parsed = await parsePlanTasks(props.options.planFile);
      setTasks(parsed);
    }
  };

  // Initialize tasks on mount and set up polling interval
  let tasksRefreshInterval: ReturnType<typeof setInterval> | null = null;
  
  onMount(() => {
    refreshTasks();
    // Poll for task updates every 2 seconds
    tasksRefreshInterval = setInterval(() => {
      refreshTasks();
    }, 2000);
  });

  // Clean up tasks refresh interval on unmount
  onCleanup(() => {
    if (tasksRefreshInterval) {
      clearInterval(tasksRefreshInterval);
      tasksRefreshInterval = null;
    }
  });

  // Export wrapped state setter for external access. Calls requestRender()
  // after updates to ensure TUI refreshes on all platforms.
  globalSetState = (update) => {
    const result = setState(update);
    renderer.requestRender?.();
    return result;
  };
  // Update iteration times in loopStats (used for ETA calculation)
  globalUpdateIterationTimes = (times: number[]) => {
    // Re-initialize loopStats with the updated iteration times
    // This keeps the hook-based stats in sync with external updates
    loopStats.initialize(props.persistedState.startTime, times);
  };

  // Update elapsed time and ETA periodically (5000ms to reduce render frequency)
  // Uses loopStats hook for pause-aware elapsed time tracking
  const elapsedInterval = setInterval(() => {
    const currentState = state();
    const status = currentState.status;
    // Only tick when actively running (not paused, ready, or idle)
    if (!currentState.isIdle && status !== "paused" && status !== "ready") {
      // Tick loopStats for pause-aware elapsed time (hook-based approach)
      loopStats.tick();
      // Update remaining tasks for ETA calculation
      const remainingTasks = currentState.totalTasks - currentState.tasksComplete;
      loopStats.setRemainingTasks(remainingTasks);
    }
  }, 5000);

  onCleanup(() => {
    clearInterval(elapsedInterval);
    // Clean up module-level references
    globalSetState = null;
    globalUpdateIterationTimes = null;
  });

  // Pause file path
  const PAUSE_FILE = ".ralph-pause";

  // Toggle pause by creating/deleting .ralph-pause file
  const togglePause = async () => {
    const file = Bun.file(PAUSE_FILE);
    const exists = await file.exists();
    if (exists) {
      // Resume: delete pause file and update status via dispatch
      await Bun.write(PAUSE_FILE, ""); // Ensure file exists before unlinking
      const fs = await import("node:fs/promises");
      await fs.unlink(PAUSE_FILE);
      // Use dispatch as primary state update mechanism
      loopStore.dispatch({ type: "RESUME" });
      loopStats.resume();
      // Also update legacy state for external compatibility
      setState((prev) => ({ ...prev, status: "running" }));
    } else {
      // Pause: create pause file and update status via dispatch
      await Bun.write(PAUSE_FILE, String(process.pid));
      // Use dispatch as primary state update mechanism
      loopStore.dispatch({ type: "PAUSE" });
      loopStats.pause();
      // Also update legacy state for external compatibility
      setState((prev) => ({ ...prev, status: "paused" }));
    }
  };

  // Track if we've notified about keyboard events working (only notify once)
  const [keyboardEventNotified, setKeyboardEventNotified] = createSignal(false);

  /**
   * Show the command palette dialog.
   * Converts registered commands to SelectOptions for the dialog.
   */
  const showCommandPalette = () => {
    // This function will be passed to CommandProvider's onShowPalette callback
    // The actual implementation uses the dialog context inside AppContent
  };

  return (
    <ThemeProvider>
      <ToastProvider>
        <DialogProvider>
          <CommandProvider onShowPalette={showCommandPalette}>
            <AppContent
              state={state}
              setState={setState}
              options={props.options}
              commandMode={commandMode}
              setCommandMode={setCommandMode}
              setCommandInput={setCommandInput}
              togglePause={togglePause}
              renderer={renderer}
              onQuit={props.onQuit}
              onKeyboardEvent={props.onKeyboardEvent}
              keyboardEventNotified={keyboardEventNotified}
              setKeyboardEventNotified={setKeyboardEventNotified}
              showTasks={showTasks}
              setShowTasks={setShowTasks}
              tasks={tasks}
              refreshTasks={refreshTasks}
              loopStore={loopStore}
              loopStats={loopStats}
            />
          </CommandProvider>
        </DialogProvider>
      </ToastProvider>
    </ThemeProvider>
  );
}

/**
 * Props for the inner AppContent component.
 */
type AppContentProps = {
  state: () => LoopState;
  setState: Setter<LoopState>;
  options: LoopOptions;
  commandMode: () => boolean;
  setCommandMode: (v: boolean) => void;
  setCommandInput: (v: string) => void;
  togglePause: () => Promise<void>;
  renderer: ReturnType<typeof useRenderer>;
  onQuit: () => void;
  onKeyboardEvent?: () => void;
  keyboardEventNotified: Accessor<boolean>;
  setKeyboardEventNotified: Setter<boolean>;
  showTasks: () => boolean;
  setShowTasks: (v: boolean) => void;
  tasks: () => Task[];
  refreshTasks: () => Promise<void>;
  // Hook-based state stores (for gradual migration)
  loopStore: LoopStateStore;
  loopStats: LoopStatsStore;
};

/**
 * Inner component that uses context hooks for dialogs and commands.
 * Separated from App to be inside the context providers.
 */
function AppContent(props: AppContentProps) {
  const dialog = useDialog();
  const command = useCommand();
  const toast = useToast();
  const theme = useTheme();
  const { isInputFocused: dialogInputFocused } = useInputFocus();

  // Get theme colors reactively - call theme.theme() to access the resolved theme
  const t = () => theme.theme();

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
        message={`Copy this command manually:\n\n${attachCmd}`}
        variant="info"
      />
    ));
  };

  /**
   * Copy the attach command to clipboard.
   * Falls back to showing a dialog if clipboard is unavailable.
   */
  const copyAttachCommand = async () => {
    const attachCmd = getAttachCommand();
    if (!attachCmd) {
      toast.show({
        variant: "warning",
        message: "No active session to copy attach command",
      });
      return;
    }

    // Check if clipboard tool is available
    const clipboardTool = await detectClipboardTool();
    if (!clipboardTool) {
      // No clipboard tool available - show dialog as fallback
      log("app", "No clipboard tool available, showing dialog fallback");
      showAttachCommandDialog();
      return;
    }

    // Attempt to copy to clipboard
    const result = await copyToClipboard(attachCmd);
    if (result.success) {
      toast.show({
        variant: "success",
        message: "Copied to clipboard",
      });
      log("app", "Attach command copied to clipboard");
    } else {
      toast.show({
        variant: "error",
        message: `Failed to copy: ${result.error || "Unknown error"}`,
      });
      log("app", "Failed to copy to clipboard", { error: result.error });
      // Fall back to dialog on error
      showAttachCommandDialog();
    }
  };

  // Register default commands on mount
  onMount(() => {
    // Register "Start/Pause/Resume" command
    command.register("togglePause", () => {
      const status = props.state().status;
      const title = status === "ready" ? "Start" : status === "paused" ? "Resume" : "Pause";
      const description = status === "ready" 
        ? "Start the automation loop"
        : status === "paused" 
          ? "Resume the automation loop" 
          : "Pause the automation loop";
      return [
        {
          title,
          value: "togglePause",
          description,
          keybind: keymap.togglePause.label,
          onSelect: () => {
            props.togglePause();
          },
        },
      ];
    });

    // Register "Copy attach command" action
    command.register("copyAttach", () => [
      {
        title: "Copy attach command",
        value: "copyAttach",
        description: "Copy attach command to clipboard",
        keybind: keymap.copyAttach.label,
        disabled: !props.state().sessionId,
        onSelect: () => {
          copyAttachCommand();
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
        title: props.showTasks() ? "Hide tasks panel" : "Show tasks panel",
        value: "toggleTasks",
        description: "Show/hide the tasks checklist from plan file",
        keybind: keymap.toggleTasks.label,
        onSelect: () => {
          log("app", "Tasks panel toggled via command palette");
          props.setShowTasks(!props.showTasks());
        },
      },
    ]);

    // Register "Switch theme" command
    command.register("switchTheme", () => [
      {
        title: "Switch theme",
        value: "switchTheme",
        description: `Change UI color theme (current: ${theme.themeName()})`,
        onSelect: () => {
          // Defer to next tick so command palette's pop() completes first
          queueMicrotask(() => showThemeDialog());
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
            // Save to config
            setPreferredTerminal(selected.name);
            log("app", "Terminal preference saved", { terminal: selected.name });
            dialog.show(() => (
              <DialogAlert
                title="Terminal Selected"
                message={`Selected: ${selected.name}\n\nThis will be used when pressing 'T' to open a new terminal.`}
                variant="info"
              />
            ));
          }
        }}
        onCancel={() => {}}
        borderColor={t().secondary}
      />
    ));
  };

  /**
   * Show theme selection dialog.
   * Lists all available themes and allows user to switch.
   */
  const showThemeDialog = () => {
    const options: SelectOption[] = theme.themeNames.map((name) => ({
      title: name,
      value: name,
      description: name === theme.themeName() ? "(current)" : undefined,
    }));

    dialog.show(() => (
      <DialogSelect
        title="Switch Theme"
        placeholder="Type to search themes..."
        options={options}
        onSelect={(opt) => {
          theme.setThemeName(opt.value);
          log("app", "Theme changed", { theme: opt.value });
          toast.show({
            variant: "success",
            message: `Theme changed to ${opt.value}`,
          });
          // Force re-render after state updates propagate
          queueMicrotask(() => props.renderer.requestRender?.());
        }}
        onCancel={() => {}}
        borderColor={t().accent}
      />
    ));
    props.renderer.requestRender?.();
  };

  /**
   * Handle N key press in debug mode: create a new session.
   * Only available in debug mode. Creates a session and stores it in state.
   */
  const handleDebugNewSession = async () => {
    // Only available in debug mode
    if (!props.options.debug) {
      return;
    }

    // Check if session already exists
    const currentState = props.state();
    const existingSessionId = currentState.sessionId;
    if (existingSessionId) {
      dialog.show(() => (
        <DialogAlert
          title="Session Exists"
          message={`A session is already active (${existingSessionId.slice(0, 8)}...).\n\nUse ':' to send messages to the existing session.`}
          variant="info"
        />
      ));
      return;
    }

    log("app", "Debug mode: creating new session via N key");

    try {
      const session = await createDebugSession({
        serverUrl: props.options.serverUrl,
        serverTimeoutMs: props.options.serverTimeoutMs,
        model: props.options.model,
        agent: props.options.agent,
      });

      // Update state via dispatch as primary mechanism
      props.loopStore.dispatch({
        type: "SET_SESSION",
        sessionId: session.sessionId,
        serverUrl: session.serverUrl,
        attached: session.attached,
      });
      props.loopStore.dispatch({ type: "SET_IDLE", isIdle: true });
      
      // Also update legacy state for external compatibility
      props.setState((prev) => ({
        ...prev,
        sessionId: session.sessionId,
        serverUrl: session.serverUrl,
        attached: session.attached,
        status: "ready", // Ready for input
      }));

      // Store sendMessage function for steering mode
      globalSendMessage = session.sendMessage;

      log("app", "Debug mode: session created successfully", { 
        sessionId: session.sessionId 
      });

      dialog.show(() => (
        <DialogAlert
          title="Session Created"
          message={`Session ID: ${session.sessionId.slice(0, 8)}...\n\nUse ':' to send messages to the session.`}
          variant="info"
        />
      ));
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      log("app", "Debug mode: failed to create session", { error: errorMsg });
      
      dialog.show(() => (
        <DialogAlert
          title="Session Creation Failed"
          message={`Failed to create session:\n\n${errorMsg}`}
          variant="error"
        />
      ));
    }
  };

  /**
   * Handle P key press in debug mode: open prompt dialog for manual input.
   * Only available in debug mode with an active session.
   */
  const handleDebugPromptInput = () => {
    // Only available in debug mode
    if (!props.options.debug) {
      return;
    }

    // Check for active session
    const currentState = props.state();
    if (!currentState.sessionId) {
      dialog.show(() => (
        <DialogAlert
          title="No Active Session"
          message="Create a session first by pressing 'N'."
          variant="warning"
        />
      ));
      return;
    }

    log("app", "Debug mode: opening prompt dialog via P key");

    dialog.show(() => (
      <DialogPrompt
        title="Send Prompt"
        placeholder="Enter your message..."
        onSubmit={async (value) => {
          if (!value.trim()) {
            return;
          }
          
          if (globalSendMessage) {
            log("app", "Debug mode: sending prompt", { message: value.slice(0, 50) });
            try {
              await globalSendMessage(value);
              // Update status via dispatch as primary mechanism
              props.loopStore.dispatch({ type: "START" });
              props.loopStore.dispatch({ type: "SET_IDLE", isIdle: false });
              // Also update legacy state for external compatibility
              props.setState((prev) => ({
                ...prev,
                status: "running",
                isIdle: false,
              }));
            } catch (error) {
              const errorMsg = error instanceof Error ? error.message : String(error);
              log("app", "Debug mode: failed to send prompt", { error: errorMsg });
              dialog.show(() => (
                <DialogAlert
                  title="Send Failed"
                  message={`Failed to send prompt:\n\n${errorMsg}`}
                  variant="error"
                />
              ));
            }
          } else {
            log("app", "Debug mode: no sendMessage function available");
            dialog.show(() => (
              <DialogAlert
                title="Session Not Ready"
                message="The session is not ready to receive messages yet."
                variant="warning"
              />
            ));
          }
        }}
        onCancel={() => {
          log("app", "Debug mode: prompt dialog cancelled");
        }}
        borderColor={t().accent}
      />
    ));
  };

  /**
   * Handle T key press: launch terminal with attach command or show config dialog.
   * Requires an active session. Uses preferred terminal if configured.
   */
  const handleTerminalLaunch = async () => {
    const currentState = props.state();
    
    // Check for active session
    if (!currentState.sessionId) {
      dialog.show(() => (
        <DialogAlert
          title="No Active Session"
          message="Cannot launch terminal: No active session to attach to."
          variant="warning"
        />
      ));
      return;
    }

    // Load config to check for preferred terminal
    const config = loadConfig();
    
    if (!config.preferredTerminal) {
      // No configured terminal: show config dialog
      log("app", "No preferred terminal configured, showing dialog");
      await showTerminalConfigDialog();
      return;
    }

    // Find the preferred terminal in detected terminals
    const terminals = await detectInstalledTerminals();
    const preferredTerminal = terminals.find(
      (t: KnownTerminal) => t.name === config.preferredTerminal
    );

    if (!preferredTerminal) {
      // Preferred terminal not found/installed
      log("app", "Preferred terminal not found", { preferred: config.preferredTerminal });
      dialog.show(() => (
        <DialogAlert
          title="Terminal Not Found"
          message={`Preferred terminal "${config.preferredTerminal}" is not available.\n\nPlease select a different terminal.`}
          variant="warning"
        />
      ));
      await showTerminalConfigDialog();
      return;
    }

    // Build attach command using server URL from state (supports external/attached mode)
    const serverUrl = currentState.serverUrl || "http://localhost:10101";
    const attachCmd = getAttachCmdFromTerminal(serverUrl, currentState.sessionId);

    log("app", "Launching terminal", { 
      terminal: preferredTerminal.name, 
      serverUrl,
      sessionId: currentState.sessionId,
    });

    // Launch the terminal
    const result = await launchTerminal(preferredTerminal, attachCmd);

    if (!result.success) {
      dialog.show(() => (
        <DialogAlert
          title="Launch Failed"
          message={`Failed to launch ${preferredTerminal.name}:\n\n${result.error}`}
          variant="error"
        />
      ));
    }
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
    if (dialog.hasDialogs()) {
      return;
    }

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
        borderColor={t().accent}
      />
    ));
    props.renderer.requestRender?.();
  };

  // Keyboard handling - now inside context providers
  useKeyboard((e: KeyEvent) => {
    // Notify caller that OpenTUI keyboard handling is working
    // Also log the first key event for diagnostic purposes (Phase 1.1)
    if (!props.keyboardEventNotified() && props.onKeyboardEvent) {
      props.setKeyboardEventNotified(true);
      props.onKeyboardEvent();
      // Log first key event to diagnose keyboard issues
      log("keyboard", "First OpenTUI key event received", {
        key: e.name,
        ctrl: e.ctrl,
        shift: e.shift,
        meta: e.meta,
        raw: e.raw,
        isInputFocused: isInputFocused(),
        commandMode: props.commandMode(),
        dialogInputFocused: dialogInputFocused(),
      });
    }

    const key = e.name.toLowerCase();

    // SAFETY VALVE: Ctrl+C always quits, even if a dialog is open/broken
    // This ensures users can always exit the app without killing the terminal
    if (key === "c" && e.ctrl) {
      log("app", "Quit requested via Ctrl+C (safety valve)");
      props.renderer.setTerminalTitle("");
      props.renderer.destroy();
      props.onQuit();
      return;
    }

    // Skip if any input is focused (dialogs, steering mode, etc.)
    if (isInputFocused()) return;

    // ESC key: close tasks panel if open
    if (key === "escape" && props.showTasks()) {
      log("app", "Tasks panel closed via ESC");
      props.setShowTasks(false);
      return;
    }

    // c: open command palette
    if (matchesKeybind(e, keymap.commandPalette)) {
      log("app", "Command palette opened via 'c' key");
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

    // p key: toggle pause OR prompt input (debug mode)
    // Phase 2.2: Use matchesKeybind for consistent key routing
    if (matchesKeybind(e, keymap.togglePause)) {
      if (props.options.debug) {
        // In debug mode, p opens prompt input dialog
        handleDebugPromptInput();
        return;
      }
      // In normal mode, p toggles pause
      props.togglePause();
      return;
    }

    // t key: launch terminal with attach command (only when no modifiers)
    if (matchesKeybind(e, keymap.terminalConfig)) {
      handleTerminalLaunch();
      return;
    }

    // Shift+T: toggle tasks panel
    if (matchesKeybind(e, keymap.toggleTasks)) {
      log("app", "Tasks panel toggled via Shift+T");
      props.setShowTasks(!props.showTasks());
      return;
    }

    // n key: create new session (debug mode only)
    if (key === "n" && !e.ctrl && !e.meta && !e.shift) {
      if (props.options.debug) {
        handleDebugNewSession();
        return;
      }
    }

    // q key: quit
    // Phase 2.2: Use matchesKeybind for consistent key routing
    if (matchesKeybind(e, keymap.quit)) {
      log("app", "Quit requested via 'q' key");
      props.renderer.setTerminalTitle("");
      props.renderer.destroy();
      props.onQuit();
      return;
    }

    // Note: Ctrl+C is handled above as a safety valve (before isInputFocused check)
  });

  return (
    <box
      flexDirection="column"
      width="100%"
      height="100%"
      backgroundColor={t().background}
    >
      <Header
        status={props.state().status}
        iteration={props.state().iteration}
        tasksComplete={props.state().tasksComplete}
        totalTasks={props.state().totalTasks}
        eta={props.loopStats.etaMs()}
        debug={props.options.debug}
      />
      <Log events={props.state().events} isIdle={props.state().isIdle} errorRetryAt={props.state().errorRetryAt} />
      <Footer
        commits={props.state().commits}
        elapsed={props.loopStats.elapsedMs()}
        status={props.state().status}
        linesAdded={props.state().linesAdded}
        linesRemoved={props.state().linesRemoved}
        sessionActive={!!props.state().sessionId}
        tokens={props.state().tokens}
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
      {/* Tasks Panel Overlay (right-side panel) */}
      {props.showTasks() && (
        <box
          position="absolute"
          top={2}
          right={0}
          width={40}
          height="80%"
          flexDirection="column"
          borderStyle="single"
          borderColor={t().secondary}
          backgroundColor={t().backgroundPanel}
        >
          <box
            width="100%"
            height={1}
            paddingLeft={1}
            backgroundColor={t().backgroundPanel}
          >
            <text fg={t().secondary}>Tasks</text>
            <box flexGrow={1} />
            <text fg={t().textMuted}>ESC to close</text>
          </box>
          <Tasks
            tasks={props.tasks()}
            onClose={() => props.setShowTasks(false)}
          />
        </box>
      )}
      <DialogStack />
      <ToastStack />
    </box>
  );
}
