import { createMemo } from "solid-js";
import { useTheme } from "../context/ThemeContext";
import { formatElapsedTime, layout, statusIndicators } from "./tui-theme";
import type { RalphStatus, UiTask } from "./tui-types";
import { formatEta } from "../util/time";

export type HeaderProps = {
  status: RalphStatus;
  iteration: number;
  tasksComplete: number;
  totalTasks: number;
  elapsedMs: number;
  eta: number | null;
  selectedTask?: UiTask | null;
  agentName?: string;
  adapterName?: string;
  debug?: boolean;
};

function truncateText(text: string, maxWidth: number): string {
  if (text.length <= maxWidth) return text;
  if (maxWidth <= 3) return text.slice(0, maxWidth);
  return text.slice(0, maxWidth - 1) + "…";
}

function getStatusDisplay(status: RalphStatus, theme: ReturnType<typeof useTheme>["theme"]) {
  const t = theme();
  switch (status) {
    case "ready":
      return { indicator: statusIndicators.ready, color: t.info, label: "Ready" };
    case "running":
      return { indicator: statusIndicators.running, color: t.success, label: "Running" };
    case "paused":
      return { indicator: statusIndicators.paused, color: t.warning, label: "Paused" };
    case "complete":
      return { indicator: statusIndicators.complete, color: t.success, label: "Complete" };
    case "error":
      return { indicator: statusIndicators.error, color: t.error, label: "Error" };
    case "starting":
    default:
      return { indicator: statusIndicators.starting, color: t.textMuted, label: "Starting" };
  }
}

function MiniProgressBar(props: {
  completed: number;
  total: number;
  width: number;
  filledColor: string;
  emptyColor: string;
}) {
  const percentage = () => (props.total > 0 ? Math.round((props.completed / props.total) * 100) : 0);
  const filledWidth = () => Math.floor((percentage() / 100) * props.width);
  const emptyWidth = () => props.width - filledWidth();

  return (
    <box flexDirection="row">
      <text fg={props.filledColor}>{"▓".repeat(filledWidth())}</text>
      <text fg={props.emptyColor}>{"░".repeat(emptyWidth())}</text>
    </box>
  );
}

export function Header(props: HeaderProps) {
  const { theme } = useTheme();
  const t = () => theme();

  const statusDisplay = () => getStatusDisplay(props.status, theme);
  const elapsedSeconds = createMemo(() => Math.floor(props.elapsedMs / 1000));
  const formattedTime = createMemo(() => formatElapsedTime(elapsedSeconds()));
  const formattedEta = createMemo(() => formatEta(props.eta));

  const taskDisplay = createMemo(() => {
    if (!props.selectedTask) return null;
    if (props.status !== "running" && props.status !== "paused") return null;
    return truncateText(props.selectedTask.title, 40);
  });

  const taskLabel = createMemo(() => taskDisplay());

  return (
    <box
      width="100%"
      height={layout.header.height}
      flexDirection="row"
      justifyContent="space-between"
      alignItems="center"
      paddingLeft={1}
      paddingRight={1}
      backgroundColor={t().backgroundPanel}
    >
      <box flexDirection="row" gap={1} flexShrink={1}>
        {props.debug && (
          <>
            <text fg={t().warning}>[DEBUG]</text>
            <text fg={t().textMuted}> </text>
          </>
        )}
        <text fg={statusDisplay().color}>{statusDisplay().indicator}</text>
        <text fg={statusDisplay().color}> {statusDisplay().label}</text>
        {taskLabel() && (
          <>
            <text fg={t().textMuted}> → </text>
            <text fg={t().secondary}>{taskLabel()}</text>
          </>
        )}
      </box>

      <box flexDirection="row" gap={2} alignItems="center">
        {(props.agentName || props.adapterName) && (
          <box flexDirection="row" gap={1}>
            {props.agentName && <text fg={t().secondary}>{props.agentName}</text>}
            {props.agentName && props.adapterName && <text fg={t().textMuted}>/</text>}
            {props.adapterName && <text fg={t().primary}>{props.adapterName}</text>}
          </box>
        )}

        <box flexDirection="row" gap={1} alignItems="center">
          <text fg={t().textMuted}>iter</text>
          <text fg={t().text}>{props.iteration}</text>
        </box>

        <box flexDirection="row" gap={1} alignItems="center">
          <MiniProgressBar
            completed={props.tasksComplete}
            total={props.totalTasks}
            width={8}
            filledColor={t().success}
            emptyColor={t().textMuted}
          />
          <text fg={t().text}>
            {props.tasksComplete}/{props.totalTasks}
          </text>
        </box>

        <box flexDirection="row" gap={1} alignItems="center">
          <text fg={t().textMuted}>⏱</text>
          <text fg={t().text}>{formattedTime()}</text>
        </box>

        <text fg={t().textMuted}>{formattedEta()}</text>
      </box>
    </box>
  );
}
