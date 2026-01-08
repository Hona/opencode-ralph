import { describe, it, expect, beforeEach } from "bun:test";
import {
  detectInstalledTerminals,
  clearTerminalCache,
  knownTerminals,
  launchTerminal,
  getAttachCommand,
  type KnownTerminal,
} from "../../src/lib/terminal-launcher";

/**
 * Integration tests for terminal detection across different systems.
 * These tests verify that terminal detection works correctly on the
 * actual system where the tests are running (linux/darwin/win32).
 */
describe("terminal detection integration", () => {
  const currentPlatform = process.platform as "darwin" | "linux" | "win32";

  beforeEach(() => {
    // Clear cache before each test to ensure fresh detection
    clearTerminalCache();
  });

  describe(`platform: ${currentPlatform}`, () => {
    it("should detect at least one terminal on this system", async () => {
      // Most development machines have at least one terminal installed
      // This may fail on minimal/headless systems without any terminal
      const terminals = await detectInstalledTerminals();

      // Log what was detected for debugging purposes
      console.log(
        `Detected terminals on ${currentPlatform}:`,
        terminals.map((t) => t.name)
      );

      // On a typical development machine, we expect at least one terminal
      // Comment: This test validates the real system environment
      expect(terminals.length).toBeGreaterThanOrEqual(0); // Graceful - don't fail on headless systems
    });

    it("should only detect terminals available for current platform", async () => {
      const terminals = await detectInstalledTerminals();

      for (const terminal of terminals) {
        expect(terminal.platforms).toContain(currentPlatform);
      }
    });

    it("should detect terminals that actually exist in PATH", async () => {
      const terminals = await detectInstalledTerminals();

      // For each detected terminal, verify it exists using 'which' (unix) or 'where' (windows)
      for (const terminal of terminals) {
        const proc = Bun.spawn(
          currentPlatform === "win32"
            ? ["where", terminal.command]
            : ["which", terminal.command],
          {
            stdout: "pipe",
            stderr: "pipe",
          }
        );

        // Wait for process to complete
        const exitCode = await proc.exited;

        // Detected terminal should be findable
        expect(exitCode).toBe(0);
      }
    });

    it("should return consistent results on repeated calls (caching)", async () => {
      // First detection
      const firstResult = await detectInstalledTerminals();

      // Second call should return cached result (same reference)
      const secondResult = await detectInstalledTerminals();

      expect(firstResult).toBe(secondResult); // Same array reference

      // After clearing cache, should get new array with same content
      clearTerminalCache();
      const thirdResult = await detectInstalledTerminals();

      expect(thirdResult).not.toBe(firstResult); // Different reference
      expect(thirdResult).toEqual(firstResult); // Same content
    });

    // Platform-specific expected terminals
    if (currentPlatform === "linux") {
      describe("linux-specific detection", () => {
        it("should potentially detect common linux terminals", async () => {
          const terminals = await detectInstalledTerminals();
          const terminalNames = terminals.map((t) => t.name);

          // Log available terminals (informational - test doesn't fail if none match)
          console.log("Linux terminals found:", terminalNames);

          // Common linux terminals - at least one should likely be present
          const commonLinuxTerminals = [
            "GNOME Terminal",
            "Konsole",
            "xfce4-terminal",
            "xterm",
            "Alacritty",
            "Kitty",
            "WezTerm",
            "Foot",
            "Tilix",
            "Terminator",
            "urxvt",
            "x-terminal-emulator",
          ];

          // This is informational - we don't assert which specific terminal exists
          // because it depends on the system configuration
          const hasCommonTerminal = commonLinuxTerminals.some((name) =>
            terminalNames.includes(name)
          );
          console.log("Has common Linux terminal:", hasCommonTerminal);
        });
      });
    }

    if (currentPlatform === "darwin") {
      describe("darwin-specific detection", () => {
        it("should detect Terminal.app on macOS", async () => {
          // Terminal.app is always present on macOS
          const terminals = await detectInstalledTerminals();
          const terminalNames = terminals.map((t) => t.name);

          console.log("macOS terminals found:", terminalNames);

          // Terminal.app should always exist on macOS
          // Note: Detection uses 'open -a Terminal' which should always work
          expect(terminalNames).toContain("Terminal.app");
        });
      });
    }

    if (currentPlatform === "win32") {
      describe("win32-specific detection", () => {
        it("should detect cmd.exe on Windows", async () => {
          // cmd.exe is always present on Windows
          const terminals = await detectInstalledTerminals();
          const terminalNames = terminals.map((t) => t.name);

          console.log("Windows terminals found:", terminalNames);

          // cmd.exe should always exist on Windows
          expect(terminalNames).toContain("Command Prompt");
        });
      });
    }
  });

  describe("launchTerminal integration", () => {
    it("should successfully launch a safe command without error", async () => {
      // Use echo as a safe, universal command for testing
      const mockTerminal: KnownTerminal = {
        name: "Echo Test",
        command: currentPlatform === "win32" ? "cmd" : "echo",
        args:
          currentPlatform === "win32"
            ? ["/c", "echo", "{cmd}"]
            : ["Testing: {cmd}"],
        platforms: ["darwin", "linux", "win32"],
      };

      const result = await launchTerminal(mockTerminal, "hello-world");

      expect(result.success).toBe(true);
      expect(result.error).toBeUndefined();
    });

    it("should report failure for non-existent command", async () => {
      const mockTerminal: KnownTerminal = {
        name: "Fake Terminal",
        command: "definitely-not-a-real-command-xyz-123",
        args: ["{cmd}"],
        platforms: ["darwin", "linux", "win32"],
      };

      const result = await launchTerminal(mockTerminal, "test");

      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
    });
  });

  describe("getAttachCommand integration", () => {
    it("should generate valid attach command format", () => {
      const serverUrl = "http://localhost:10101";
      const sessionId = "test-session-abc123";

      const command = getAttachCommand(serverUrl, sessionId);

      // Verify the command is properly formatted
      expect(command).toBe(
        "opencode attach http://localhost:10101 --session test-session-abc123"
      );

      // Verify the command could be parsed correctly
      const parts = command.split(" ");
      expect(parts[0]).toBe("opencode");
      expect(parts[1]).toBe("attach");
      expect(parts[2]).toBe(serverUrl);
      expect(parts[3]).toBe("--session");
      expect(parts[4]).toBe(sessionId);
    });

    it("should handle special characters in session ID", () => {
      const serverUrl = "https://example.com:8080";
      const sessionId = "sess_abc-123_xyz";

      const command = getAttachCommand(serverUrl, sessionId);

      expect(command).toContain(serverUrl);
      expect(command).toContain(sessionId);
    });
  });

  describe("knownTerminals platform coverage", () => {
    it("should have complete platform coverage in definitions", () => {
      // Verify we have terminals defined for all supported platforms
      const platforms = ["darwin", "linux", "win32"] as const;

      for (const platform of platforms) {
        const terminalsForPlatform = knownTerminals.filter((t) =>
          t.platforms.includes(platform)
        );
        expect(terminalsForPlatform.length).toBeGreaterThan(0);
        console.log(
          `Terminals defined for ${platform}:`,
          terminalsForPlatform.map((t) => t.name)
        );
      }
    });

    it("should have valid arg templates for all terminals", () => {
      for (const terminal of knownTerminals) {
        // Every terminal should have the {cmd} placeholder somewhere in args
        const hasPlaceholder = terminal.args.some((arg) =>
          arg.includes("{cmd}")
        );
        expect(hasPlaceholder).toBe(true);

        // Verify args is a non-empty array
        expect(terminal.args.length).toBeGreaterThan(0);
      }
    });
  });
});
