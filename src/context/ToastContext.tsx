import {
  createContext,
  useContext,
  createSignal,
  For,
  onCleanup,
  JSX,
} from "solid-js";
import type { Accessor } from "solid-js";

/**
 * Toast variant types for styling.
 */
export type ToastVariant = "success" | "error" | "info" | "warning";

/**
 * Options for showing a toast notification.
 */
export interface ToastOptions {
  /** The variant determines the toast's color scheme */
  variant: ToastVariant;
  /** The message to display in the toast */
  message: string;
  /** Duration in milliseconds before auto-dismiss (default: 3000) */
  duration?: number;
}

/**
 * Internal toast type with unique ID for tracking.
 */
export interface Toast extends ToastOptions {
  /** Unique identifier for this toast instance */
  id: string;
}

/**
 * Context value interface defining toast operations.
 */
export interface ToastContextValue {
  /** Show a new toast notification */
  show: (options: ToastOptions) => void;
  /** Current list of active toasts */
  toasts: Accessor<Toast[]>;
  /** Dismiss a specific toast by ID */
  dismiss: (id: string) => void;
  /** Clear all toasts */
  clear: () => void;
}

// Create the context with undefined default (must be used within provider)
const ToastContext = createContext<ToastContextValue>();

/**
 * Props for the ToastProvider component.
 */
export interface ToastProviderProps {
  children: JSX.Element;
  /** Maximum number of visible toasts (default: 3) */
  maxVisible?: number;
}

/** Counter for generating unique toast IDs */
let toastIdCounter = 0;

/**
 * Generate a unique toast ID.
 */
function generateToastId(): string {
  return `toast-${++toastIdCounter}-${Date.now()}`;
}

/**
 * ToastProvider component that manages toast notifications.
 * Wraps children with toast context.
 */
export function ToastProvider(props: ToastProviderProps) {
  const maxVisible = props.maxVisible ?? 3;
  
  // Toasts array signal - stores active toast notifications
  const [toasts, setToasts] = createSignal<Toast[]>([]);
  
  // Map to track timeout IDs for each toast
  const timeouts = new Map<string, ReturnType<typeof setTimeout>>();

  /**
   * Clean up all timeouts on unmount.
   */
  onCleanup(() => {
    timeouts.forEach((timeout) => clearTimeout(timeout));
    timeouts.clear();
  });

  /**
   * Dismiss a toast by ID.
   */
  const dismiss = (id: string) => {
    // Clear the timeout if it exists
    const timeout = timeouts.get(id);
    if (timeout) {
      clearTimeout(timeout);
      timeouts.delete(id);
    }
    
    // Remove from toasts array
    setToasts((prev) => prev.filter((t) => t.id !== id));
  };

  /**
   * Clear all toasts.
   */
  const clear = () => {
    // Clear all timeouts
    timeouts.forEach((timeout) => clearTimeout(timeout));
    timeouts.clear();
    
    // Clear toasts array
    setToasts([]);
  };

  /**
   * Show a new toast notification.
   * Auto-dismisses after the specified duration.
   * Limits visible toasts to maxVisible (removes oldest).
   */
  const show = (options: ToastOptions) => {
    const id = generateToastId();
    const duration = options.duration ?? 3000;
    
    const toast: Toast = {
      ...options,
      id,
    };

    // Add toast to array
    setToasts((prev) => {
      // If we're at max visible, remove the oldest toast
      if (prev.length >= maxVisible) {
        const oldest = prev[0];
        if (oldest) {
          // Clear timeout for the oldest toast
          const oldestTimeout = timeouts.get(oldest.id);
          if (oldestTimeout) {
            clearTimeout(oldestTimeout);
            timeouts.delete(oldest.id);
          }
        }
        return [...prev.slice(1), toast];
      }
      return [...prev, toast];
    });

    // Set up auto-dismiss timeout
    const timeout = setTimeout(() => {
      dismiss(id);
    }, duration);
    
    timeouts.set(id, timeout);
  };

  const toastValue: ToastContextValue = {
    show,
    toasts,
    dismiss,
    clear,
  };

  return (
    <ToastContext.Provider value={toastValue}>
      {props.children}
    </ToastContext.Provider>
  );
}

/**
 * Hook to access the toast context.
 * Must be used within a ToastProvider.
 *
 * @throws Error if used outside of ToastProvider
 */
export function useToast(): ToastContextValue {
  const context = useContext(ToastContext);
  if (!context) {
    throw new Error("useToast must be used within a ToastProvider");
  }
  return context;
}
