import { createOpencodeServer, createOpencodeClient } from "@opencode-ai/sdk";
import type { LoopOptions, PersistedState, ToolEvent } from "./state.js";
import { getHeadHash, getCommitsSince, getDiffStats } from "./git.js";
import { parsePlan } from "./plan.js";
import { log } from "./util/log.js";

const DEFAULT_PROMPT = `READ all of {plan}. Pick ONE task. If needed, verify via web/code search (this applies to packages, knowledge, deterministic data - NEVER VERIFY EDIT TOOLS WORKED OR THAT YOU COMMITED SOMETHING. BE PRAGMATIC ABOUT EVERYTHING). Complete task. Commit change (update the plan.md in the same commit). ONLY do one task unless GLARINGLY OBVIOUS steps should run together. Update {plan}. If you learn a critical operational detail, update AGENTS.md. When ALL tasks complete, create .ralph-done and exit. NEVER GIT PUSH. ONLY COMMIT.`;

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
  onDiffUpdated: (added: number, removed: number) => void;
  onPause: () => void;
  onResume: () => void;
  onComplete: () => void;
  onError: (error: string) => void;
  onIdleChanged: (isIdle: boolean) => void;
};

export async function runLoop(
  options: LoopOptions,
  persistedState: PersistedState,
  callbacks: LoopCallbacks,
  signal: AbortSignal,
): Promise<void> {
  log("loop", "runLoop started", { planFile: options.planFile, model: options.model });
  
  let server: { url: string; close(): void } | null = null;

  try {
    // Start opencode server
    log("loop", "Creating opencode server...");
    server = await createOpencodeServer({ signal, port: 4190 });
    log("loop", "Server created", { url: server.url });
    
    const client = createOpencodeClient({ baseUrl: server.url });
    log("loop", "Client created");

    // Initialize iteration counter from persisted state
    let iteration = persistedState.iterationTimes.length;
    let isPaused = false;
    let previousCommitCount = await getCommitsSince(persistedState.initialCommitHash);
    log("loop", "Initial state", { iteration, previousCommitCount });

    // Main loop
    while (!signal.aborted) {
      // Check for .ralph-done file at start of each iteration
      const doneFile = Bun.file(".ralph-done");
      if (await doneFile.exists()) {
        log("loop", ".ralph-done found, completing");
        await doneFile.delete();
        callbacks.onComplete();
        break;
      }

      // Check for .ralph-pause file
      const pauseFile = Bun.file(".ralph-pause");
      if (await pauseFile.exists()) {
        if (!isPaused) {
          isPaused = true;
          log("loop", "Pausing");
          callbacks.onPause();
        }
        await Bun.sleep(1000);
        continue;
      } else if (isPaused) {
        isPaused = false;
        log("loop", "Resuming");
        callbacks.onResume();
      }

      // Iteration start (10.11)
      iteration++;
      const iterationStartTime = Date.now();
      log("loop", "Iteration starting", { iteration });
      callbacks.onIterationStart(iteration);
      
      // Add separator event for new iteration
      callbacks.onEvent({
        iteration,
        type: "separator",
        text: `iteration ${iteration}`,
        timestamp: iterationStartTime,
      });

      // Add spinner event (will be kept at end of array and removed when iteration completes)
      callbacks.onEvent({
        iteration,
        type: "spinner",
        text: "looping...",
        timestamp: iterationStartTime,
      });

      // Parse plan and update task counts (10.12)
      log("loop", "Parsing plan file");
      const { done, total } = await parsePlan(options.planFile);
      log("loop", "Plan parsed", { done, total });
      callbacks.onTasksUpdated(done, total);

      // Create session (10.13)
      log("loop", "Creating session...");
      const sessionResult = await client.session.create();
      if (!sessionResult.data) {
        log("loop", "ERROR: Failed to create session");
        callbacks.onError("Failed to create session");
        break;
      }
      const sessionId = sessionResult.data.id;
      log("loop", "Session created", { sessionId });

      // Send prompt (10.14)
      const promptText = buildPrompt(options);
      const { providerID, modelID } = parseModel(options.model);
      log("loop", "Sending prompt", { providerID, modelID });
      
      await client.session.promptAsync({
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
      log("loop", "Prompt sent (async)");
      
      // Set idle state while waiting for LLM response
      callbacks.onIdleChanged(true);

      // Subscribe to events and iterate over the stream (10.15)
      log("loop", "Subscribing to events...");
      const events = await client.event.subscribe();
      log("loop", "Event subscription established, processing events...");
      
      let receivedFirstEvent = false;
      for await (const event of events.stream) {
        if (signal.aborted) {
          log("loop", "Signal aborted during event processing");
          break;
        }
        
        // Filter events for current session ID
        if (event.type === "message.part.updated") {
          const part = event.properties.part;
          if (part.sessionID !== sessionId) continue;

          // Tool event mapping (10.16)
          if (part.type === "tool" && part.state.status === "completed") {
            // Set isIdle to false when first tool event arrives
            if (!receivedFirstEvent) {
              receivedFirstEvent = true;
              callbacks.onIdleChanged(false);
            }
            
            const toolName = part.tool;
            const title =
              part.state.title ||
              (Object.keys(part.state.input).length > 0
                ? JSON.stringify(part.state.input)
                : "Unknown");

            log("loop", "Tool completed", { toolName, title });
            callbacks.onEvent({
              iteration,
              type: "tool",
              icon: toolName,
              text: title,
              timestamp: part.state.time.end,
            });
          }
        }

        // Session completion detection (10.17)
        if (event.type === "session.idle" && event.properties.sessionID === sessionId) {
          log("loop", "Session idle, breaking event loop");
          break;
        }

        // Session error handling (10.18)
        if (event.type === "session.error") {
          const props = event.properties;
          if (props.sessionID !== sessionId || !props.error) continue;
          
          // Extract error message from error object
          let errorMessage = String(props.error.name);
          if ("data" in props.error && props.error.data && "message" in props.error.data) {
            errorMessage = String(props.error.data.message);
          }
          
          log("loop", "Session error", { errorMessage });
          callbacks.onError(errorMessage);
          throw new Error(errorMessage);
        }
      }

      // Iteration completion (10.19)
      const iterationDuration = Date.now() - iterationStartTime;
      const totalCommits = await getCommitsSince(persistedState.initialCommitHash);
      const commitsThisIteration = totalCommits - previousCommitCount;
      previousCommitCount = totalCommits;
      
      // Get diff stats
      const diffStats = await getDiffStats(persistedState.initialCommitHash);
      
      log("loop", "Iteration completed", { iteration, duration: iterationDuration, commits: commitsThisIteration, diff: diffStats });
      callbacks.onIterationComplete(iteration, iterationDuration, commitsThisIteration);
      callbacks.onCommitsUpdated(totalCommits);
      callbacks.onDiffUpdated(diffStats.added, diffStats.removed);
    }
    
    log("loop", "Main loop exited", { aborted: signal.aborted });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    log("loop", "ERROR in runLoop", { error: errorMessage });
    callbacks.onError(errorMessage);
    throw error;
  } finally {
    log("loop", "Cleaning up...");
    if (server) {
      log("loop", "Closing server");
      server.close();
    }
    log("loop", "Cleanup complete");
  }
}
