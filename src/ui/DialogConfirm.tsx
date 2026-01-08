import { useKeyboard } from "@opentui/solid";
import { TextAttributes } from "@opentui/core";
import type { KeyEvent } from "@opentui/core";
import { Dialog } from "./Dialog";
import { useDialog } from "../context/DialogContext";
import { useTheme } from "../context/ThemeContext";

export type DialogConfirmProps = {
  /** Dialog title displayed at the top */
  title: string;
  /** Message/question to display */
  message: string;
  /** Callback when user confirms (Y key or Confirm button) */
  onConfirm: () => void;
  /** Callback when user cancels (N key, Cancel button, or Escape) */
  onCancel: () => void;
  /** Optional custom border color */
  borderColor?: string;
};

/**
 * Confirmation dialog with Y/N keyboard shortcuts.
 * Displays a title, message, and Confirm/Cancel buttons.
 */
export function DialogConfirm(props: DialogConfirmProps) {
  const { pop } = useDialog();
  const { theme } = useTheme();

  const handleConfirm = () => {
    props.onConfirm();
    pop();
  };

  const handleCancel = () => {
    props.onCancel();
    pop();
  };

  // Handle Y/N keyboard shortcuts
  useKeyboard((e: KeyEvent) => {
    // Y key for confirm
    if ((e.name === "y" || e.name === "Y") && !e.ctrl && !e.meta) {
      handleConfirm();
      return;
    }
    // N key for cancel
    if ((e.name === "n" || e.name === "N") && !e.ctrl && !e.meta) {
      handleCancel();
      return;
    }
  });

  const t = theme();

  return (
    <Dialog
      borderColor={props.borderColor || t.warning}
      onClose={handleCancel}
      width="50%"
    >
      {/* Title */}
      <box marginBottom={1}>
        <text fg={t.warning} attributes={TextAttributes.BOLD}>
          {props.title}
        </text>
      </box>

      {/* Message */}
      <box marginBottom={1}>
        <text fg={t.text}>{props.message}</text>
      </box>

      {/* Buttons row */}
      <box flexDirection="row" justifyContent="flex-end" gap={2}>
        <box flexDirection="row">
          <text fg={t.textMuted}>[</text>
          <text fg={t.success}>Y</text>
          <text fg={t.textMuted}>] Confirm</text>
        </box>
        <box flexDirection="row">
          <text fg={t.textMuted}>[</text>
          <text fg={t.error}>N</text>
          <text fg={t.textMuted}>] Cancel</text>
        </box>
      </box>
    </Dialog>
  );
}
