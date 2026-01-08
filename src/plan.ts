/**
 * Plan file parser for opencode-ralph
 */

export type PlanProgress = {
  done: number;
  total: number;
};

/**
 * Represents a single task from a plan file
 */
export type Task = {
  /** Unique identifier derived from line number */
  id: string;
  /** Line number in the file (1-indexed) */
  line: number;
  /** Task text without the checkbox prefix */
  text: string;
  /** Whether the task is completed */
  done: boolean;
};

// Regex to match markdown checkbox items
// Captures: optional leading whitespace, checkbox state, and task text
const CHECKBOX_PATTERN = /^(\s*)-\s*\[([ xX])\]\s*(.+)$/;

/**
 * Parse a plan file and extract all tasks as structured objects.
 * Tasks are identified by markdown checkboxes: `- [x]` (done) and `- [ ]` (not done)
 * @param path - Path to the plan file
 * @returns Array of Task objects with id, line, text, and done status
 */
export async function parsePlanTasks(path: string): Promise<Task[]> {
  const file = Bun.file(path);
  if (!(await file.exists())) {
    return [];
  }

  const content = await file.text();
  const lines = content.split("\n");
  const tasks: Task[] = [];

  // Track if we're inside a fenced code block
  let inCodeBlock = false;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const lineNumber = i + 1; // 1-indexed

    // Check for code block boundaries
    if (line.trim().startsWith("```")) {
      inCodeBlock = !inCodeBlock;
      continue;
    }

    // Skip lines inside code blocks
    if (inCodeBlock) {
      continue;
    }

    const match = line.match(CHECKBOX_PATTERN);
    if (match) {
      const [, , checkboxState, text] = match;
      tasks.push({
        id: `task-${lineNumber}`,
        line: lineNumber,
        text: text.trim(),
        done: checkboxState.toLowerCase() === "x",
      });
    }
  }

  return tasks;
}

/**
 * Parse a plan file and count completed/total tasks.
 * Tasks are identified by markdown checkboxes: `- [x]` (done) and `- [ ]` (not done)
 * @param path - Path to the plan file
 * @returns Object with done and total counts
 */
export async function parsePlan(path: string): Promise<PlanProgress> {
  const file = Bun.file(path);
  if (!(await file.exists())) {
    return { done: 0, total: 0 };
  }

  const content = await file.text();

  // Remove content inside fenced code blocks (```...```) before counting
  // This prevents counting checkboxes that appear in code examples
  const contentWithoutCodeBlocks = content.replace(/```[\s\S]*?```/g, "");

  // Count completed tasks: - [x] (case insensitive)
  const doneMatches = contentWithoutCodeBlocks.match(/- \[x\]/gi);
  const done = doneMatches ? doneMatches.length : 0;

  // Count incomplete tasks: - [ ]
  const notDoneMatches = contentWithoutCodeBlocks.match(/- \[ \]/g);
  const notDone = notDoneMatches ? notDoneMatches.length : 0;

  return {
    done,
    total: done + notDone,
  };
}
