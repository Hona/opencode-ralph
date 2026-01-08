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
  /** Whether the toast is currently fading out */
  fading?: boolean;
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
  
  // Map to track timeout IDs for each toast (dismiss and fade)
  const timeouts = new Map<string, ReturnType<typeof setTimeout>>();
  const fadeTimeouts = new Map<string, ReturnType<typeof setTimeout>>();
  
  /** Duration for fade out animation in milliseconds */
  const FADE_DURATION = 300;

  /**
   * Clean up all timeouts on unmount.
   */
  onCleanup(() => {
    timeouts.forEach((timeout) => clearTimeout(timeout));
    timeouts.clear();
    fadeTimeouts.forEach((timeout) => clearTimeout(timeout));
    fadeTimeouts.clear();
  });

  /**
   * Remove a toast immediately without fade animation.
   */
  const removeToast = (id: string) => {
    // Clear any pending timeouts
    const timeout = timeouts.get(id);
    if (timeout) {
      clearTimeout(timeout);
      timeouts.delete(id);
    }
    const fadeTimeout = fadeTimeouts.get(id);
    if (fadeTimeout) {
      clearTimeout(fadeTimeout);
      fadeTimeouts.delete(id);
    }
    
    // Remove from toasts array
    setToasts((prev) => prev.filter((t) => t.id !== id));
  };

  /**
   * Dismiss a toast by ID with fade out animation.
   */
  const dismiss = (id: string) => {
    // Clear the auto-dismiss timeout if it exists
    const timeout = timeouts.get(id);
    if (timeout) {
      clearTimeout(timeout);
      timeouts.delete(id);
    }
    
    // Check if already fading or doesn't exist
    const toast = toasts().find((t) => t.id === id);
    if (!toast || toast.fading) {
      return;
    }
    
    // Mark toast as fading
    setToasts((prev) => 
      prev.map((t) => (t.id === id ? { ...t, fading: true } : t))
    );
    
    // After fade duration, remove the toast
    const fadeTimeout = setTimeout(() => {
      removeToast(id);
    }, FADE_DURATION);
    
    fadeTimeouts.set(id, fadeTimeout);
  };

  /**
   * Clear all toasts immediately.
   */
  const clear = () => {
    // Clear all timeouts
    timeouts.forEach((timeout) => clearTimeout(timeout));
    timeouts.clear();
    fadeTimeouts.forEach((timeout) => clearTimeout(timeout));
    fadeTimeouts.clear();
    
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
      // If we're at max visible, remove the oldest toast immediately
      if (prev.length >= maxVisible) {
        const oldest = prev[0];
        if (oldest) {
          // Clear timeouts for the oldest toast
          const oldestTimeout = timeouts.get(oldest.id);
          if (oldestTimeout) {
            clearTimeout(oldestTimeout);
            timeouts.delete(oldest.id);
          }
          const oldestFadeTimeout = fadeTimeouts.get(oldest.id);
          if (oldestFadeTimeout) {
            clearTimeout(oldestFadeTimeout);
            fadeTimeouts.delete(oldest.id);
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
