import { Show } from "solid-js";
import { useTheme } from "../context/ThemeContext";
import { formatViewMode, taskStatusIndicators } from "./tui-theme";
import type { DetailsViewMode, TaskStatus, UiTask } from "./tui-types";
import type { ToolEvent } from "../state";
import { Log } from "./log";
import { TerminalPane } from "./terminal-pane";

export type RightPanelProps = {
  selectedTask: UiTask | null;
  viewMode: DetailsViewMode;
  adapterMode: "sdk" | "pty";
  events: ToolEvent[];
  isIdle: boolean;
  errorRetryAt?: number;
  terminalBuffer?: string;
  terminalCols: number;
  terminalRows: number;
};

function getStatusColor(status: TaskStatus, theme: ReturnType<typeof useTheme>["theme"]): string {
  const t = theme();
  switch (status) {
    case "done":
      return t.success;
    case "actionable":
      return t.success;
    case "pending":
    default:
      return t.textMuted;
  }
}

function NoSelection() {
  const { theme } = useTheme();
  const t = () => theme();

  return (
    <box flexGrow={1} flexDirection="column" padding={2}>
      <box marginBottom={1}>
        <text fg={t().text}>Getting Started</text>
      </box>
      <box marginBottom={2}>
        <text fg={t().textMuted}>
          No tasks available. Run `ralph init` or add tasks to your plan.
        </text>
      </box>
      <text fg={t().textMuted}>Press q to quit</text>
    </box>
  );
}

function TaskDetails(props: { task: UiTask }) {
  const { theme } = useTheme();
  const t = () => theme();

  const statusColor = () => getStatusColor(props.task.status, theme);
  const statusIndicator = () => taskStatusIndicators[props.task.status];

  return (
    <box flexDirection="column" padding={1} flexGrow={1}>
      <scrollbox flexGrow={1}>
        <box marginBottom={1}>
          <text fg={statusColor()}>{statusIndicator()}</text>
          <text fg={t().text}> {props.task.title}</text>
          <text fg={t().textMuted}> ({props.task.id})</text>
        </box>

        <box marginBottom={1}>
          <text fg={t().textMuted}>Status: </text>
          <text fg={statusColor()}>{props.task.status}</text>
        </box>

        <Show when={props.task.line !== undefined}>
          <box marginBottom={1}>
            <text fg={t().textMuted}>Plan line: </text>
            <text fg={t().text}>{props.task.line}</text>
          </box>
        </Show>

        <box marginBottom={1}>
          <text fg={t().primary}>Description</text>
        </box>
        <box
          padding={1}
          border
          borderColor={t().borderSubtle}
          backgroundColor={t().backgroundElement}
        >
          <text fg={t().text}>{props.task.description ?? props.task.title}</text>
        </box>
      </scrollbox>
    </box>
  );
}

function OutputView(props: {
  adapterMode: "sdk" | "pty";
  events: ToolEvent[];
  isIdle: boolean;
  errorRetryAt?: number;
  terminalBuffer?: string;
  terminalCols: number;
  terminalRows: number;
}) {
  return (
    <box flexGrow={1} flexDirection="column">
      <Show
        when={props.adapterMode === "pty"}
        fallback={
          <Log
            events={props.events}
            isIdle={props.isIdle}
            errorRetryAt={props.errorRetryAt}
          />
        }
      >
        <TerminalPane
          buffer={props.terminalBuffer || ""}
          cols={props.terminalCols}
          rows={props.terminalRows}
        />
      </Show>
    </box>
  );
}

export function RightPanel(props: RightPanelProps) {
  const { theme } = useTheme();
  const t = () => theme();

  const title = () => `Details ${formatViewMode(props.viewMode)}`;

  return (
    <box
      title={title()}
      flexGrow={2}
      flexShrink={1}
      minWidth={40}
      flexDirection="column"
      backgroundColor={t().background}
      border
      borderColor={t().border}
    >
      <Show
        when={props.viewMode === "output"}
        fallback={
          <Show when={props.selectedTask} fallback={<NoSelection />}>
            {(task) => <TaskDetails task={task()} />}
          </Show>
        }
      >
        <OutputView
          adapterMode={props.adapterMode}
          events={props.events}
          isIdle={props.isIdle}
          errorRetryAt={props.errorRetryAt}
          terminalBuffer={props.terminalBuffer}
          terminalCols={props.terminalCols}
          terminalRows={props.terminalRows}
        />
      </Show>
    </box>
  );
}
