import { useKeyboard } from "@opentui/solid";
import type { KeyEvent } from "@opentui/core";
import type { JSX } from "solid-js";
import { useDialog } from "../context/DialogContext";
import { useTheme } from "../context/ThemeContext";

export type DialogProps = {
  /** Dialog content */
  children: JSX.Element;
  /** Optional custom border color (defaults to colors.border) */
  borderColor?: string;
  /** Optional width as percentage (defaults to "60%") */
  width?: `${number}%` | number | "auto";
  /** Optional callback when dialog is closed via Escape */
  onClose?: () => void;
};

/**
 * Base dialog component with dark overlay, centered content box, and Escape key handling.
 * Used as the foundation for all dialog types (confirm, prompt, alert, etc.).
 */
export function Dialog(props: DialogProps) {
  const { pop } = useDialog();
  const { theme } = useTheme();

  // Handle Escape key to close dialog
  useKeyboard((e: KeyEvent) => {
    if (e.name === "escape" || e.name === "Escape") {
      if (props.onClose) {
        props.onClose();
      }
      pop();
    }
  });

  const t = theme();

  return (
    <box
      position="absolute"
      width="100%"
      height="100%"
      justifyContent="center"
      alignItems="center"
      backgroundColor={t.backgroundElement}
    >
      <box
        width={props.width || "60%"}
        padding={1}
        borderStyle="single"
        borderColor={props.borderColor || t.border}
        backgroundColor={t.backgroundPanel}
        flexDirection="column"
      >
        {props.children}
      </box>
    </box>
  );
}
