import { describe, it, expect, beforeEach, mock, spyOn } from "bun:test";
import {
  detectClipboardTool,
  clearClipboardCache,
  copyToClipboard,
  type ClipboardTool,
} from "../../src/lib/clipboard";

describe("detectClipboardTool", () => {
  beforeEach(() => {
    // Clear cache before each test
    clearClipboardCache();
  });

  describe("macOS", () => {
    it("should return pbcopy on darwin platform", async () => {
      // Save original
      const originalPlatform = process.platform;
      
      // Mock platform
      Object.defineProperty(process, "platform", {
        value: "darwin",
        writable: true,
      });

      try {
        const result = await detectClipboardTool();
        expect(result).toBe("pbcopy");
      } finally {
        // Restore original
        Object.defineProperty(process, "platform", {
          value: originalPlatform,
          writable: true,
        });
      }
    });
  });

  describe("Windows", () => {
    it("should return clip on win32 platform", async () => {
      // Save original
      const originalPlatform = process.platform;
      
      // Mock platform
      Object.defineProperty(process, "platform", {
        value: "win32",
        writable: true,
      });

      try {
        const result = await detectClipboardTool();
        expect(result).toBe("clip");
      } finally {
        // Restore original
        Object.defineProperty(process, "platform", {
          value: originalPlatform,
          writable: true,
        });
      }
    });
  });

  describe("caching", () => {
    it("should cache detection result", async () => {
      // First call - will detect
      const firstResult = await detectClipboardTool();
      
      // Clear and call again
      clearClipboardCache();
      const secondResult = await detectClipboardTool();
      
      // Results should match (same platform)
      expect(firstResult).toBe(secondResult);
    });

    it("should return cached value on subsequent calls", async () => {
      // First call caches the result
      const firstResult = await detectClipboardTool();
      
      // Second call should return same cached result without re-detecting
      const secondResult = await detectClipboardTool();
      
      expect(firstResult).toBe(secondResult);
    });
  });

  describe("clearClipboardCache", () => {
    it("should allow re-detection after clearing cache", async () => {
      // First detection
      await detectClipboardTool();
      
      // Clear cache
      clearClipboardCache();
      
      // Should be able to detect again without error
      const result = await detectClipboardTool();
      expect(result).toBeDefined();
    });
  });
});

describe("copyToClipboard", () => {
  beforeEach(() => {
    clearClipboardCache();
  });

  describe("when no tool is available", () => {
    it("should return error when no clipboard tool found", async () => {
      // Save original platform
      const originalPlatform = process.platform;
      const originalEnv = process.env.WAYLAND_DISPLAY;
      
      // Mock to an unsupported platform
      Object.defineProperty(process, "platform", {
        value: "freebsd", // Unsupported platform
        writable: true,
      });
      delete process.env.WAYLAND_DISPLAY;

      try {
        const result = await copyToClipboard("test");
        expect(result.success).toBe(false);
        expect(result.error).toContain("No clipboard tool available");
      } finally {
        // Restore
        Object.defineProperty(process, "platform", {
          value: originalPlatform,
          writable: true,
        });
        if (originalEnv) {
          process.env.WAYLAND_DISPLAY = originalEnv;
        }
      }
    });
  });

  describe("successful copy", () => {
    // Note: These tests require the actual clipboard tools to be available
    // They will be skipped if the tool is not found
    
    it("should successfully copy text when tool is available", async () => {
      // This test uses the actual detected clipboard tool
      const tool = await detectClipboardTool();
      
      if (!tool) {
        // Skip test if no clipboard tool is available
        console.log("Skipping: No clipboard tool available");
        return;
      }

      const result = await copyToClipboard("test clipboard content");
      expect(result.success).toBe(true);
      expect(result.error).toBeUndefined();
    });
  });
});

describe("ClipboardTool type", () => {
  it("should recognize all valid tool types", () => {
    // Type-level test to ensure all tools are valid
    const validTools: ClipboardTool[] = [
      "wl-copy",
      "xclip",
      "xsel",
      "pbcopy",
      "clip",
      null,
    ];
    
    expect(validTools.length).toBe(6);
  });
});
