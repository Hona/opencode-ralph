import { For, Show, createSignal, onCleanup, onMount } from "solid-js";
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
  isRunning: boolean;
};

/**
 * Animated spinner component using braille characters
 */
function Spinner() {
  const [frame, setFrame] = createSignal(0);

  onMount(() => {
    const interval = setInterval(() => {
      setFrame((f) => (f + 1) % SPINNER_FRAMES.length);
    }, 120);

    onCleanup(() => clearInterval(interval));
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
 */
function SeparatorEvent(props: { event: ToolEvent }) {
  const durationText = () =>
    props.event.duration !== undefined
      ? formatDuration(props.event.duration)
      : "running";
  const commitCount = () => props.event.commitCount ?? 0;
  const commitText = () =>
    `${commitCount()} commit${commitCount() !== 1 ? "s" : ""}`;

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
 */
function ToolEventItem(props: { event: ToolEvent }) {
  const icon = () => props.event.icon || DEFAULT_ICON;
  const iconColor = () => getToolColor(props.event.icon);

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
 */
export function Log(props: LogProps) {
  // Create a derived list that includes a spinner placeholder at the end when running
  const itemsWithSpinner = () => {
    const items: Array<{ type: "event"; event: ToolEvent } | { type: "spinner" }> = 
      props.events.map(event => ({ type: "event" as const, event }));
    if (props.isRunning) {
      items.push({ type: "spinner" as const });
    }
    return items;
  };

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
      <For each={itemsWithSpinner()}>
        {(item) => (
          <Show
            when={item.type === "spinner"}
            fallback={
              <Show
                when={(item as { type: "event"; event: ToolEvent }).event.type === "separator"}
                fallback={<ToolEventItem event={(item as { type: "event"; event: ToolEvent }).event} />}
              >
                <SeparatorEvent event={(item as { type: "event"; event: ToolEvent }).event} />
              </Show>
            }
          >
            <Spinner />
          </Show>
        )}
      </For>
    </scrollbox>
  );
}
