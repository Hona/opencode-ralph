/**
 * Clipboard module for cross-platform clipboard operations.
 * Supports Linux (Wayland and X11), macOS, and Windows.
 */

import { $ } from "bun";

/**
 * Available clipboard tools.
 */
export type ClipboardTool =
  | "wl-copy" // Linux Wayland
  | "xclip" // Linux X11
  | "xsel" // Linux X11 fallback
  | "pbcopy" // macOS
  | "clip" // Windows
  | null; // No tool available

/**
 * Result of a clipboard operation.
 */
export interface ClipboardResult {
  success: boolean;
  error?: string;
}

/**
 * Cache for detected clipboard tool.
 */
let detectedToolCache: ClipboardTool | undefined;

/**
 * Check if a command is available in PATH.
 */
async function commandExists(command: string): Promise<boolean> {
  try {
    if (process.platform === "win32") {
      const result = await $`where ${command}`.quiet();
      return result.exitCode === 0;
    } else {
      const result = await $`which ${command}`.quiet();
      return result.exitCode === 0;
    }
  } catch {
    return false;
  }
}

/**
 * Detect the available clipboard tool for the current platform.
 * Results are cached after the first call.
 */
export async function detectClipboardTool(): Promise<ClipboardTool> {
  if (detectedToolCache !== undefined) {
    return detectedToolCache;
  }

  const platform = process.platform;

  if (platform === "darwin") {
    // macOS always has pbcopy
    detectedToolCache = "pbcopy";
    return detectedToolCache;
  }

  if (platform === "win32") {
    // Windows always has clip
    detectedToolCache = "clip";
    return detectedToolCache;
  }

  // Linux - check for Wayland first, then X11 tools
  if (platform === "linux") {
    // Check WAYLAND_DISPLAY for Wayland session
    if (process.env.WAYLAND_DISPLAY) {
      if (await commandExists("wl-copy")) {
        detectedToolCache = "wl-copy";
        return detectedToolCache;
      }
    }

    // Fall back to X11 tools
    if (await commandExists("xclip")) {
      detectedToolCache = "xclip";
      return detectedToolCache;
    }

    if (await commandExists("xsel")) {
      detectedToolCache = "xsel";
      return detectedToolCache;
    }
  }

  // No tool available
  detectedToolCache = null;
  return detectedToolCache;
}

/**
 * Clear the detected clipboard tool cache.
 * Useful for testing or after system changes.
 */
export function clearClipboardCache(): void {
  detectedToolCache = undefined;
}

/**
 * Copy text to the system clipboard.
 *
 * @param text - The text to copy to clipboard
 * @returns Result indicating success or failure
 */
export async function copyToClipboard(text: string): Promise<ClipboardResult> {
  const tool = await detectClipboardTool();

  if (!tool) {
    return {
      success: false,
      error: "No clipboard tool available. Install xclip, xsel, or wl-copy.",
    };
  }

  try {
    let proc: ReturnType<typeof Bun.spawn>;

    switch (tool) {
      case "wl-copy":
        proc = Bun.spawn(["wl-copy"], {
          stdin: "pipe",
          stdout: "ignore",
          stderr: "pipe",
        });
        break;

      case "xclip":
        proc = Bun.spawn(["xclip", "-selection", "clipboard"], {
          stdin: "pipe",
          stdout: "ignore",
          stderr: "pipe",
        });
        break;

      case "xsel":
        proc = Bun.spawn(["xsel", "--clipboard", "--input"], {
          stdin: "pipe",
          stdout: "ignore",
          stderr: "pipe",
        });
        break;

      case "pbcopy":
        proc = Bun.spawn(["pbcopy"], {
          stdin: "pipe",
          stdout: "ignore",
          stderr: "pipe",
        });
        break;

      case "clip":
        proc = Bun.spawn(["clip"], {
          stdin: "pipe",
          stdout: "ignore",
          stderr: "pipe",
        });
        break;
    }

    // Write text to stdin
    if (proc.stdin && typeof proc.stdin !== "number") {
      proc.stdin.write(text);
      proc.stdin.end();
    }

    // Wait for process to complete
    const exitCode = await proc.exited;

    if (exitCode !== 0) {
      if (proc.stderr && typeof proc.stderr !== "number") {
        const stderr = await new Response(proc.stderr).text();
        return {
          success: false,
          error: stderr || `Clipboard tool exited with code ${exitCode}`,
        };
      }
      return {
        success: false,
        error: `Clipboard tool exited with code ${exitCode}`,
      };
    }

    return { success: true };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}
