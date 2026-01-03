import { describe, it, expect } from "bun:test";
import { parsePlan } from "../../src/plan";
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
});
