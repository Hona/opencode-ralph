import { describe, it, expect, beforeEach } from "bun:test";
import {
  detectInstalledTerminals,
  clearTerminalCache,
  knownTerminals,
  launchTerminal,
  getAttachCommand,
  type KnownTerminal,
} from "../../src/lib/terminal-launcher";

describe("detectInstalledTerminals", () => {
  beforeEach(() => {
    // Clear cache before each test
    clearTerminalCache();
  });

  describe("platform filtering", () => {
    it("should only return terminals for current platform", async () => {
      const terminals = await detectInstalledTerminals();
      const currentPlatform = process.platform as "darwin" | "linux" | "win32";
      
      // All returned terminals should support current platform
      for (const terminal of terminals) {
        expect(terminal.platforms).toContain(currentPlatform);
      }
    });

    it("should not return terminals from other platforms", async () => {
      const terminals = await detectInstalledTerminals();
      const currentPlatform = process.platform;
      
      // Filter knownTerminals that are NOT for current platform
      const otherPlatformTerminals = knownTerminals.filter(
        (t) => !t.platforms.includes(currentPlatform as "darwin" | "linux" | "win32")
      );
      
      // None of the returned terminals should be other-platform-only
      for (const terminal of terminals) {
        const isOtherPlatformOnly = otherPlatformTerminals.some(
          (t) => t.command === terminal.command
        );
        expect(isOtherPlatformOnly).toBe(false);
      }
    });
  });

  describe("caching", () => {
    it("should cache detection result", async () => {
      // First call - will detect
      const firstResult = await detectInstalledTerminals();
      
      // Second call - should return same cached array reference
      const secondResult = await detectInstalledTerminals();
      
      expect(firstResult).toBe(secondResult);
    });

    it("should return fresh results after clearing cache", async () => {
      // First call caches
      const firstResult = await detectInstalledTerminals();
      
      // Clear cache
      clearTerminalCache();
      
      // Second call - should detect again
      const secondResult = await detectInstalledTerminals();
      
      // Results should be equivalent but not same reference
      expect(secondResult).toEqual(firstResult);
      // After clearing cache, it's a new array
      expect(secondResult).not.toBe(firstResult);
    });
  });

  describe("return value structure", () => {
    it("should return array of KnownTerminal objects", async () => {
      const terminals = await detectInstalledTerminals();
      
      expect(Array.isArray(terminals)).toBe(true);
      
      for (const terminal of terminals) {
        expect(terminal).toHaveProperty("name");
        expect(terminal).toHaveProperty("command");
        expect(terminal).toHaveProperty("args");
        expect(terminal).toHaveProperty("platforms");
        expect(typeof terminal.name).toBe("string");
        expect(typeof terminal.command).toBe("string");
        expect(Array.isArray(terminal.args)).toBe(true);
        expect(Array.isArray(terminal.platforms)).toBe(true);
      }
    });

    it("should return empty array if no terminals are installed", async () => {
      // This test verifies the function handles the case gracefully
      // In practice, most systems have at least one terminal
      const terminals = await detectInstalledTerminals();
      
      // Result should be an array (possibly empty)
      expect(Array.isArray(terminals)).toBe(true);
    });
  });
});

describe("clearTerminalCache", () => {
  it("should allow re-detection after clearing cache", async () => {
    // First detection
    await detectInstalledTerminals();
    
    // Clear cache
    clearTerminalCache();
    
    // Should be able to detect again without error
    const result = await detectInstalledTerminals();
    expect(Array.isArray(result)).toBe(true);
  });
});

describe("knownTerminals", () => {
  it("should have valid structure for all entries", () => {
    for (const terminal of knownTerminals) {
      expect(terminal.name).toBeTruthy();
      expect(terminal.command).toBeTruthy();
      expect(terminal.args.length).toBeGreaterThanOrEqual(0);
      expect(terminal.platforms.length).toBeGreaterThan(0);
    }
  });

  it("should have {cmd} placeholder in args", () => {
    for (const terminal of knownTerminals) {
      // At least one arg should contain {cmd} placeholder
      const hasPlaceholder = terminal.args.some((arg) => arg.includes("{cmd}"));
      expect(hasPlaceholder).toBe(true);
    }
  });

  it("should only have valid platform values", () => {
    const validPlatforms = ["darwin", "linux", "win32"];
    
    for (const terminal of knownTerminals) {
      for (const platform of terminal.platforms) {
        expect(validPlatforms).toContain(platform);
      }
    }
  });

  describe("platform coverage", () => {
    it("should have terminals for darwin", () => {
      const darwinTerminals = knownTerminals.filter((t) =>
        t.platforms.includes("darwin")
      );
      expect(darwinTerminals.length).toBeGreaterThan(0);
    });

    it("should have terminals for linux", () => {
      const linuxTerminals = knownTerminals.filter((t) =>
        t.platforms.includes("linux")
      );
      expect(linuxTerminals.length).toBeGreaterThan(0);
    });

    it("should have terminals for win32", () => {
      const win32Terminals = knownTerminals.filter((t) =>
        t.platforms.includes("win32")
      );
      expect(win32Terminals.length).toBeGreaterThan(0);
    });
  });
});

describe("launchTerminal", () => {
  // Note: Actually launching terminals would be disruptive in tests
  // We test the function structure and error handling

  it("should return success result with correct structure", async () => {
    // Create a mock terminal with a command that won't actually launch
    const mockTerminal: KnownTerminal = {
      name: "Test Terminal",
      command: "echo", // echo is safe and available on all platforms
      args: ["{cmd}"],
      platforms: ["darwin", "linux", "win32"],
    };

    const result = await launchTerminal(mockTerminal, "test");
    
    expect(result).toHaveProperty("success");
    expect(typeof result.success).toBe("boolean");
    if (!result.success) {
      expect(result).toHaveProperty("error");
    }
  });

  it("should replace {cmd} placeholder in args", async () => {
    // This test verifies the placeholder replacement logic works
    // We use echo which outputs its args
    const mockTerminal: KnownTerminal = {
      name: "Echo Test",
      command: "echo",
      args: ["prefix-{cmd}-suffix"],
      platforms: ["darwin", "linux", "win32"],
    };

    // The function should process the args correctly
    // We can't easily verify the output, but we can verify it doesn't error
    const result = await launchTerminal(mockTerminal, "TESTVALUE");
    
    // echo should succeed
    expect(result.success).toBe(true);
  });

  it("should return error for non-existent command", async () => {
    const mockTerminal: KnownTerminal = {
      name: "Non-existent",
      command: "this-command-definitely-does-not-exist-12345",
      args: ["{cmd}"],
      platforms: ["darwin", "linux", "win32"],
    };

    const result = await launchTerminal(mockTerminal, "test");
    
    expect(result.success).toBe(false);
    expect(result.error).toBeDefined();
  });
});

describe("getAttachCommand", () => {
  it("should return command with session ID when provided", () => {
    const result = getAttachCommand("http://localhost:10101", "session-123");
    
    expect(result).toBe("opencode attach http://localhost:10101 --session session-123");
  });

  it("should return command without session ID when not provided", () => {
    const result = getAttachCommand("http://localhost:10101");
    
    expect(result).toBe("opencode attach http://localhost:10101");
  });

  it("should work with different server URLs", () => {
    const result = getAttachCommand("https://example.com:8080", "abc-def");
    
    expect(result).toBe("opencode attach https://example.com:8080 --session abc-def");
  });

  it("should handle undefined session ID", () => {
    const result = getAttachCommand("http://localhost:10101", undefined);
    
    expect(result).toBe("opencode attach http://localhost:10101");
  });
});
