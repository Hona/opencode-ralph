/**
 * Theme-based color accessor functions.
 * 
 * This module provides reactive color accessors that integrate with the theme system.
 * These functions allow accessing theme colors outside of Solid components where hooks
 * cannot be used, while still respecting the current theme settings.
 * 
 * For components that can use hooks, prefer `useTheme()` from ThemeContext.
 * Use these accessors for:
 * - Utility functions that need theme colors
 * - Non-reactive contexts where direct color access is needed
 * - Gradual migration from legacy colors.ts
 * 
 * @example
 * // In a utility function
 * import { getColor, colors } from "./theme-colors";
 * const errorColor = getColor("error");
 * 
 * // Or use the colors proxy for cleaner syntax
 * const errorColor = colors.error;
 */

import { resolveTheme, type Theme, type ThemeColorKey, type ThemeMode } from "./theme-resolver";
import { defaultTheme } from "./themes/index";

/**
 * Current theme state - can be set by ThemeProvider or kept at defaults.
 * This is updated by setCurrentTheme() when the theme changes.
 */
let currentThemeName: string = defaultTheme;
let currentThemeMode: ThemeMode = "dark";
let cachedTheme: Theme | null = null;

/**
 * Set the current theme state. Called by ThemeProvider when theme changes.
 * Invalidates the cached theme to force re-resolution on next access.
 * 
 * @param themeName - Name of the theme to use
 * @param mode - Theme mode (dark/light)
 */
export function setCurrentTheme(themeName: string, mode: ThemeMode = "dark"): void {
  if (currentThemeName !== themeName || currentThemeMode !== mode) {
    currentThemeName = themeName;
    currentThemeMode = mode;
    cachedTheme = null; // Invalidate cache
  }
}

/**
 * Get the currently resolved theme object.
 * Uses caching to avoid re-resolving the theme on every access.
 * 
 * @returns The resolved Theme object with all color values
 */
export function getCurrentTheme(): Theme {
  if (!cachedTheme) {
    cachedTheme = resolveTheme(currentThemeName, currentThemeMode);
  }
  return cachedTheme;
}

/**
 * Get a single color value from the current theme.
 * 
 * @param key - The theme color key to retrieve
 * @returns The hex color string for the specified key
 * 
 * @example
 * const errorColor = getColor("error"); // "#ef5350"
 * const bgColor = getColor("background"); // "#011627"
 */
export function getColor(key: ThemeColorKey): string {
  return getCurrentTheme()[key];
}

/**
 * Get multiple color values from the current theme at once.
 * More efficient than calling getColor() multiple times.
 * 
 * @param keys - Array of theme color keys to retrieve
 * @returns Object mapping keys to their color values
 * 
 * @example
 * const { error, success, warning } = getColors(["error", "success", "warning"]);
 */
export function getColors<K extends ThemeColorKey>(keys: K[]): Pick<Theme, K> {
  const theme = getCurrentTheme();
  const result = {} as Pick<Theme, K>;
  for (const key of keys) {
    result[key] = theme[key];
  }
  return result;
}

/**
 * Proxy object for accessing theme colors with property syntax.
 * Provides a more ergonomic API for accessing individual colors.
 * 
 * Note: This is not reactive - it returns the current value at access time.
 * For reactive usage in Solid components, use `useTheme()` instead.
 * 
 * @example
 * import { colors } from "./theme-colors";
 * const bg = colors.background;
 * const fg = colors.text;
 */
export const colors: Readonly<Theme> = new Proxy({} as Theme, {
  get(_, prop: string) {
    return getColor(prop as ThemeColorKey);
  },
});

/**
 * Type-safe color accessor that validates the key at compile time.
 * Identical to getColor() but provides better IDE autocomplete.
 * 
 * @param key - The theme color key (with autocomplete)
 * @returns The hex color string
 */
export function color<K extends ThemeColorKey>(key: K): string {
  return getCurrentTheme()[key];
}

/**
 * Legacy color mapping - maps old color names to theme color keys.
 * Use this for gradual migration from the deprecated colors.ts.
 * 
 * @deprecated Use direct theme color keys instead
 */
const legacyColorMap: Record<string, ThemeColorKey> = {
  bg: "background",
  bgDark: "background",
  bgHighlight: "backgroundElement",
  bgPanel: "backgroundPanel",
  fg: "text",
  fgDark: "textMuted",
  fgMuted: "textMuted",
  green: "success",
  red: "error",
  yellow: "warning",
  blue: "info",
  purple: "accent",
  cyan: "secondary",
  border: "border",
  orange: "warning", // No direct equivalent, use warning
};

/**
 * Get a color using the legacy color name.
 * Useful for gradual migration from colors.ts.
 * 
 * @param legacyName - The old color name (e.g., "bg", "fg", "green")
 * @returns The corresponding theme color value
 * 
 * @deprecated Use getColor() with theme color keys instead
 * 
 * @example
 * // Old code:
 * import { colors } from "./colors";
 * const bg = colors.bg;
 * 
 * // Migration step:
 * import { getLegacyColor } from "./theme-colors";
 * const bg = getLegacyColor("bg");
 * 
 * // Final code:
 * import { getColor } from "./theme-colors";
 * const bg = getColor("background");
 */
export function getLegacyColor(legacyName: string): string {
  const themeKey = legacyColorMap[legacyName];
  if (themeKey) {
    return getColor(themeKey);
  }
  // Fallback: try as a direct theme key
  return getColor(legacyName as ThemeColorKey);
}

/**
 * Legacy colors proxy - maps old color property names to theme colors.
 * Drop-in replacement for the deprecated colors object from colors.ts.
 * 
 * @deprecated Use the `colors` proxy or `getColor()` instead
 * 
 * @example
 * // Replace:
 * import { colors } from "./colors";
 * // With:
 * import { legacyColors as colors } from "./theme-colors";
 */
export const legacyColors: Readonly<Record<string, string>> = new Proxy({} as Record<string, string>, {
  get(_, prop: string) {
    return getLegacyColor(prop);
  },
});

/**
 * Icons for different tool types displayed in the event log.
 * Uses Nerd Font glyphs for a modern look.
 */
export const TOOL_ICONS: Record<string, string> = {
  read: "󰈞", // Read icon
  write: "󰏫", // Write icon
  edit: "󰛓", // Edit icon
  glob: "center", // Glob icon
  grep: "󰱽", // Grep icon
  bash: "󰆍", // Bash icon
  task: "󰙨", // Task icon
  webfetch: "󰖟",
  websearch: "󰖟",
  codesearch: "󰖟",
  todowrite: "󰗡",
  todoread: "󰗡",
  thought: "󰋚", // Reasoning/Thought icon
};
