/**
 * Event type definitions for the activity log.
 *
 * This module provides centralized type definitions, icons, and colors
 * for activity events displayed in the Ralph TUI. Events represent
 * discrete actions or state changes during a session.
 *
 * @module events
 */

import type { ThemeColorKey } from "../lib/theme-resolver";

/**
 * Event type categories for the activity log.
 * Used for filtering, styling, and categorizing events.
 */
export type ActivityEventType =
  | "session_start"
  | "session_idle"
  | "task"
  | "file_edit"
  | "file_read"
  | "error"
  | "user_message"
  | "assistant_message"
  | "reasoning"
  | "tool_use"
  | "info";

/**
 * Icon map for activity event types.
 * Uses Nerd Font glyphs for a modern look.
 *
 * Icons are chosen to visually distinguish event categories:
 * - Session events: play/pause symbols
 * - File events: document icons
 * - Message events: speech bubble variants
 * - Tool events: gear/wrench icons
 */
export const EVENT_ICONS: Record<ActivityEventType, string> = {
  session_start: "󰐊", // Play icon
  session_idle: "󰏤", // Pause icon
  task: "󰗡", // Checkbox icon
  file_edit: "󰛓", // Edit/pencil icon
  file_read: "󰈞", // Read/eye icon
  error: "󰅚", // Error/x-circle icon
  user_message: "󰭻", // User chat icon
  assistant_message: "󰚩", // Bot/assistant icon
  reasoning: "󰋚", // Brain/thought icon
  tool_use: "󰙨", // Tool/wrench icon
  info: "󰋽", // Info icon
};

/**
 * Color key map for activity event types.
 * Maps each event type to its corresponding theme color key.
 *
 * Color semantics:
 * - Green (success): positive outcomes, file writes
 * - Blue (info): informational events, file reads
 * - Red (error): errors and failures
 * - Yellow (warning): reasoning, caution
 * - Purple (accent): user interactions
 * - Cyan (secondary): assistant responses
 * - Default (text): general events
 */
export const EVENT_COLOR_KEYS: Record<ActivityEventType, ThemeColorKey> = {
  session_start: "success",
  session_idle: "textMuted",
  task: "accent",
  file_edit: "success",
  file_read: "info",
  error: "error",
  user_message: "accent",
  assistant_message: "secondary",
  reasoning: "warning",
  tool_use: "text",
  info: "info",
};

/**
 * Get the icon for an activity event type.
 *
 * @param type - The activity event type
 * @returns The Nerd Font icon string for the event type
 *
 * @example
 * ```ts
 * const icon = getEventIcon("file_edit"); // "󰛓"
 * ```
 */
export function getEventIcon(type: ActivityEventType): string {
  return EVENT_ICONS[type];
}

/**
 * Get the theme color key for an activity event type.
 *
 * @param type - The activity event type
 * @returns The ThemeColorKey to use for styling this event type
 *
 * @example
 * ```ts
 * const colorKey = getEventColorKey("error"); // "error"
 * const color = theme[colorKey]; // "#ef5350"
 * ```
 */
export function getEventColorKey(type: ActivityEventType): ThemeColorKey {
  return EVENT_COLOR_KEYS[type];
}
