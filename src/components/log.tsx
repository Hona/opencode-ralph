import { For, Match, Show, Switch, createEffect, createMemo, createSignal, onCleanup } from "solid-js";
import { colors, TOOL_ICONS } from "./colors";
import { formatDuration } from "../util/time";
import type { ToolEvent } from "../state";

// Braille spinner frames for smooth animation
const SPINNER_FRAMES = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"];

/**
 * Default icon when tool type is unknown
 */
const DEFAULT_ICON = "\u2699"; // ⚙

/**
 * Generates a stable key for an event item.
 * Uses iteration number and timestamp for uniqueness.
 * This ensures consistent identity across re-renders.
 */
export function getEventKey(event: ToolEvent): string {
  return `${event.iteration}-${event.timestamp}`;
}

/**
 * Maps tool types to their display colors.
 * - Blue: read operations (read)
 * - Green: write operations (write, edit)
 * - Yellow: search operations (glob, grep)
 * - Purple: task/delegation (task)
 * - Cyan: web operations (webfetch, websearch, codesearch)
 * - Muted: shell commands (bash)
 * - Default (fg): todo operations and unknown
 */
function getToolColor(icon: string | undefined): string {
  if (!icon) return colors.fg;

  // Map icons back to their semantic colors
  if (icon === TOOL_ICONS.read) return colors.blue;
  if (icon === TOOL_ICONS.write || icon === TOOL_ICONS.edit) return colors.green;
  if (icon === TOOL_ICONS.glob || icon === TOOL_ICONS.grep) return colors.yellow;
  if (icon === TOOL_ICONS.task) return colors.purple;
  if (
    icon === TOOL_ICONS.webfetch ||
    icon === TOOL_ICONS.websearch ||
    icon === TOOL_ICONS.codesearch
  )
    return colors.cyan;
  if (icon === TOOL_ICONS.bash) return colors.fgMuted;
  // todowrite and todoread use default fg color
  return colors.fg;
}

export type LogProps = {
  events: ToolEvent[];
  isIdle: boolean;
};

/**
 * Animated spinner component using braille characters.
 * Only animates when isIdle is false (tool events are arriving).
 * Shows static spinner when idle to reduce unnecessary re-renders.
 * 
 * PERF: Uses a single createEffect for start/stop logic. The effect runs
 * once on mount and whenever isIdle changes. The intervalRef guard ensures
 * only one interval is ever active.
 */
function Spinner(props: { isIdle: boolean }) {
  const [frame, setFrame] = createSignal(0);
  let intervalRef: ReturnType<typeof setInterval> | null = null;

  // Single effect handles both initial state and reactive updates.
  // Guards ensure interval is created only once.
  createEffect(() => {
    if (props.isIdle) {
      // Stop animation when idle
      if (intervalRef) {
        clearInterval(intervalRef);
        intervalRef = null;
      }
    } else {
      // Start animation when not idle (guard prevents multiple intervals)
      if (!intervalRef) {
        intervalRef = setInterval(() => {
          setFrame((f) => (f + 1) % SPINNER_FRAMES.length);
        }, 120);
      }
    }
  });

  // Cleanup on unmount
  onCleanup(() => {
    if (intervalRef) {
      clearInterval(intervalRef);
      intervalRef = null;
    }
  });

  return (
    <box width="100%" flexDirection="row" paddingTop={1}>
      <text fg={colors.cyan}>{SPINNER_FRAMES[frame()]}</text>
      <text fg={colors.fgMuted}> looping...</text>
    </box>
  );
}

/**
 * Renders an iteration separator line.
 * Format: ── iteration {n} ──────────── {duration} · {commits} commit(s) ──
 * 
 * Memoized to prevent re-computation of duration and commit text on every reactive update.
 */
function SeparatorEvent(props: { event: ToolEvent }) {
  const durationText = createMemo(() =>
    props.event.duration !== undefined
      ? formatDuration(props.event.duration)
      : "running"
  );
  const commitCount = createMemo(() => props.event.commitCount ?? 0);
  const commitText = createMemo(() =>
    `${commitCount()} commit${commitCount() !== 1 ? "s" : ""}`
  );

  return (
    <box width="100%" paddingTop={1} paddingBottom={1} flexDirection="row">
      <text fg={colors.fgMuted}>{"── "}</text>
      <text fg={colors.fg}>iteration {props.event.iteration}</text>
      <text fg={colors.fgMuted}>{" ────────────── "}</text>
      <text fg={colors.fg}>{durationText()}</text>
      <text fg={colors.fgMuted}>{" · "}</text>
      <text fg={colors.fg}>{commitText()}</text>
      <text fg={colors.fgMuted}>{" ──"}</text>
    </box>
  );
}

/**
 * Renders a tool event line.
 * Format: {icon} {text}
 * Icon color is based on tool type (blue for read, green for write/edit, etc.)
 * 
 * Memoized to prevent re-computation of icon and color on every reactive update.
 */
function ToolEventItem(props: { event: ToolEvent }) {
  const icon = createMemo(() => props.event.icon || DEFAULT_ICON);
  const iconColor = createMemo(() => getToolColor(props.event.icon));

  return (
    <box width="100%" flexDirection="row">
      <text fg={iconColor()}>{icon()}</text>
      <text fg={colors.fg}> {props.event.text}</text>
    </box>
  );
}

/**
 * Scrollable event log component displaying tool events and iteration separators.
 * Uses stickyScroll to keep the view at the bottom as new events arrive.
 * 
 * PERF: Uses <For> directly on props.events to avoid allocating wrapper objects.
 * Spinner is managed as an event in the array, always kept at the end to ensure
 * it renders at the bottom of the scrollable content.
 */
export function Log(props: LogProps) {
  return (
    <scrollbox
      flexGrow={1}
      stickyScroll={true}
      stickyStart="bottom"
      rootOptions={{
        backgroundColor: colors.bg,
      }}
      viewportOptions={{
        backgroundColor: colors.bgDark,
      }}
      verticalScrollbarOptions={{
        visible: true,
        trackOptions: {
          backgroundColor: colors.border,
        },
      }}
    >
      <For each={props.events}>
        {(event) => (
          <Switch>
            <Match when={event.type === "spinner"}>
              <Spinner isIdle={props.isIdle} />
            </Match>
            <Match when={event.type === "separator"}>
              <SeparatorEvent event={event} />
            </Match>
            <Match when={event.type === "tool"}>
              <ToolEventItem event={event} />
            </Match>
          </Switch>
        )}
      </For>
    </scrollbox>
  );
}
