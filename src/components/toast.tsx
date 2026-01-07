import { For } from "solid-js";
import { useTheme } from "../context/ThemeContext";
import { useToast, type Toast, type ToastVariant } from "../context/ToastContext";

/**
 * Get the foreground color for a toast variant.
 * Uses theme colors for consistency.
 */
function getVariantColor(variant: ToastVariant, theme: ReturnType<ReturnType<typeof useTheme>["theme"]>): string {
  switch (variant) {
    case "success":
      return theme.success;
    case "error":
      return theme.error;
    case "warning":
      return theme.warning;
    case "info":
    default:
      return theme.info;
  }
}

/**
 * Get the icon for a toast variant.
 * Uses simple ASCII characters for terminal compatibility.
 */
function getVariantIcon(variant: ToastVariant): string {
  switch (variant) {
    case "success":
      return "✓";
    case "error":
      return "✗";
    case "warning":
      return "⚠";
    case "info":
    default:
      return "ℹ";
  }
}

/**
 * Single toast item component.
 * Displays the icon, message, and applies variant-specific styling.
 * When fading, uses muted colors to simulate fade-out animation.
 */
function ToastItem(props: { toast: Toast }) {
  const { theme } = useTheme();
  const t = theme();
  const isFading = () => props.toast.fading ?? false;
  
  // Use muted color when fading out
  const variantColor = isFading() 
    ? t.textMuted 
    : getVariantColor(props.toast.variant, t);
  const textColor = isFading() ? t.textMuted : t.text;
  const icon = getVariantIcon(props.toast.variant);

  return (
    <box
      flexDirection="row"
      width="100%"
      height={1}
      alignItems="center"
      paddingLeft={1}
      paddingRight={1}
      backgroundColor={t.backgroundPanel}
    >
      <text fg={variantColor}>{icon}</text>
      <text fg={textColor}> {props.toast.message}</text>
    </box>
  );
}

/**
 * ToastStack component that renders all active toasts.
 * Positioned at the bottom of the screen above the footer.
 * Renders toasts in order with newest at the bottom.
 */
export function ToastStack() {
  const { toasts } = useToast();
  const { theme } = useTheme();
  const t = theme();

  // Only render when there are toasts to show
  const currentToasts = toasts();
  if (currentToasts.length === 0) {
    return null;
  }

  return (
    <box
      position="absolute"
      bottom={1}
      left={0}
      width="100%"
      flexDirection="column"
      backgroundColor={t.backgroundPanel}
    >
      <For each={currentToasts}>
        {(toast) => <ToastItem toast={toast} />}
      </For>
    </box>
  );
}
