import { useKeyboard } from "@opentui/solid";
import type { KeyEvent } from "@opentui/core";
import { createSignal, createEffect, onCleanup } from "solid-js";
import { useTheme } from "../context/ThemeContext";
import { useInputFocus } from "../context/DialogContext";

export type SteeringOverlayProps = {
  visible: boolean;
  onClose: () => void;
  onSend: (message: string) => void;
};

/**
 * Steering mode overlay for sending messages to the active session.
 * Opens with `:` key, closes with ESC, sends with Enter.
 * 
 * IMPORTANT: Uses useInputFocus() to claim input focus when visible,
 * preventing App-level handlers from processing keys while steering is active.
 * 
 * NOTE: Uses reactive theme getter `t()` for proper theme updates.
 */
export function SteeringOverlay(props: SteeringOverlayProps) {
  const [input, setInput] = createSignal("");
  const { theme } = useTheme();
  // Reactive getter ensures theme updates propagate correctly
  const t = () => theme();
  const { setInputFocused } = useInputFocus();

  // Claim/release input focus when visibility changes
  // This ensures App-level keyboard handler skips events while steering is open
  // Phase 2.1: Properly claim and release focus on visibility changes
  createEffect(() => {
    if (props.visible) {
      setInputFocused(true);
    } else {
      // Release focus when visibility changes to false (handles external close)
      setInputFocused(false);
    }
  });

  // Release focus on cleanup (component unmount)
  onCleanup(() => {
    // Always release focus on unmount if we were claiming it
    if (props.visible) {
      setInputFocused(false);
    }
  });

  /**
   * Close the overlay and release input focus.
   */
  const closeOverlay = () => {
    setInputFocused(false);
    setInput("");
    props.onClose();
  };

  // Handle keyboard events for the steering input
  useKeyboard((e: KeyEvent) => {
    if (!props.visible) return;

    // ESC: close overlay
    if (e.name === "escape" || e.name === "Escape") {
      closeOverlay();
      return;
    }

    // Enter: send message
    if (e.name === "return" || e.name === "enter" || e.name === "Enter") {
      const message = input().trim();
      if (message) {
        props.onSend(message);
      }
      closeOverlay();
      return;
    }

    // Backspace: delete last character
    if (e.name === "backspace" || e.name === "Backspace") {
      setInput((prev) => prev.slice(0, -1));
      return;
    }

    // Regular character input (single printable characters)
    if (e.raw && e.raw.length === 1 && !e.ctrl && !e.meta) {
      setInput((prev) => prev + e.raw);
    }
  });

  if (!props.visible) return null;

  return (
    <box
      position="absolute"
      width="100%"
      height="100%"
      justifyContent="center"
      alignItems="center"
      backgroundColor={t().backgroundElement}
    >
      <box
        width="60%"
        padding={1}
        borderStyle="single"
        borderColor={t().accent}
        backgroundColor={t().backgroundPanel}
        flexDirection="column"
      >
        {/* Title */}
        <text fg={t().accent}>Steer Agent</text>

        {/* Input box */}
        <box
          marginTop={1}
          padding={1}
          borderStyle="single"
          borderColor={t().border}
          backgroundColor={t().background}
        >
          <text fg={input() ? t().text : t().textMuted}>
            {input() || "Type message and press Enter"}
          </text>
        </box>

        {/* Help text - using separate <text> elements for colors */}
        <box flexDirection="row" marginTop={1}>
          <text fg={t().textMuted}>Enter</text>
          <text fg={t().borderSubtle}> send  </text>
          <text fg={t().textMuted}>Esc</text>
          <text fg={t().borderSubtle}> cancel</text>
        </box>
      </box>
    </box>
  );
}
