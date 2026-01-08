/**
 * Terminal launcher module for launching external terminals with attach commands.
 * Supports auto-detection of installed terminals across Linux, macOS, and Windows.
 */

import { $ } from "bun";

/**
 * Known terminal definition with launch command template.
 */
export interface KnownTerminal {
  /** Display name of the terminal */
  name: string;
  /** Command to execute (binary name) */
  command: string;
  /** Arguments array with {cmd} placeholder for the attach command */
  args: string[];
  /** Platforms this terminal is available on */
  platforms: ("darwin" | "linux" | "win32")[];
}

/**
 * All known terminals with their launch configurations.
 * The {cmd} placeholder will be replaced with the actual attach command.
 */
export const knownTerminals: KnownTerminal[] = [
  // Cross-platform terminals
  {
    name: "Alacritty",
    command: "alacritty",
    args: ["-e", "sh", "-c", "{cmd}"],
    platforms: ["darwin", "linux", "win32"],
  },
  {
    name: "Kitty",
    command: "kitty",
    args: ["sh", "-c", "{cmd}"],
    platforms: ["darwin", "linux"],
  },
  {
    name: "WezTerm",
    command: "wezterm",
    args: ["start", "--", "sh", "-c", "{cmd}"],
    platforms: ["darwin", "linux", "win32"],
  },

  // Linux terminals
  {
    name: "GNOME Terminal",
    command: "gnome-terminal",
    args: ["--", "sh", "-c", "{cmd}"],
    platforms: ["linux"],
  },
  {
    name: "Konsole",
    command: "konsole",
    args: ["-e", "sh", "-c", "{cmd}"],
    platforms: ["linux"],
  },
  {
    name: "xfce4-terminal",
    command: "xfce4-terminal",
    args: ["-e", "sh -c '{cmd}'"],
    platforms: ["linux"],
  },
  {
    name: "Foot",
    command: "foot",
    args: ["sh", "-c", "{cmd}"],
    platforms: ["linux"],
  },
  {
    name: "Tilix",
    command: "tilix",
    args: ["-e", "sh -c '{cmd}'"],
    platforms: ["linux"],
  },
  {
    name: "Terminator",
    command: "terminator",
    args: ["-e", "sh -c '{cmd}'"],
    platforms: ["linux"],
  },
  {
    name: "xterm",
    command: "xterm",
    args: ["-e", "sh", "-c", "{cmd}"],
    platforms: ["linux"],
  },
  {
    name: "urxvt",
    command: "urxvt",
    args: ["-e", "sh", "-c", "{cmd}"],
    platforms: ["linux"],
  },
  {
    name: "x-terminal-emulator",
    command: "x-terminal-emulator",
    args: ["-e", "sh", "-c", "{cmd}"],
    platforms: ["linux"],
  },

  // macOS terminals
  {
    name: "Terminal.app",
    command: "open",
    args: ["-a", "Terminal", "{cmd}"],
    platforms: ["darwin"],
  },
  {
    name: "iTerm2",
    command: "open",
    args: ["-a", "iTerm", "{cmd}"],
    platforms: ["darwin"],
  },

  // Windows terminals
  {
    name: "Windows Terminal",
    command: "wt",
    args: ["-d", ".", "cmd", "/c", "{cmd}"],
    platforms: ["win32"],
  },
  {
    name: "Command Prompt",
    command: "cmd",
    args: ["/c", "start", "cmd", "/k", "{cmd}"],
    platforms: ["win32"],
  },
];

/**
 * Cache for detected terminals.
 */
let detectedTerminalsCache: KnownTerminal[] | null = null;

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
 * Detect which terminals are installed on the current system.
 * Results are cached after the first call.
 */
export async function detectInstalledTerminals(): Promise<KnownTerminal[]> {
  if (detectedTerminalsCache !== null) {
    return detectedTerminalsCache;
  }

  const currentPlatform = process.platform as "darwin" | "linux" | "win32";
  const platformTerminals = knownTerminals.filter((t) =>
    t.platforms.includes(currentPlatform)
  );

  const results = await Promise.all(
    platformTerminals.map(async (terminal) => {
      const exists = await commandExists(terminal.command);
      return exists ? terminal : null;
    })
  );

  detectedTerminalsCache = results.filter(
    (t): t is KnownTerminal => t !== null
  );
  return detectedTerminalsCache;
}

/**
 * Clear the detected terminals cache.
 * Useful for testing or after system changes.
 */
export function clearTerminalCache(): void {
  detectedTerminalsCache = null;
}

/**
 * Result of a terminal launch attempt.
 */
export interface LaunchResult {
  success: boolean;
  error?: string;
}

/**
 * Launch a terminal with the given command.
 *
 * @param terminal - The terminal definition to use
 * @param cmd - The command to run in the terminal
 * @returns Result indicating success or failure
 */
export async function launchTerminal(
  terminal: KnownTerminal,
  cmd: string
): Promise<LaunchResult> {
  try {
    // Build args array with {cmd} placeholder replacement
    const args = terminal.args.map((arg) => arg.replace("{cmd}", cmd));

    // Spawn detached process
    const proc = Bun.spawn([terminal.command, ...args], {
      stdin: "ignore",
      stdout: "ignore",
      stderr: "ignore",
    });

    // Unref so parent process can exit
    proc.unref();

    return { success: true };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

/**
 * Generate the attach command string for connecting to an OpenCode session.
 *
 * @param serverUrl - The OpenCode server URL
 * @param sessionId - The session ID to attach to (optional)
 * @returns The formatted attach command
 */
export function getAttachCommand(
  serverUrl: string,
  sessionId?: string
): string {
  if (sessionId) {
    return `opencode attach ${serverUrl} --session ${sessionId}`;
  }
  return `opencode attach ${serverUrl}`;
}
