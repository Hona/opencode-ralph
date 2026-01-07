import { useKeyboard } from "@opentui/solid";
import type { KeyEvent } from "@opentui/core";
import type { JSX } from "solid-js";
import { useDialog } from "../context/DialogContext";
import { colors } from "../components/colors";

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

  // Handle Escape key to close dialog
  useKeyboard((e: KeyEvent) => {
    if (e.name === "escape" || e.name === "Escape") {
      if (props.onClose) {
        props.onClose();
      }
      pop();
    }
  });

  return (
    <box
      position="absolute"
      width="100%"
      height="100%"
      justifyContent="center"
      alignItems="center"
      backgroundColor={colors.bgHighlight}
    >
      <box
        width={props.width || "60%"}
        padding={1}
        borderStyle="single"
        borderColor={props.borderColor || colors.border}
        backgroundColor={colors.bgPanel}
        flexDirection="column"
      >
        {props.children}
      </box>
    </box>
  );
}
