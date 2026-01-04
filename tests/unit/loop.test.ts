import { describe, it, expect } from "bun:test";
import { buildPrompt, parseModel } from "../../src/loop.js";
import type { LoopOptions } from "../../src/state.js";

describe("buildPrompt", () => {
  const createOptions = (overrides: Partial<LoopOptions> = {}): LoopOptions => ({
    planFile: "plan.md",
    model: "anthropic/claude-opus-4",
    prompt: "Default prompt with {plan}",
    ...overrides,
  });

  describe("template substitution", () => {
    it("should replace {plan} with options.planFile", () => {
      const options = createOptions({
        prompt: "Read {plan} and complete the task.",
      });
      const result = buildPrompt(options);
      expect(result).toBe("Read plan.md and complete the task.");
    });

    it("should replace multiple {plan} occurrences", () => {
      const options = createOptions({
        prompt: "First read {plan}, then update {plan} when done.",
      });
      const result = buildPrompt(options);
      expect(result).toBe("First read plan.md, then update plan.md when done.");
    });

    it("should handle custom plan file path", () => {
      const options = createOptions({
        planFile: "docs/my-plan.md",
        prompt: "Read {plan} now.",
      });
      const result = buildPrompt(options);
      expect(result).toBe("Read docs/my-plan.md now.");
    });
  });
});

describe("parseModel", () => {
  it.todo("should be implemented", () => {});
});
