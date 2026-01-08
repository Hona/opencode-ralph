/**
 * Centralized keybind definitions for the application.
 * This file serves as a single source of truth for all keyboard shortcuts.
 */

/**
 * Keybind definition with key combination and display label.
 */
export interface KeybindDef {
  /** Key name (e.g., "p", "t", "c") */
  key: string;
  /** Whether Ctrl modifier is required */
  ctrl?: boolean;
  /** Whether Shift modifier is required */
  shift?: boolean;
  /** Whether Meta/Cmd modifier is required */
  meta?: boolean;
  /** Human-readable label for display (e.g., "Ctrl+P") */
  label: string;
}

/**
 * All application keybinds defined in one place.
 * Add new keybinds here to ensure consistency across the app.
 */
export const keymap = {
  /** Copy the attach command to clipboard */
  copyAttach: {
    key: "c",
    shift: true,
    label: "Shift+C",
  } as KeybindDef,

  /** Open terminal configuration dialog */
  terminalConfig: {
    key: "t",
    label: "T",
  } as KeybindDef,

  /** Toggle the tasks panel visibility */
  toggleTasks: {
    key: "t",
    shift: true,
    label: "Shift+T",
  } as KeybindDef,

  /** Toggle pause/resume state */
  togglePause: {
    key: "p",
    label: "P",
  } as KeybindDef,

  /** Quit the application */
  quit: {
    key: "q",
    label: "Q",
  } as KeybindDef,

  /** Open steering mode for sending messages */
  steer: {
    key: ":",
    label: ":",
  } as KeybindDef,

  /** Open command palette */
  commandPalette: {
    key: "c",
    label: "C",
  } as KeybindDef,
} as const;

/**
 * Type for keymap keys.
 */
export type KeymapKey = keyof typeof keymap;

/**
 * Check if a key event matches a keybind definition.
 * @param e - The key event to check (must have name, ctrl, shift, meta properties)
 * @param keybind - The keybind definition to match against
 * @returns true if the key event matches the keybind
 */
export function matchesKeybind(
  e: { name: string; ctrl?: boolean; shift?: boolean; meta?: boolean },
  keybind: KeybindDef
): boolean {
  const keyMatches = e.name.toLowerCase() === keybind.key.toLowerCase();
  const ctrlMatches = !!e.ctrl === !!keybind.ctrl;
  const shiftMatches = !!e.shift === !!keybind.shift;
  const metaMatches = !!e.meta === !!keybind.meta;

  return keyMatches && ctrlMatches && shiftMatches && metaMatches;
}

/**
 * Get a formatted keybind string for display purposes.
 * @param keybind - The keybind definition
 * @returns Formatted string like "Ctrl+Shift+P"
 */
export function formatKeybind(keybind: KeybindDef): string {
  return keybind.label;
}
