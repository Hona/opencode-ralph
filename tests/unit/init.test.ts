import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { runInit, isGeneratedPrd, isGeneratedPrompt, isGeneratedProgress, GENERATED_PROMPT_MARKER } from "../../src/init";
import { TempDir } from "../helpers/temp-files";

describe("runInit", () => {
  const tempDir = new TempDir();

  beforeEach(async () => {
    await tempDir.create();
  });

  afterEach(async () => {
    await tempDir.cleanup();
  });

  it("should preserve markdown plan files and write PRD JSON to prd.json", async () => {
    const planPath = await tempDir.write(
      "plan.md",
      "# Plan\n- [ ] First task\n- [ ] Second task\n"
    );
    const progressPath = tempDir.path("progress.txt");
    const promptPath = tempDir.path(".ralph-prompt.md");

    const result = await runInit({
      planFile: planPath,
      progressFile: progressPath,
      promptFile: promptPath,
    });

    const originalPlan = await tempDir.read("plan.md");
    expect(originalPlan).toBe("# Plan\n- [ ] First task\n- [ ] Second task\n");

    const prdPath = tempDir.path("prd.json");
    const prdExists = await tempDir.exists("prd.json");
    expect(prdExists).toBe(true);

    const prdContent = await Bun.file(prdPath).json();
    // PRD is now wrapped with metadata
    expect(prdContent.metadata).toBeDefined();
    expect(prdContent.metadata.generated).toBe(true);
    expect(prdContent.metadata.generator).toBe("ralph-init");
    expect(Array.isArray(prdContent.items)).toBe(true);
    expect(prdContent.items.length).toBe(2);
    expect(prdContent.items[0]).toMatchObject({
      description: "First task",
      passes: false,
    });

    expect(result.created).toContain(prdPath);
  });

  it("should use plan.md when no args and prd.json does not exist", async () => {
    await tempDir.write("plan.md", "# Plan\n- [ ] First task\n- [ ] Second task\n");
    const prdPath = tempDir.path("prd.json");
    const progressPath = tempDir.path("progress.txt");
    const promptPath = tempDir.path(".ralph-prompt.md");

    const originalCwd = process.cwd();
    try {
      process.chdir(tempDir.dir);
      const result = await runInit({
        planFile: prdPath,
        progressFile: progressPath,
        promptFile: promptPath,
      });

      const prdContent = await Bun.file(prdPath).json();
      // PRD is now wrapped with metadata
      expect(prdContent.metadata).toBeDefined();
      expect(prdContent.items.length).toBe(2);
      expect(result.warnings.some((warning) => warning.includes("plan.md"))).toBe(true);
    } finally {
      process.chdir(originalCwd);
    }
  });

  it("should add frontmatter marker to generated prompt file", async () => {
    const planPath = await tempDir.write("plan.md", "# Plan\n- [ ] Task\n");
    const progressPath = tempDir.path("progress.txt");
    const promptPath = tempDir.path(".ralph-prompt.md");

    await runInit({
      planFile: planPath,
      progressFile: progressPath,
      promptFile: promptPath,
    });

    const promptContent = await Bun.file(promptPath).text();
    expect(promptContent.startsWith(GENERATED_PROMPT_MARKER)).toBe(true);
    expect(isGeneratedPrompt(promptContent)).toBe(true);
  });

  it("should include sourceFile in PRD metadata when initialized from a source", async () => {
    const planPath = await tempDir.write("plan.md", "# Plan\n- [ ] Task\n");
    const progressPath = tempDir.path("progress.txt");
    const promptPath = tempDir.path(".ralph-prompt.md");
    const prdPath = tempDir.path("prd.json");

    await runInit({
      planFile: planPath,
      progressFile: progressPath,
      promptFile: promptPath,
    });

    const prdContent = await Bun.file(prdPath).json();
    expect(prdContent.metadata.sourceFile).toBe(planPath);
  });
});

describe("isGeneratedPrd", () => {
  it("should return true for generated PRD with metadata", () => {
    const content = JSON.stringify({
      metadata: {
        generated: true,
        generator: "ralph-init",
        createdAt: "2025-01-01T00:00:00.000Z",
      },
      items: [{ description: "Task", passes: false }],
    });
    expect(isGeneratedPrd(content)).toBe(true);
  });

  it("should return false for plain array PRD", () => {
    const content = JSON.stringify([{ description: "Task", passes: false }]);
    expect(isGeneratedPrd(content)).toBe(false);
  });

  it("should return false for PRD with wrong generator", () => {
    const content = JSON.stringify({
      metadata: {
        generated: true,
        generator: "other-tool",
        createdAt: "2025-01-01T00:00:00.000Z",
      },
      items: [{ description: "Task", passes: false }],
    });
    expect(isGeneratedPrd(content)).toBe(false);
  });

  it("should return false for non-JSON content", () => {
    expect(isGeneratedPrd("# Not JSON")).toBe(false);
  });

  it("should return false for invalid JSON", () => {
    expect(isGeneratedPrd("{ invalid json }")).toBe(false);
  });
});

describe("isGeneratedPrompt", () => {
  it("should return true for prompt with generated frontmatter", () => {
    const content = `---
generated: true
generator: ralph-init
safe_to_delete: true
---
READ all of plan.md`;
    expect(isGeneratedPrompt(content)).toBe(true);
  });

  it("should return false for prompt without frontmatter", () => {
    const content = "READ all of plan.md";
    expect(isGeneratedPrompt(content)).toBe(false);
  });

  it("should return false for prompt with different frontmatter", () => {
    const content = `---
title: My Custom Prompt
---
READ all of plan.md`;
    expect(isGeneratedPrompt(content)).toBe(false);
  });
});

describe("isGeneratedProgress", () => {
  it("should return true for progress with init marker", () => {
    const content = `# Ralph Progress

## Iteration 0 - Initialized 2025-01-01T00:00:00.000Z
- Plan: prd.json
- Notes: Initialized via ralph init.
`;
    expect(isGeneratedProgress(content)).toBe(true);
  });

  it("should return false for user-created progress", () => {
    const content = `# My Progress

## Task 1
- Did something
`;
    expect(isGeneratedProgress(content)).toBe(false);
  });
});
