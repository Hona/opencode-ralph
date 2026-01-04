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

  describe("custom prompt", () => {
    it("should use custom prompt instead of default", () => {
      const customPrompt = "Custom instruction: process {plan} file.";
      const options = createOptions({
        prompt: customPrompt,
      });
      const result = buildPrompt(options);
      // Verify the custom prompt is used (with {plan} substituted)
      expect(result).toBe("Custom instruction: process plan.md file.");
      // Verify it's NOT the default prompt
      expect(result).not.toContain("READ all of");
      expect(result).not.toContain("Pick ONE task");
    });

    it("should preserve custom prompt content exactly except for {plan} placeholder", () => {
      const customPrompt = "Do exactly this: {plan} - no more, no less.";
      const options = createOptions({
        planFile: "tasks.md",
        prompt: customPrompt,
      });
      const result = buildPrompt(options);
      expect(result).toBe("Do exactly this: tasks.md - no more, no less.");
    });
  });

  describe("default prompt", () => {
    it("should use DEFAULT_PROMPT when options.prompt is undefined", () => {
      const options = createOptions({
        planFile: "plan.md",
        prompt: undefined,
      });
      const result = buildPrompt(options);
      // Verify it uses the default prompt with {plan} substituted
      expect(result).toContain("READ all of plan.md");
      expect(result).toContain("Pick ONE task");
      expect(result).toContain("update AGENTS.md");
      expect(result).toContain(".ralph-done");
      expect(result).toContain("NEVER GIT PUSH");
      // Verify {plan} was replaced
      expect(result).not.toContain("{plan}");
    });

    it("should substitute {plan} in default prompt with custom planFile", () => {
      const options = createOptions({
        planFile: "docs/custom-plan.md",
        prompt: undefined,
      });
      const result = buildPrompt(options);
      // The default prompt has two {plan} occurrences - both should be replaced
      expect(result).toContain("READ all of docs/custom-plan.md");
      expect(result).toContain("Update docs/custom-plan.md");
      expect(result).not.toContain("{plan}");
    });
  });
});

describe("parseModel", () => {
  describe("valid format", () => {
    it("should parse anthropic/claude-opus-4 correctly", () => {
      const result = parseModel("anthropic/claude-opus-4");
      expect(result).toEqual({
        providerID: "anthropic",
        modelID: "claude-opus-4",
      });
    });

    it("should parse opencode/claude-opus-4-5 correctly", () => {
      const result = parseModel("opencode/claude-opus-4-5");
      expect(result).toEqual({
        providerID: "opencode",
        modelID: "claude-opus-4-5",
      });
    });

    it("should parse openai/gpt-4 correctly", () => {
      const result = parseModel("openai/gpt-4");
      expect(result).toEqual({
        providerID: "openai",
        modelID: "gpt-4",
      });
    });
  });

  describe("invalid format", () => {
    it("should throw error for model without slash", () => {
      expect(() => parseModel("invalid-no-slash")).toThrow(
        'Invalid model format: "invalid-no-slash". Expected "provider/model" (e.g., "anthropic/claude-opus-4")'
      );
    });

    it("should throw error for empty string", () => {
      expect(() => parseModel("")).toThrow(
        'Invalid model format: "". Expected "provider/model" (e.g., "anthropic/claude-opus-4")'
      );
    });
  });

  describe("multiple slashes", () => {
    it("should handle provider/model/version format", () => {
      const result = parseModel("provider/model/version");
      expect(result).toEqual({
        providerID: "provider",
        modelID: "model/version",
      });
    });

    it("should handle deeply nested model paths", () => {
      const result = parseModel("aws/bedrock/claude-3-sonnet");
      expect(result).toEqual({
        providerID: "aws",
        modelID: "bedrock/claude-3-sonnet",
      });
    });
  });
});
