import { createMemo } from "solid-js";
import { useTheme } from "../context/ThemeContext";
import { formatEta } from "../util/time";

export type HeaderProps = {
  status: "starting" | "running" | "paused" | "complete" | "error" | "ready";
  iteration: number;
  tasksComplete: number;
  totalTasks: number;
  eta: number | null;
  debug?: boolean;
};

/**
 * Header component displaying status, iteration, tasks, and ETA.
 * Compact single-line layout for log-centric view.
 * 
 * NOTE: Uses reactive theme getter `t()` for proper theme updates.
 */
export function Header(props: HeaderProps) {
  const { theme } = useTheme();
  // Reactive getter ensures theme updates propagate correctly
  const t = () => theme();
  
  // Status indicator with appropriate icon and color - reactive via getter
  const getStatusDisplay = () => {
    const colors = t();
    switch (props.status) {
      case "running":
        return { icon: "●", color: colors.success };
      case "paused":
        return { icon: "⏸", color: colors.warning };
      case "complete":
        return { icon: "✓", color: colors.success };
      case "error":
        return { icon: "✗", color: colors.error };
      case "ready":
        return { icon: "○", color: colors.info };
      case "starting":
      default:
        return { icon: "◌", color: colors.textMuted };
    }
  };

  // Memoize progress bar strings - only recompute when tasksComplete or totalTasks change
  const filledCount = createMemo(() =>
    props.totalTasks > 0
      ? Math.round((props.tasksComplete / props.totalTasks) * 8)
      : 0
  );
  const filledBar = createMemo(() => "█".repeat(filledCount()));
  const emptyBar = createMemo(() => "░".repeat(8 - filledCount()));
  
  return (
    <box
      flexDirection="row"
      width="100%"
      height={1}
      alignItems="center"
      paddingLeft={1}
      paddingRight={1}
      backgroundColor={t().backgroundPanel}
    >
      {/* Debug mode badge */}
      {props.debug && (
        <>
          <text fg={t().warning}>[DEBUG]</text>
          <text fg={t().borderSubtle}>{" "}</text>
        </>
      )}

      {/* Status indicator */}
      <text fg={getStatusDisplay().color}>{getStatusDisplay().icon}</text>
      <text fg={t().text}> {props.status}</text>

      {/* Separator */}
      <text fg={t().borderSubtle}>{" │ "}</text>

      {/* Iteration display */}
      <text fg={t().textMuted}>iter </text>
      <text fg={t().text}>{props.iteration}</text>

      {/* Separator */}
      <text fg={t().borderSubtle}>{" │ "}</text>

      {/* Task progress with inline progress bar */}
      <text fg={t().textMuted}>{filledBar()}</text>
      <text fg={t().borderSubtle}>{emptyBar()}</text>
      <text fg={t().text}> {props.tasksComplete}/{props.totalTasks}</text>

      {/* Separator */}
      <text fg={t().borderSubtle}>{" │ "}</text>

      {/* ETA display */}
      <text fg={t().textMuted}>{formatEta(props.eta)}</text>
    </box>
  );
}

