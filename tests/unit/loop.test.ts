import { describe, it, expect, mock } from "bun:test";
import { buildPrompt, parseModel, validateAndNormalizeServerUrl, checkServerHealth, connectToExternalServer, calculateBackoffMs } from "../../src/loop.js";
import type { LoopOptions } from "../../src/state.js";

describe("buildPrompt", () => {
  const createOptions = (overrides: Partial<LoopOptions> = {}): LoopOptions => ({
    planFile: "plan.md",
    model: "anthropic/claude-opus-4",
    prompt: "Default prompt with {plan}",
    ...overrides,
  });

  describe("template substitution", () => {
    it("should replace {plan} with options.planFile", async () => {
      const options = createOptions({
        prompt: "Read {plan} and complete the task.",
      });
      const result = await buildPrompt(options);
      expect(result).toBe("Read plan.md and complete the task.");
    });

    it("should replace multiple {plan} occurrences", async () => {
      const options = createOptions({
        prompt: "First read {plan}, then update {plan} when done.",
      });
      const result = await buildPrompt(options);
      expect(result).toBe("First read plan.md, then update plan.md when done.");
    });

    it("should handle custom plan file path", async () => {
      const options = createOptions({
        planFile: "docs/my-plan.md",
        prompt: "Read {plan} now.",
      });
      const result = await buildPrompt(options);
      expect(result).toBe("Read docs/my-plan.md now.");
    });

    it("should replace {{PLAN_FILE}} placeholder", async () => {
      const options = createOptions({
        prompt: "Process {{PLAN_FILE}} and complete tasks.",
      });
      const result = await buildPrompt(options);
      expect(result).toBe("Process plan.md and complete tasks.");
    });

    it("should replace both {plan} and {{PLAN_FILE}} placeholders", async () => {
      const options = createOptions({
        prompt: "Read {plan} first, then update {{PLAN_FILE}}.",
      });
      const result = await buildPrompt(options);
      expect(result).toBe("Read plan.md first, then update plan.md.");
    });
  });

  describe("custom prompt", () => {
    it("should use custom prompt instead of default", async () => {
      const customPrompt = "Custom instruction: process {plan} file.";
      const options = createOptions({
        prompt: customPrompt,
      });
      const result = await buildPrompt(options);
      // Verify the custom prompt is used (with {plan} substituted)
      expect(result).toBe("Custom instruction: process plan.md file.");
      // Verify it's NOT the default prompt
      expect(result).not.toContain("READ all of");
      expect(result).not.toContain("Pick ONE task");
    });

    it("should preserve custom prompt content exactly except for {plan} placeholder", async () => {
      const customPrompt = "Do exactly this: {plan} - no more, no less.";
      const options = createOptions({
        planFile: "tasks.md",
        prompt: customPrompt,
      });
      const result = await buildPrompt(options);
      expect(result).toBe("Do exactly this: tasks.md - no more, no less.");
    });
  });

  describe("default prompt", () => {
    it("should use DEFAULT_PROMPT when options.prompt is undefined", async () => {
      const options = createOptions({
        planFile: "plan.md",
        prompt: undefined,
      });
      const result = await buildPrompt(options);
      // Verify it uses the default prompt with {plan} substituted
      expect(result).toContain("READ all of plan.md");
      expect(result).toContain("Pick ONE task");
      expect(result).toContain("update AGENTS.md");
      expect(result).toContain(".ralph-done");
      expect(result).toContain("NEVER GIT PUSH");
      // Verify {plan} was replaced
      expect(result).not.toContain("{plan}");
    });

    it("should substitute {plan} in default prompt with custom planFile", async () => {
      const options = createOptions({
        planFile: "docs/custom-plan.md",
        prompt: undefined,
      });
      const result = await buildPrompt(options);
      // The default prompt has two {plan} occurrences - both should be replaced
      expect(result).toContain("READ all of docs/custom-plan.md");
      expect(result).toContain("Update docs/custom-plan.md");
      expect(result).not.toContain("{plan}");
    });

    it("should use DEFAULT_PROMPT when options.prompt is empty string", async () => {
      const options = createOptions({
        planFile: "plan.md",
        prompt: "",
      });
      const result = await buildPrompt(options);
      // Verify it uses the default prompt
      expect(result).toContain("READ all of plan.md");
    });

    it("should use DEFAULT_PROMPT when options.prompt is whitespace only", async () => {
      const options = createOptions({
        planFile: "plan.md",
        prompt: "   ",
      });
      const result = await buildPrompt(options);
      // Verify it uses the default prompt
      expect(result).toContain("READ all of plan.md");
    });
  });

  describe("precedence", () => {
    it("should prefer --prompt over --prompt-file", async () => {
      const options = createOptions({
        prompt: "Explicit prompt {plan}",
        promptFile: ".ralph-prompt.md", // File doesn't exist, but --prompt takes precedence anyway
      });
      const result = await buildPrompt(options);
      expect(result).toBe("Explicit prompt plan.md");
    });

    it("should read content from --prompt-file when --prompt is not provided", async () => {
      // Create a temp file with custom prompt content
      const tempFile = `/tmp/test-prompt-${Date.now()}.md`;
      const promptContent = "Custom file prompt: process {plan} and {{PLAN_FILE}} files.";
      await Bun.write(tempFile, promptContent);

      try {
        const options = createOptions({
          prompt: undefined,
          promptFile: tempFile,
        });
        const result = await buildPrompt(options);
        expect(result).toBe("Custom file prompt: process plan.md and plan.md files.");
      } finally {
        // Clean up temp file
        await Bun.file(tempFile).delete?.();
      }
    });

    it("should fall back to DEFAULT_PROMPT when prompt-file doesn't exist", async () => {
      const options = createOptions({
        prompt: undefined,
        promptFile: "nonexistent-file.md",
      });
      const result = await buildPrompt(options);
      // Should fall back to DEFAULT_PROMPT
      expect(result).toContain("READ all of plan.md");
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

describe("validateAndNormalizeServerUrl", () => {
  describe("valid URLs", () => {
    it("should accept http://localhost:4190", () => {
      expect(validateAndNormalizeServerUrl("http://localhost:4190")).toBe("http://localhost:4190");
    });

    it("should accept https://example.com", () => {
      expect(validateAndNormalizeServerUrl("https://example.com")).toBe("https://example.com");
    });

    it("should accept http://192.168.1.100:4190", () => {
      expect(validateAndNormalizeServerUrl("http://192.168.1.100:4190")).toBe("http://192.168.1.100:4190");
    });

    it("should normalize URL with trailing slash", () => {
      expect(validateAndNormalizeServerUrl("http://localhost:4190/")).toBe("http://localhost:4190");
    });
  });

  describe("invalid URLs", () => {
    it("should reject non-URL strings", () => {
      expect(() => validateAndNormalizeServerUrl("not-a-url")).toThrow("Invalid URL format");
    });

    it("should reject URLs with paths", () => {
      expect(() => validateAndNormalizeServerUrl("http://localhost:4190/api")).toThrow("origin only");
    });

    it("should reject URLs with query strings", () => {
      expect(() => validateAndNormalizeServerUrl("http://localhost:4190?foo=bar")).toThrow("origin only");
    });

    it("should reject URLs with hash fragments", () => {
      expect(() => validateAndNormalizeServerUrl("http://localhost:4190#section")).toThrow("origin only");
    });

    it("should reject non-http protocols", () => {
      expect(() => validateAndNormalizeServerUrl("ftp://localhost:4190")).toThrow("Invalid protocol");
    });

    it("should reject ws:// protocol", () => {
      expect(() => validateAndNormalizeServerUrl("ws://localhost:4190")).toThrow("Invalid protocol");
    });
  });
});

describe("checkServerHealth", () => {
  it("should return ok:true when server responds with healthy:true", async () => {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = mock(() => 
      Promise.resolve(new Response(JSON.stringify({ healthy: true }), { status: 200 }))
    ) as unknown as typeof fetch;
    
    const result = await checkServerHealth("http://localhost:4190", 1000);
    expect(result).toEqual({ ok: true });
    
    globalThis.fetch = originalFetch;
  });

  it("should return ok:false reason:unhealthy when healthy:false", async () => {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = mock(() => 
      Promise.resolve(new Response(JSON.stringify({ healthy: false }), { status: 200 }))
    ) as unknown as typeof fetch;
    
    const result = await checkServerHealth("http://localhost:4190", 1000);
    expect(result).toEqual({ ok: false, reason: "unhealthy" });
    
    globalThis.fetch = originalFetch;
  });

  it("should return ok:false reason:unhealthy on non-200 response", async () => {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = mock(() => 
      Promise.resolve(new Response("error", { status: 500 }))
    ) as unknown as typeof fetch;
    
    const result = await checkServerHealth("http://localhost:4190", 1000);
    expect(result).toEqual({ ok: false, reason: "unhealthy" });
    
    globalThis.fetch = originalFetch;
  });

  it("should return ok:false reason:unreachable on network error", async () => {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = mock(() => Promise.reject(new Error("Network error"))) as unknown as typeof fetch;
    
    const result = await checkServerHealth("http://localhost:4190", 1000);
    expect(result).toEqual({ ok: false, reason: "unreachable" });
    
    globalThis.fetch = originalFetch;
  });
});

describe("connectToExternalServer", () => {
  it("should return connection info for healthy server", async () => {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = mock(() => 
      Promise.resolve(new Response(JSON.stringify({ healthy: true }), { status: 200 }))
    ) as unknown as typeof fetch;
    
    const result = await connectToExternalServer("http://localhost:4190");
    expect(result.url).toBe("http://localhost:4190");
    expect(result.attached).toBe(true);
    expect(typeof result.close).toBe("function");
    
    globalThis.fetch = originalFetch;
  });

  it("should throw on invalid URL", async () => {
    await expect(connectToExternalServer("not-a-url")).rejects.toThrow("Invalid URL format");
  });

  it("should throw on unreachable server", async () => {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = mock(() => Promise.reject(new Error("Network error"))) as unknown as typeof fetch;
    
    await expect(connectToExternalServer("http://localhost:4190")).rejects.toThrow("Cannot connect");
    
    globalThis.fetch = originalFetch;
  });

  it("should throw on unhealthy server", async () => {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = mock(() => 
      Promise.resolve(new Response(JSON.stringify({ healthy: false }), { status: 200 }))
    ) as unknown as typeof fetch;
    
    await expect(connectToExternalServer("http://localhost:4190")).rejects.toThrow("Server unhealthy");
    
    globalThis.fetch = originalFetch;
  });
});

describe("calculateBackoffMs", () => {
  describe("base delay", () => {
    it("should return ~5000ms for first attempt", () => {
      const result = calculateBackoffMs(1);
      // Base is 5000ms, with up to 10% jitter = 5000-5500
      expect(result).toBeGreaterThanOrEqual(5000);
      expect(result).toBeLessThanOrEqual(5500);
    });
  });

  describe("exponential growth", () => {
    it("should return ~10000ms for second attempt (2x base)", () => {
      const result = calculateBackoffMs(2);
      // 5000 * 2^1 = 10000, with 10% jitter = 10000-11000
      expect(result).toBeGreaterThanOrEqual(10000);
      expect(result).toBeLessThanOrEqual(11000);
    });

    it("should return ~20000ms for third attempt (4x base)", () => {
      const result = calculateBackoffMs(3);
      // 5000 * 2^2 = 20000, with 10% jitter = 20000-22000
      expect(result).toBeGreaterThanOrEqual(20000);
      expect(result).toBeLessThanOrEqual(22000);
    });

    it("should return ~40000ms for fourth attempt (8x base)", () => {
      const result = calculateBackoffMs(4);
      // 5000 * 2^3 = 40000, with 10% jitter = 40000-44000
      expect(result).toBeGreaterThanOrEqual(40000);
      expect(result).toBeLessThanOrEqual(44000);
    });
  });

  describe("maximum cap", () => {
    it("should cap at 300000ms (5 minutes) for very high attempts", () => {
      const result = calculateBackoffMs(10);
      // 5000 * 2^9 = 2,560,000 but capped at 300000, with 10% jitter = 300000-330000
      expect(result).toBeGreaterThanOrEqual(300000);
      expect(result).toBeLessThanOrEqual(330000);
    });

    it("should cap at 300000ms even for extremely high attempts", () => {
      const result = calculateBackoffMs(100);
      expect(result).toBeGreaterThanOrEqual(300000);
      expect(result).toBeLessThanOrEqual(330000);
    });
  });

  describe("edge cases", () => {
    it("should return 0 for zero attempt", () => {
      expect(calculateBackoffMs(0)).toBe(0);
    });

    it("should return 0 for negative attempt", () => {
      expect(calculateBackoffMs(-1)).toBe(0);
    });
  });

  describe("jitter", () => {
    it("should add randomized jitter (results should vary)", () => {
      // Run multiple times and verify we get different results
      const results = new Set<number>();
      for (let i = 0; i < 10; i++) {
        results.add(calculateBackoffMs(1));
      }
      // With 10% jitter, we should get some variation
      // (statistically unlikely to get same value 10 times)
      expect(results.size).toBeGreaterThan(1);
    });
  });
});
