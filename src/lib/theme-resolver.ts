import { themes, defaultTheme, type ThemeJson, type ThemeColorValue } from "./themes/index";

/**
 * Mode type for dark/light theming
 */
export type ThemeMode = "dark" | "light";

/**
 * Resolved theme with all color values as hex strings
 */
export interface Theme {
  // Core UI colors
  primary: string;
  secondary: string;
  accent: string;
  error: string;
  warning: string;
  success: string;
  info: string;
  
  // Text colors
  text: string;
  textMuted: string;
  
  // Background colors
  background: string;
  backgroundPanel: string;
  backgroundElement: string;
  
  // Border colors
  border: string;
  borderActive: string;
  borderSubtle: string;
  
  // Diff colors
  diffAdded: string;
  diffRemoved: string;
  diffContext: string;
  diffHunkHeader: string;
  diffHighlightAdded: string;
  diffHighlightRemoved: string;
  diffAddedBg: string;
  diffRemovedBg: string;
  diffContextBg: string;
  diffLineNumber: string;
  diffAddedLineNumberBg: string;
  diffRemovedLineNumberBg: string;
  
  // Markdown colors
  markdownText: string;
  markdownHeading: string;
  markdownLink: string;
  markdownLinkText: string;
  markdownCode: string;
  markdownBlockQuote: string;
  markdownEmph: string;
  markdownStrong: string;
  markdownHorizontalRule: string;
  markdownListItem: string;
  markdownListEnumeration: string;
  markdownImage: string;
  markdownImageText: string;
  markdownCodeBlock: string;
  
  // Syntax highlighting colors
  syntaxComment: string;
  syntaxKeyword: string;
  syntaxFunction: string;
  syntaxVariable: string;
  syntaxString: string;
  syntaxNumber: string;
  syntaxType: string;
  syntaxOperator: string;
  syntaxPunctuation: string;
}

/**
 * All possible theme color keys
 */
export type ThemeColorKey = keyof Theme;

/**
 * Resolve a color value, handling variable references to defs
 */
function resolveColorValue(
  value: ThemeColorValue,
  defs: Record<string, string>,
  mode: ThemeMode
): string {
  // Handle dark/light mode object
  if (typeof value === "object" && value !== null) {
    const modeValue = value[mode];
    // Resolve the mode-specific value (may be a def reference or direct hex)
    return resolveColorRef(modeValue, defs);
  }
  
  // Direct string value
  return resolveColorRef(value, defs);
}

/**
 * Resolve a single color reference (either a def key or direct hex)
 */
function resolveColorRef(value: string, defs: Record<string, string>): string {
  // If it starts with #, it's a direct hex color
  if (value.startsWith("#")) {
    return value;
  }
  
  // Otherwise, it's a reference to a def
  const resolved = defs[value];
  if (resolved) {
    return resolved;
  }
  
  // Fallback if def not found - return the value as-is (shouldn't happen with valid themes)
  return value;
}

/**
 * Resolve a theme JSON to a Theme object with all hex color values
 */
export function resolveTheme(
  themeName: string = defaultTheme,
  mode: ThemeMode = "dark"
): Theme {
  const themeJson = themes[themeName] ?? themes[defaultTheme];
  
  if (!themeJson) {
    throw new Error(`Theme "${themeName}" not found and no default theme available`);
  }
  
  const { defs, theme } = themeJson;
  
  // Build the resolved theme by resolving each color key
  const resolved: Partial<Theme> = {};
  
  for (const [key, value] of Object.entries(theme)) {
    (resolved as Record<string, string>)[key] = resolveColorValue(value, defs, mode);
  }
  
  return resolved as Theme;
}

/**
 * Get a single resolved color from a theme
 */
export function getThemeColor(
  themeName: string,
  colorKey: ThemeColorKey,
  mode: ThemeMode = "dark"
): string {
  const theme = resolveTheme(themeName, mode);
  return theme[colorKey];
}

/**
 * Check if a theme name is valid
 */
export function isValidTheme(themeName: string): boolean {
  return themeName in themes;
}

/**
 * Get list of available theme names
 */
export { themeNames } from "./themes/index";
