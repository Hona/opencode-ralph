import { describe, it, expect } from "bun:test";
import { parsePlan, parsePlanTasks, type Task } from "../../src/plan";
import path from "path";

const fixturesDir = path.join(import.meta.dir, "../fixtures/plans");

describe("parsePlan", () => {
  it("should return { done: 0, total: 0 } for non-existent file", async () => {
    const result = await parsePlan("/nonexistent/path/to/plan.md");
    expect(result).toEqual({ done: 0, total: 0 });
  });

  it("should not throw for non-existent file", async () => {
    // Verify the function completes without throwing
    await expect(parsePlan("/nonexistent/path/to/plan.md")).resolves.toBeDefined();
  });

  it("should return { done: 0, total: 0 } for empty file", async () => {
    const result = await parsePlan(path.join(fixturesDir, "empty.md"));
    expect(result).toEqual({ done: 0, total: 0 });
  });

  it("should return { done: 5, total: 5 } for all completed tasks", async () => {
    const result = await parsePlan(path.join(fixturesDir, "all-complete.md"));
    expect(result).toEqual({ done: 5, total: 5 });
  });

  it("should return { done: 0, total: 3 } for all incomplete tasks", async () => {
    const result = await parsePlan(path.join(fixturesDir, "all-incomplete.md"));
    expect(result).toEqual({ done: 0, total: 3 });
  });

  it("should return { done: 3, total: 10 } for mixed task states", async () => {
    const result = await parsePlan(path.join(fixturesDir, "partial-complete.md"));
    expect(result).toEqual({ done: 3, total: 10 });
  });

  it("should count uppercase [X] as completed (case insensitive)", async () => {
    const result = await parsePlan(path.join(fixturesDir, "uppercase-complete.md"));
    expect(result).toEqual({ done: 3, total: 4 });
  });

  it("should ignore checkboxes inside fenced code blocks", async () => {
    // code-blocks.md has 2 completed and 3 incomplete real tasks
    // Plus several checkboxes inside ``` code blocks that should NOT be counted
    const result = await parsePlan(path.join(fixturesDir, "code-blocks.md"));
    expect(result).toEqual({ done: 2, total: 5 });
  });

  it("should count all checkboxes at any nesting level", async () => {
    // complex-nested.md has checkboxes at various nesting levels:
    // - Root level tasks
    // - Single-nested tasks (indented once)
    // - Deeply nested tasks (indented twice)
    // Plus a checkbox-like pattern in text (line 38) which the regex matches
    // Completed (x/X): 6 total
    // Incomplete [ ]: 7 total
    // (Excludes checkboxes inside code blocks which are correctly ignored)
    const result = await parsePlan(path.join(fixturesDir, "complex-nested.md"));
    expect(result).toEqual({ done: 6, total: 13 });
  });
});

describe("parsePlanTasks", () => {
  it("should return empty array for non-existent file", async () => {
    const result = await parsePlanTasks("/nonexistent/path/to/plan.md");
    expect(result).toEqual([]);
  });

  it("should return empty array for empty file", async () => {
    const result = await parsePlanTasks(path.join(fixturesDir, "empty.md"));
    expect(result).toEqual([]);
  });

  it("should parse tasks with correct structure", async () => {
    const result = await parsePlanTasks(path.join(fixturesDir, "partial-complete.md"));
    
    // Check we got the right number of tasks
    expect(result.length).toBe(10);
    
    // Check first task structure
    expect(result[0]).toEqual({
      id: "task-7",
      line: 7,
      text: "Initialize project",
      done: true,
    });
    
    // Check an incomplete task
    expect(result[2]).toEqual({
      id: "task-9",
      line: 9,
      text: "Configure build system",
      done: false,
    });
  });

  it("should track line numbers correctly", async () => {
    const result = await parsePlanTasks(path.join(fixturesDir, "partial-complete.md"));
    
    // Verify line numbers are 1-indexed and match actual file positions
    const lineNumbers = result.map(t => t.line);
    expect(lineNumbers).toEqual([7, 8, 9, 13, 14, 15, 19, 20, 21, 22]);
  });

  it("should handle uppercase [X] as completed", async () => {
    const result = await parsePlanTasks(path.join(fixturesDir, "uppercase-complete.md"));
    
    // Count completed tasks
    const completedCount = result.filter(t => t.done).length;
    expect(completedCount).toBe(3);
  });

  it("should ignore checkboxes inside fenced code blocks", async () => {
    const result = await parsePlanTasks(path.join(fixturesDir, "code-blocks.md"));
    
    // code-blocks.md has 5 real tasks, rest are in code blocks
    expect(result.length).toBe(5);
    
    // Verify all tasks are from real section (lines 7-11)
    const allFromRealSection = result.every(t => t.line >= 7 && t.line <= 11);
    expect(allFromRealSection).toBe(true);
  });

  it("should generate unique IDs from line numbers", async () => {
    const result = await parsePlanTasks(path.join(fixturesDir, "partial-complete.md"));
    
    // All IDs should be unique
    const ids = result.map(t => t.id);
    const uniqueIds = new Set(ids);
    expect(uniqueIds.size).toBe(ids.length);
    
    // IDs should follow the task-{lineNumber} pattern
    result.forEach(task => {
      expect(task.id).toBe(`task-${task.line}`);
    });
  });

  it("should trim task text", async () => {
    const result = await parsePlanTasks(path.join(fixturesDir, "partial-complete.md"));
    
    // No task text should have leading/trailing whitespace
    result.forEach(task => {
      expect(task.text).toBe(task.text.trim());
    });
  });
});
