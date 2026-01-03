import { createOpencodeServer, createOpencodeClient } from "@opencode-ai/sdk";
import type { LoopOptions, PersistedState, ToolEvent } from "./state.js";
import { getHeadHash, getCommitsSince } from "./git.js";
import { parsePlan } from "./plan.js";

const DEFAULT_PROMPT = `READ all of {plan}. Pick ONE task. If needed, verify via web/code search. Complete task. Commit change (update the plan.md in the same commit). ONLY do one task unless GLARINGLY OBVIOUS steps should run together. Update {plan}. If you learn a critical operational detail, update AGENTS.md. When ALL tasks complete, create .ralph-done and exit. NEVER GIT PUSH. ONLY COMMIT.`;

export function buildPrompt(options: LoopOptions): string {
  const template = options.prompt || DEFAULT_PROMPT;
  return template.replace(/\{plan\}/g, options.planFile);
}

export function parseModel(model: string): { providerID: string; modelID: string } {
  const slashIndex = model.indexOf("/");
  if (slashIndex === -1) {
    throw new Error(
      `Invalid model format: "${model}". Expected "provider/model" (e.g., "anthropic/claude-opus-4")`
    );
  }
  return {
    providerID: model.slice(0, slashIndex),
    modelID: model.slice(slashIndex + 1),
  };
}

export type LoopCallbacks = {
  onIterationStart: (iteration: number) => void;
  onEvent: (event: ToolEvent) => void;
  onIterationComplete: (
    iteration: number,
    duration: number,
    commits: number,
  ) => void;
  onTasksUpdated: (done: number, total: number) => void;
  onCommitsUpdated: (commits: number) => void;
  onPause: () => void;
  onResume: () => void;
  onComplete: () => void;
  onError: (error: string) => void;
};

export async function runLoop(
  options: LoopOptions,
  persistedState: PersistedState,
  callbacks: LoopCallbacks,
  signal: AbortSignal,
): Promise<void> {
  // Start opencode server
  const server = await createOpencodeServer({ signal });
  const client = createOpencodeClient({ baseUrl: server.url });

  try {
    // Initialize iteration counter from persisted state
    let iteration = persistedState.iterationTimes.length;
    let isPaused = false;

    // Main loop
    while (!signal.aborted) {
      // Check for .ralph-done file at start of each iteration
      const doneFile = Bun.file(".ralph-done");
      if (await doneFile.exists()) {
        await doneFile.delete();
        callbacks.onComplete();
        break;
      }

      // Check for .ralph-pause file
      const pauseFile = Bun.file(".ralph-pause");
      if (await pauseFile.exists()) {
        if (!isPaused) {
          isPaused = true;
          callbacks.onPause();
        }
        await Bun.sleep(1000);
        continue;
      } else if (isPaused) {
        isPaused = false;
        callbacks.onResume();
      }

      // Iteration start (10.11)
      iteration++;
      const iterationStartTime = Date.now();
      callbacks.onIterationStart(iteration);
      
      // Add separator event for new iteration
      callbacks.onEvent({
        iteration,
        type: "separator",
        text: `iteration ${iteration}`,
        timestamp: iterationStartTime,
      });

      // Parse plan and update task counts (10.12)
      const { done, total } = await parsePlan(options.planFile);
      callbacks.onTasksUpdated(done, total);

      // Create session (10.13)
      const sessionResult = await client.session.create();
      if (!sessionResult.data) {
        callbacks.onError("Failed to create session");
        break;
      }
      const sessionId = sessionResult.data.id;

      // Send prompt (10.14)
      const promptText = buildPrompt(options);
      const { providerID, modelID } = parseModel(options.model);
      
      await client.session.prompt({
        path: { id: sessionId },
        body: {
          parts: [
            {
              type: "text",
              text: promptText,
            },
          ],
          model: {
            providerID,
            modelID,
          },
        },
      });

      // TODO: Implement event streaming (10.15)
      // TODO: Implement tool event mapping (10.16)
      // TODO: Implement session completion detection (10.17)
      // TODO: Implement session error handling (10.18)
      // TODO: Implement iteration completion (10.19)

      // Temporary: break to avoid infinite loop until remaining tasks are implemented
      break;
    }
  } finally {
    // Cleanup: close server on completion, error, or abort
    server.close();
  }
}
