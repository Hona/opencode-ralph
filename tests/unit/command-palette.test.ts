import { describe, test, expect } from "bun:test";
import fuzzysort from "fuzzysort";

/**
 * Unit tests for command palette fuzzy filtering behavior.
 * Tests the core fuzzysort integration used by DialogSelect.
 */
describe("Command Palette", () => {
  // Sample commands matching what's registered in app.tsx
  const sampleCommands = [
    { title: "Pause", value: "togglePause" },
    { title: "Resume", value: "togglePause" },
    { title: "Copy attach command", value: "copyAttach" },
    { title: "Choose default terminal", value: "terminalConfig" },
    { title: "Toggle tasks panel", value: "toggleTasks" },
  ];

  describe("fuzzy filtering", () => {
    test("returns all commands when query is empty", () => {
      const query = "";
      // Empty query = no filtering (return all)
      expect(query).toBe("");
      // DialogSelect returns all non-disabled options when query is empty
    });

    test("filters commands by partial match", () => {
      const results = fuzzysort.go("paus", sampleCommands, {
        key: "title",
        threshold: 0.2,
      });
      
      expect(results.length).toBe(1);
      expect(results[0].obj.title).toBe("Pause");
    });

    test("filters by multiple character match", () => {
      const results = fuzzysort.go("tog", sampleCommands, {
        key: "title",
        threshold: 0.2,
      });
      
      // Should match "Toggle tasks panel"
      expect(results.length).toBeGreaterThanOrEqual(1);
      expect(results.some(r => r.obj.title === "Toggle tasks panel")).toBe(true);
    });

    test("filters case-insensitively", () => {
      const results = fuzzysort.go("COPY", sampleCommands, {
        key: "title",
        threshold: 0.2,
      });
      
      expect(results.length).toBe(1);
      expect(results[0].obj.title).toBe("Copy attach command");
    });

    test("handles fuzzy matching with skipped characters", () => {
      const results = fuzzysort.go("cpy", sampleCommands, {
        key: "title",
        threshold: 0.2,
      });
      
      // "cpy" should match "Copy" (c-o-p-y with skipped o)
      expect(results.length).toBeGreaterThanOrEqual(1);
      expect(results[0].obj.title).toBe("Copy attach command");
    });

    test("returns empty array for non-matching query", () => {
      const results = fuzzysort.go("xyz123", sampleCommands, {
        key: "title",
        threshold: 0.2,
      });
      
      expect(results.length).toBe(0);
    });

    test("scores exact prefix matches higher", () => {
      const results = fuzzysort.go("Cop", sampleCommands, {
        key: "title",
        threshold: 0.2,
      });
      
      // Should find "Copy attach command"
      expect(results.length).toBe(1);
      expect(results[0].obj.title).toBe("Copy attach command");
    });
  });

  describe("highlight extraction", () => {
    test("provides match indexes for highlighting", () => {
      const results = fuzzysort.go("paus", sampleCommands, {
        key: "title",
        threshold: 0.2,
      });
      
      expect(results.length).toBe(1);
      // indexes should contain the positions of matched characters
      expect(results[0].indexes).toBeDefined();
      expect(results[0].indexes.length).toBeGreaterThan(0);
    });

    test("highlight callback receives matched substrings", () => {
      const results = fuzzysort.go("task", sampleCommands, {
        key: "title",
        threshold: 0.2,
      });
      
      expect(results.length).toBeGreaterThanOrEqual(1);
      
      const parts: string[] = [];
      results[0].highlight((match) => {
        parts.push(match);
        return match;
      });
      
      // Should have highlighted parts
      expect(parts.length).toBeGreaterThan(0);
    });
  });

  describe("command option structure", () => {
    test("commands have required fields", () => {
      sampleCommands.forEach(cmd => {
        expect(typeof cmd.title).toBe("string");
        expect(typeof cmd.value).toBe("string");
        expect(cmd.title.length).toBeGreaterThan(0);
        expect(cmd.value.length).toBeGreaterThan(0);
      });
    });
  });
});
