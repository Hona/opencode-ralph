import { describe, it, expect } from "bun:test";
import {
  resolveTheme,
  getThemeColor,
  isValidTheme,
  themeNames,
  type Theme,
  type ThemeMode,
} from "../../src/lib/theme-resolver";

describe("resolveTheme", () => {
  it("should resolve the default theme (opencode) when no name provided", () => {
    const theme = resolveTheme();
    
    // Verify it returns a Theme object with expected properties
    expect(theme.primary).toBeDefined();
    expect(theme.background).toBeDefined();
    expect(theme.text).toBeDefined();
  });

  it("should resolve a named theme", () => {
    const theme = resolveTheme("dracula");
    
    expect(theme.primary).toBeDefined();
    expect(typeof theme.primary).toBe("string");
    expect(theme.primary.startsWith("#")).toBe(true);
  });

  it("should fall back to default theme for invalid theme name", () => {
    const theme = resolveTheme("nonexistent-theme");
    const defaultTheme = resolveTheme("opencode");
    
    // Should resolve to the same as the default theme
    expect(theme.primary).toBe(defaultTheme.primary);
  });

  it("should resolve dark mode colors by default", () => {
    const theme = resolveTheme("opencode", "dark");
    
    // The opencode theme's dark primary is darkStep9 = #fab283
    expect(theme.primary).toBe("#fab283");
  });

  it("should resolve light mode colors when specified", () => {
    const theme = resolveTheme("opencode", "light");
    
    // The opencode theme's light primary is lightStep9 = #3b7dd8
    expect(theme.primary).toBe("#3b7dd8");
  });

  it("should resolve def references to hex colors", () => {
    const theme = resolveTheme("opencode", "dark");
    
    // All resolved values should be hex colors
    expect(theme.text).toMatch(/^#[0-9a-fA-F]{6}$/);
    expect(theme.background).toMatch(/^#[0-9a-fA-F]{6}$/);
    expect(theme.border).toMatch(/^#[0-9a-fA-F]{6}$/);
  });

  it("should preserve direct hex values in theme", () => {
    const theme = resolveTheme("opencode", "dark");
    
    // diffAdded in opencode has a direct hex value: "#4fd6be"
    expect(theme.diffAdded).toBe("#4fd6be");
  });

  it("should resolve all theme color keys", () => {
    const theme = resolveTheme("opencode");
    
    // Check all expected keys are present and are hex colors
    const expectedKeys: (keyof Theme)[] = [
      "primary",
      "secondary",
      "accent",
      "error",
      "warning",
      "success",
      "info",
      "text",
      "textMuted",
      "background",
      "backgroundPanel",
      "backgroundElement",
      "border",
      "borderActive",
      "borderSubtle",
      "diffAdded",
      "diffRemoved",
      "diffContext",
      "diffHunkHeader",
      "diffHighlightAdded",
      "diffHighlightRemoved",
      "diffAddedBg",
      "diffRemovedBg",
      "diffContextBg",
      "diffLineNumber",
      "diffAddedLineNumberBg",
      "diffRemovedLineNumberBg",
      "markdownText",
      "markdownHeading",
      "markdownLink",
      "markdownLinkText",
      "markdownCode",
      "markdownBlockQuote",
      "markdownEmph",
      "markdownStrong",
      "markdownHorizontalRule",
      "markdownListItem",
      "markdownListEnumeration",
      "markdownImage",
      "markdownImageText",
      "markdownCodeBlock",
      "syntaxComment",
      "syntaxKeyword",
      "syntaxFunction",
      "syntaxVariable",
      "syntaxString",
      "syntaxNumber",
      "syntaxType",
      "syntaxOperator",
      "syntaxPunctuation",
    ];

    for (const key of expectedKeys) {
      expect(theme[key]).toBeDefined();
      expect(typeof theme[key]).toBe("string");
      expect(theme[key].startsWith("#")).toBe(true);
    }
  });

  it("should resolve different themes with different colors", () => {
    const opencode = resolveTheme("opencode", "dark");
    const dracula = resolveTheme("dracula", "dark");
    
    // Different themes should have different primary colors
    // (unless by coincidence they're the same, which is unlikely)
    expect(opencode.primary !== dracula.primary || opencode.background !== dracula.background).toBe(true);
  });
});

describe("getThemeColor", () => {
  it("should get a single color from a theme", () => {
    const primary = getThemeColor("opencode", "primary", "dark");
    
    expect(primary).toBe("#fab283");
  });

  it("should respect mode parameter", () => {
    const darkPrimary = getThemeColor("opencode", "primary", "dark");
    const lightPrimary = getThemeColor("opencode", "primary", "light");
    
    expect(darkPrimary).not.toBe(lightPrimary);
  });

  it("should default to dark mode", () => {
    const color = getThemeColor("opencode", "primary");
    const darkColor = getThemeColor("opencode", "primary", "dark");
    
    expect(color).toBe(darkColor);
  });
});

describe("isValidTheme", () => {
  it("should return true for valid theme names", () => {
    expect(isValidTheme("opencode")).toBe(true);
    expect(isValidTheme("dracula")).toBe(true);
    expect(isValidTheme("nord")).toBe(true);
  });

  it("should return false for invalid theme names", () => {
    expect(isValidTheme("nonexistent")).toBe(false);
    expect(isValidTheme("")).toBe(false);
    expect(isValidTheme("OPENCODE")).toBe(false); // case sensitive
  });
});

describe("themeNames", () => {
  it("should be an array of strings", () => {
    expect(Array.isArray(themeNames)).toBe(true);
    expect(themeNames.length).toBeGreaterThan(0);
    themeNames.forEach(name => {
      expect(typeof name).toBe("string");
    });
  });

  it("should include known themes", () => {
    expect(themeNames).toContain("opencode");
    expect(themeNames).toContain("dracula");
    expect(themeNames).toContain("catppuccin-mocha");
    expect(themeNames).toContain("gruvbox");
  });

  it("should have all valid themes", () => {
    themeNames.forEach(name => {
      expect(isValidTheme(name)).toBe(true);
    });
  });
});
