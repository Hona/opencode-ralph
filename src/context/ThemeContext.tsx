import {
  createContext,
  useContext,
  createSignal,
  createMemo,
  createEffect,
  onMount,
  JSX,
} from "solid-js";
import type { Accessor, Setter } from "solid-js";
import { resolveTheme, type Theme, type ThemeMode } from "../lib/theme-resolver";
import { themeNames, defaultTheme } from "../lib/themes/index";
import { setCurrentTheme } from "../lib/theme-colors";
import { log } from "../util/log";

/**
 * Ralph state from kv.json
 */
interface RalphState {
  theme?: string;
  theme_mode?: ThemeMode;
}

/**
 * Context value interface defining theme access and mutation.
 */
export interface ThemeContextValue {
  /** Current resolved theme with all color values */
  theme: Accessor<Theme>;
  /** Current theme name */
  themeName: Accessor<string>;
  /** Current theme mode (dark/light) */
  themeMode: Accessor<ThemeMode>;
  /** List of all available theme names */
  themeNames: readonly string[];
  /** Set theme name (persists to kv.json) */
  setThemeName: (name: string) => void;
  /** Set theme mode (persists to kv.json) */
  setThemeMode: (mode: ThemeMode) => void;
}

// Create the context with undefined default (must be used within provider)
const ThemeContext = createContext<ThemeContextValue>();

/**
 * Props for the ThemeProvider component.
 */
export interface ThemeProviderProps {
  children: JSX.Element;
}

/**
 * Get the path to Ralph's kv.json state file.
 * Creates the directory if it doesn't exist.
 */
function getKvPath(): string {
  const homeDir = process.env.HOME || process.env.USERPROFILE || "";
  return `${homeDir}/.local/state/ralph/kv.json`;
}

/**
 * Ensure the state directory exists.
 */
async function ensureStateDir(): Promise<void> {
  const homeDir = process.env.HOME || process.env.USERPROFILE || "";
  const stateDir = `${homeDir}/.local/state/ralph`;
  const { mkdir } = await import("fs/promises");
  await mkdir(stateDir, { recursive: true });
}

/**
 * Read Ralph state from ~/.local/state/ralph/kv.json
 */
async function readRalphState(): Promise<RalphState> {
  try {
    const kvPath = getKvPath();
    const file = Bun.file(kvPath);
    if (await file.exists()) {
      const content = await file.text();
      return JSON.parse(content) as RalphState;
    }
  } catch (error) {
    log("theme", "Failed to read Ralph state", { error });
  }
  return {};
}

/**
 * Write Ralph state to ~/.local/state/ralph/kv.json
 * Merges with existing state to preserve other keys.
 */
async function writeRalphState(updates: Partial<RalphState>): Promise<void> {
  try {
    await ensureStateDir();
    const kvPath = getKvPath();
    const existing = await readRalphState();
    const merged = { ...existing, ...updates };
    await Bun.write(kvPath, JSON.stringify(merged, null, 2));
    log("theme", "Saved theme preference", updates);
  } catch (error) {
    log("theme", "Failed to write Ralph state", { error });
  }
}

/**
 * ThemeProvider component that manages theme state.
 * Reads theme preference from Ralph's state file.
 */
export function ThemeProvider(props: ThemeProviderProps) {
  // Theme state signals
  const [themeName, setThemeNameSignal] = createSignal<string>(defaultTheme);
  const [themeMode, setThemeModeSignal] = createSignal<ThemeMode>("dark");

  // Derived resolved theme - recomputes when name or mode changes
  const theme = createMemo(() => {
    return resolveTheme(themeName(), themeMode());
  });

  // Sync theme state with color accessor module for non-reactive usage
  createEffect(() => {
    setCurrentTheme(themeName(), themeMode());
  });

  // Read theme preference from Ralph state on mount
  onMount(async () => {
    const state = await readRalphState();
    
    if (state.theme && themeNames.includes(state.theme)) {
      setThemeNameSignal(state.theme);
      log("theme", "Loaded theme from Ralph state", { theme: state.theme });
    }
    
    if (state.theme_mode && (state.theme_mode === "dark" || state.theme_mode === "light")) {
      setThemeModeSignal(state.theme_mode);
      log("theme", "Loaded theme mode from Ralph state", { mode: state.theme_mode });
    }
  });

  // Wrapper to set theme name and persist
  const setThemeName = (name: string) => {
    if (!themeNames.includes(name)) {
      log("theme", "Invalid theme name", { name, available: themeNames });
      return;
    }
    setThemeNameSignal(name);
    writeRalphState({ theme: name });
  };

  // Wrapper to set theme mode and persist
  const setThemeMode = (mode: ThemeMode) => {
    if (mode !== "dark" && mode !== "light") {
      log("theme", "Invalid theme mode", { mode });
      return;
    }
    setThemeModeSignal(mode);
    writeRalphState({ theme_mode: mode });
  };

  const themeValue: ThemeContextValue = {
    theme,
    themeName,
    themeMode,
    themeNames,
    setThemeName,
    setThemeMode,
  };

  return (
    <ThemeContext.Provider value={themeValue}>
      {props.children}
    </ThemeContext.Provider>
  );
}

/**
 * Hook to access the theme context.
 * Must be used within a ThemeProvider.
 *
 * @throws Error if used outside of ThemeProvider
 */
export function useTheme(): ThemeContextValue {
  const context = useContext(ThemeContext);
  if (!context) {
    throw new Error("useTheme must be used within a ThemeProvider");
  }
  return context;
}
