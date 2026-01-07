import {
  createContext,
  useContext,
  createSignal,
  JSX,
} from "solid-js";
import type { Accessor } from "solid-js";

/**
 * Interface for a command option that can be displayed in the command palette.
 */
export interface CommandOption {
  /** Display title for the command */
  title: string;
  /** Unique value identifier for the command */
  value: string;
  /** Optional description shown below the title */
  description?: string;
  /** Optional category for grouping commands */
  category?: string;
  /** Optional keybind hint (e.g., "Ctrl+P") */
  keybind?: string;
  /** Whether the command is currently disabled */
  disabled?: boolean;
  /** Callback executed when the command is selected */
  onSelect: () => void;
}

/**
 * Factory function type that returns an array of command options.
 * Allows dynamic command generation based on current state.
 */
export type CommandFactory = () => CommandOption[];

/**
 * Context value interface defining all command operations.
 */
export interface CommandContextValue {
  /** Register a command factory that provides command options */
  register: (id: string, factory: CommandFactory) => () => void;
  /** Open the command palette dialog */
  show: () => void;
  /** Execute a command by its value */
  trigger: (value: string) => boolean;
  /** Accessor for whether keybinds are currently suspended */
  suspended: Accessor<boolean>;
  /** Enable or disable global keybinds */
  keybinds: (enabled: boolean) => void;
  /** Get all currently registered keybinds */
  getKeybinds: () => Map<string, CommandOption>;
  /** Get all available commands */
  getCommands: () => CommandOption[];
}

// Create the context with undefined default (must be used within provider)
const CommandContext = createContext<CommandContextValue>();

/**
 * Props for the CommandProvider component.
 */
export interface CommandProviderProps {
  children: JSX.Element;
  /** Callback to open the command palette UI */
  onShowPalette?: () => void;
}

/**
 * CommandProvider component that manages command registration and execution.
 * Wraps children with command context.
 */
export function CommandProvider(props: CommandProviderProps) {
  // Map of registered command factories keyed by ID
  const [factories, setFactories] = createSignal<Map<string, CommandFactory>>(
    new Map()
  );

  // Whether global keybinds are currently suspended (e.g., when dialog open)
  const [suspended, setSuspended] = createSignal(false);

  /**
   * Register a command factory that provides command options.
   * Returns an unregister function.
   */
  const register = (id: string, factory: CommandFactory): (() => void) => {
    setFactories((prev) => {
      const next = new Map(prev);
      next.set(id, factory);
      return next;
    });

    // Return unregister function
    return () => {
      setFactories((prev) => {
        const next = new Map(prev);
        next.delete(id);
        return next;
      });
    };
  };

  /**
   * Get all available commands from all registered factories.
   */
  const getCommands = (): CommandOption[] => {
    const commands: CommandOption[] = [];
    for (const factory of factories().values()) {
      commands.push(...factory());
    }
    return commands;
  };

  /**
   * Get a map of keybinds to their command options.
   * Only includes commands with defined keybinds.
   */
  const getKeybinds = (): Map<string, CommandOption> => {
    const keybindMap = new Map<string, CommandOption>();
    for (const command of getCommands()) {
      if (command.keybind && !command.disabled) {
        keybindMap.set(command.keybind, command);
      }
    }
    return keybindMap;
  };

  /**
   * Open the command palette dialog.
   */
  const show = () => {
    props.onShowPalette?.();
  };

  /**
   * Execute a command by its value.
   * Returns true if command was found and executed, false otherwise.
   */
  const trigger = (value: string): boolean => {
    const commands = getCommands();
    const command = commands.find((c) => c.value === value && !c.disabled);
    if (command) {
      command.onSelect();
      return true;
    }
    return false;
  };

  /**
   * Enable or disable global keybinds.
   * When disabled (suspended=true), keybinds should not be processed.
   */
  const keybinds = (enabled: boolean) => {
    setSuspended(!enabled);
  };

  const commandValue: CommandContextValue = {
    register,
    show,
    trigger,
    suspended,
    keybinds,
    getKeybinds,
    getCommands,
  };

  return (
    <CommandContext.Provider value={commandValue}>
      {props.children}
    </CommandContext.Provider>
  );
}

/**
 * Hook to access the command context.
 * Must be used within a CommandProvider.
 *
 * @throws Error if used outside of CommandProvider
 */
export function useCommand(): CommandContextValue {
  const context = useContext(CommandContext);
  if (!context) {
    throw new Error("useCommand must be used within a CommandProvider");
  }
  return context;
}
