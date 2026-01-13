import type { DetailsViewMode, TaskStatus } from "./tui-types";

export const statusIndicators = {
  ready: "◉",
  running: "▶",
  paused: "⏸",
  complete: "✓",
  error: "✗",
  starting: "○",
} as const;

export const taskStatusIndicators: Record<TaskStatus, string> = {
  done: "✓",
  actionable: "▶",
  pending: "○",
};

export const layout = {
  header: {
    height: 1,
  },
  footer: {
    height: 3,
  },
  progressDashboard: {
    height: 6,
  },
  leftPanel: {
    minWidth: 30,
    maxWidth: 50,
    defaultWidthPercent: 35,
  },
  rightPanel: {
    minWidth: 40,
  },
  padding: {
    small: 1,
    medium: 2,
  },
} as const;

export type KeyboardShortcut = {
  key: string;
  description: string;
};

export type FullKeyboardShortcut = KeyboardShortcut & {
  category: string;
};

export const keyboardShortcuts: KeyboardShortcut[] = [
  { key: "q", description: "Quit" },
  { key: "p", description: "Pause/Resume" },
  { key: "c", description: "Commands" },
  { key: "t", description: "Terminal" },
  { key: "T", description: "Tasks" },
  { key: "o", description: "Details/Output" },
  { key: "↑↓", description: "Navigate" },
  { key: "?", description: "Help" },
];

export const fullKeyboardShortcuts: FullKeyboardShortcut[] = [
  { key: "?", description: "Show/hide this help", category: "General" },
  { key: "q", description: "Quit Ralph", category: "General" },
  { key: "Esc", description: "Hide tasks/help", category: "General" },
  { key: "c", description: "Open command palette", category: "General" },
  { key: "t", description: "Launch terminal", category: "General" },
  { key: "s", description: "Start execution", category: "Execution" },
  { key: "p", description: "Pause / Resume execution", category: "Execution" },
  { key: ":", description: "Steer active session", category: "Execution" },
  { key: "o", description: "Toggle details / output view", category: "Views" },
  { key: "T", description: "Show / hide task list", category: "Views" },
  { key: "d", description: "Toggle progress dashboard", category: "Views" },
  { key: "↑ / k", description: "Move selection up", category: "Navigation" },
  { key: "↓ / j", description: "Move selection down", category: "Navigation" },
  { key: "Enter", description: "Select task", category: "Navigation" },
];

export function formatElapsedTime(seconds: number): string {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = seconds % 60;

  if (hours > 0) {
    return `${hours}h ${minutes}m ${secs}s`;
  }
  if (minutes > 0) {
    return `${minutes}m ${secs}s`;
  }
  return `${secs}s`;
}

export function formatViewMode(viewMode: DetailsViewMode): string {
  return viewMode === "details" ? "[Details]" : "[Output]";
}
