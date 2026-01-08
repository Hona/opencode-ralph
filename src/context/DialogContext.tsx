import {
  createContext,
  useContext,
  createSignal,
  For,
  Show,
  JSX,
} from "solid-js";
import type { Accessor } from "solid-js";

/**
 * Type for a dialog component that can be rendered in the stack.
 * Dialogs are functions that return JSX elements.
 */
export type DialogComponent = () => JSX.Element;

/**
 * Context value interface defining all dialog operations.
 */
export interface DialogContextValue {
  /** Push a dialog onto the stack */
  show: (dialog: DialogComponent) => void;
  /** Replace the top dialog with a new one */
  replace: (dialog: DialogComponent) => void;
  /** Clear all dialogs from the stack */
  clear: () => void;
  /** Remove the top dialog from the stack */
  pop: () => void;
  /** Accessor for the current dialog stack */
  stack: Accessor<DialogComponent[]>;
  /** Check if there are any dialogs open */
  hasDialogs: Accessor<boolean>;
}

/**
 * Input focus management interface.
 * Tracks whether any dialog input is currently focused.
 */
export interface InputFocusValue {
  /** Signal indicating if input is focused */
  inputFocused: Accessor<boolean>;
  /** Set input focused state */
  setInputFocused: (focused: boolean) => void;
  /** Check if any input is currently focused (convenience accessor) */
  isInputFocused: () => boolean;
}

// Create the context with undefined default (must be used within provider)
const DialogContext = createContext<DialogContextValue>();

// Create input focus context
const InputFocusContext = createContext<InputFocusValue>();

/**
 * Props for the DialogProvider component.
 */
export interface DialogProviderProps {
  children: JSX.Element;
}

/**
 * DialogProvider component that manages a stack of dialogs.
 * Wraps children with dialog context and renders the dialog stack overlay.
 */
export function DialogProvider(props: DialogProviderProps) {
  // Dialog stack signal - stores array of dialog components
  const [stack, setStack] = createSignal<DialogComponent[]>([]);

  // Input focus signal - tracks if any dialog input is focused
  const [inputFocused, setInputFocused] = createSignal(false);

  // Derived accessor for checking if any dialogs are open
  const hasDialogs: Accessor<boolean> = () => stack().length > 0;

  /**
   * Push a dialog onto the stack.
   * Also sets inputFocused to true when a dialog opens.
   */
  const show = (dialog: DialogComponent) => {
    setStack((prev) => [...prev, dialog]);
    setInputFocused(true);
  };

  /**
   * Replace the top dialog with a new one.
   * If stack is empty, just pushes the dialog.
   */
  const replace = (dialog: DialogComponent) => {
    setStack((prev) => {
      if (prev.length === 0) {
        return [dialog];
      }
      return [...prev.slice(0, -1), dialog];
    });
  };

  /**
   * Clear all dialogs from the stack.
   * Resets inputFocused to false.
   */
  const clear = () => {
    setStack([]);
    setInputFocused(false);
  };

  /**
   * Remove the top dialog from the stack.
   * Resets inputFocused to false if stack becomes empty.
   */
  const pop = () => {
    setStack((prev) => {
      const newStack = prev.slice(0, -1);
      if (newStack.length === 0) {
        setInputFocused(false);
      }
      return newStack;
    });
  };

  const dialogValue: DialogContextValue = {
    show,
    replace,
    clear,
    pop,
    stack,
    hasDialogs,
  };

  const inputFocusValue: InputFocusValue = {
    inputFocused,
    setInputFocused,
    isInputFocused: () => inputFocused(),
  };

  return (
    <DialogContext.Provider value={dialogValue}>
      <InputFocusContext.Provider value={inputFocusValue}>
        {props.children}
      </InputFocusContext.Provider>
    </DialogContext.Provider>
  );
}

/**
 * Hook to access the dialog context.
 * Must be used within a DialogProvider.
 *
 * @throws Error if used outside of DialogProvider
 */
export function useDialog(): DialogContextValue {
  const context = useContext(DialogContext);
  if (!context) {
    throw new Error("useDialog must be used within a DialogProvider");
  }
  return context;
}

/**
 * Hook to access the input focus context.
 * Must be used within a DialogProvider.
 *
 * @throws Error if used outside of DialogProvider
 */
export function useInputFocus(): InputFocusValue {
  const context = useContext(InputFocusContext);
  if (!context) {
    throw new Error("useInputFocus must be used within a DialogProvider");
  }
  return context;
}

/**
 * DialogStack component that renders all dialogs in the stack.
 * Each dialog is rendered with proper z-indexing (later dialogs on top).
 * Only renders when there are dialogs to show.
 * 
 * IMPORTANT: Uses <Show> for reactive conditional rendering.
 * An early `if (!hasDialogs()) return null;` would NOT be reactive
 * in Solid.js - the component body only runs once, so the dialog
 * would never appear when added later.
 */
export function DialogStack() {
  const { stack, hasDialogs } = useDialog();

  return (
    <Show when={hasDialogs()}>
      <For each={stack()}>
        {(Dialog, index) => (
          <box
            position="absolute"
            width="100%"
            height="100%"
            zIndex={index() + 100}
          >
            <Dialog />
          </box>
        )}
      </For>
    </Show>
  );
}
