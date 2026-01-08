import { useKeyboard } from "@opentui/solid";
import { TextAttributes } from "@opentui/core";
import type { KeyEvent } from "@opentui/core";
import { Dialog } from "./Dialog";
import { useDialog } from "../context/DialogContext";
import { useTheme } from "../context/ThemeContext";

export type DialogAlertProps = {
  /** Dialog title displayed at the top */
  title?: string;
  /** Message to display */
  message: string;
  /** Callback when user dismisses (Enter, Escape, or button) */
  onDismiss?: () => void;
  /** Optional custom border color */
  borderColor?: string;
  /** Optional variant for styling (info, success, warning, error) */
  variant?: "info" | "success" | "warning" | "error";
};

/**
 * Alert dialog for displaying messages to the user.
 * Displays a message and Dismiss button.
 * Enter or Escape key dismisses the dialog.
 */
export function DialogAlert(props: DialogAlertProps) {
  const { pop } = useDialog();
  const { theme } = useTheme();

  // Get variant-specific colors
  const getVariantColor = () => {
    const t = theme();
    switch (props.variant) {
      case "success":
        return t.success;
      case "warning":
        return t.warning;
      case "error":
        return t.error;
      case "info":
      default:
        return t.info;
    }
  };

  const handleDismiss = () => {
    props.onDismiss?.();
    pop();
  };

  // Handle Enter/Escape keyboard shortcuts
  useKeyboard((e: KeyEvent) => {
    // Enter key to dismiss
    if (e.name === "return" || e.name === "enter" || e.name === "Enter") {
      handleDismiss();
      return;
    }
    // Escape is also handled by base Dialog, but we handle it here
    // to ensure onDismiss is called
    if (e.name === "escape" || e.name === "Escape") {
      handleDismiss();
      return;
    }
  });

  const variantColor = getVariantColor();
  const t = theme();

  return (
    <Dialog
      borderColor={props.borderColor || variantColor}
      onClose={handleDismiss}
      width="50%"
    >
      {/* Title (optional) */}
      {props.title && (
        <box marginBottom={1}>
          <text fg={variantColor} attributes={TextAttributes.BOLD}>
            {props.title}
          </text>
        </box>
      )}

      {/* Message */}
      <box marginBottom={1}>
        <text fg={t.text}>{props.message}</text>
      </box>

      {/* Button row */}
      <box flexDirection="row" justifyContent="flex-end">
        <box flexDirection="row">
          <text fg={t.textMuted}>[</text>
          <text fg={variantColor}>Enter</text>
          <text fg={t.textMuted}>] Dismiss</text>
        </box>
      </box>
    </Dialog>
  );
}
