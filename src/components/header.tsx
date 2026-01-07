import { createMemo } from "solid-js";
import { colors } from "./colors";
import { formatEta } from "../util/time";

export type HeaderProps = {
  status: "starting" | "running" | "paused" | "complete" | "error";
  iteration: number;
  tasksComplete: number;
  totalTasks: number;
  eta: number | null;
};

/**
 * Header component displaying status, iteration, tasks, and ETA.
 * Compact single-line layout for log-centric view.
 */
export function Header(props: HeaderProps) {
  // Status indicator with appropriate icon and color
  const getStatusDisplay = () => {
    switch (props.status) {
      case "running":
        return { icon: "●", color: colors.green };
      case "paused":
        return { icon: "⏸", color: colors.yellow };
      case "complete":
        return { icon: "✓", color: colors.green };
      case "error":
        return { icon: "✗", color: colors.red };
      case "starting":
      default:
        return { icon: "◌", color: colors.fgMuted };
    }
  };

  const statusDisplay = getStatusDisplay();

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
      backgroundColor={colors.bgPanel}
    >
      {/* Status indicator */}
      <text fg={statusDisplay.color}>{statusDisplay.icon}</text>
      <text fg={colors.fg}> {props.status}</text>

      {/* Separator */}
      <text fg={colors.fgDark}>{" │ "}</text>

      {/* Iteration display */}
      <text fg={colors.fgMuted}>iter </text>
      <text fg={colors.fg}>{props.iteration}</text>

      {/* Separator */}
      <text fg={colors.fgDark}>{" │ "}</text>

      {/* Task progress with inline progress bar */}
      <text fg={colors.fgMuted}>{filledBar()}</text>
      <text fg={colors.fgDark}>{emptyBar()}</text>
      <text fg={colors.fg}> {props.tasksComplete}/{props.totalTasks}</text>

      {/* Separator */}
      <text fg={colors.fgDark}>{" │ "}</text>

      {/* ETA display */}
      <text fg={colors.fgMuted}>{formatEta(props.eta)}</text>
    </box>
  );
}

