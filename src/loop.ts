import { createOpencodeServer, createOpencodeClient } from "@opencode-ai/sdk";
import type { LoopOptions, PersistedState, SessionInfo, ToolEvent } from "./state.js";
import { getHeadHash, getCommitsSince, getDiffStats } from "./git.js";
import { parsePlan } from "./plan.js";
import { log } from "./util/log.js";

const DEFAULT_PROMPT = `READ all of {plan}. Pick ONE task. If needed, verify via web/code search (this applies to packages, knowledge, deterministic data - NEVER VERIFY EDIT TOOLS WORKED OR THAT YOU COMMITED SOMETHING. BE PRAGMATIC ABOUT EVERYTHING). Complete task. Commit change (update the plan.md in the same commit). ONLY do one task unless GLARINGLY OBVIOUS steps should run together. Update {plan}. If you learn a critical operational detail, update AGENTS.md. When ALL tasks complete, create .ralph-done and exit. NEVER GIT PUSH. ONLY COMMIT.`;

const DEFAULT_PORT = 4190;
const DEFAULT_HOSTNAME = "127.0.0.1";

/**
 * Validate and normalize a server URL.
 * @returns normalized origin (no trailing slash)
 * @throws Error if URL is invalid or not an origin
 */
export function validateAndNormalizeServerUrl(url: string): string {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new Error(`Invalid URL format: ${url}`);
  }
  
  if (!['http:', 'https:'].includes(parsed.protocol)) {
    throw new Error(`Invalid protocol: ${parsed.protocol}. Must be http or https.`);
  }
  if (parsed.pathname !== "/" || parsed.search || parsed.hash) {
    throw new Error(`Server URL must be origin only (no path/query/fragment): ${url}`);
  }
  
  // URL.origin never has trailing slash per WHATWG spec
  return parsed.origin;
}

/**
 * Check if a URL points to localhost.
 */
function isLocalhost(url: string): boolean {
  const parsed = new URL(url);
  return parsed.hostname === "localhost" || 
         parsed.hostname === "127.0.0.1" || 
         parsed.hostname === "::1";
}

/**
 * Result of a server health check.
 */
type ServerHealthResult =
  | { ok: true }
  | { ok: false; reason: "unreachable" | "unhealthy" };

/**
 * Check if a server is healthy.
 * Composes timeout with optional abort signal for user cancellation.
 */
export async function checkServerHealth(
  url: string,
  timeoutMs: number,
  abortSignal?: AbortSignal
): Promise<ServerHealthResult> {
  try {
    const signals: AbortSignal[] = [AbortSignal.timeout(timeoutMs)];
    if (abortSignal) {
      signals.push(abortSignal);
    }
    
    const response = await fetch(`${url}/global/health`, {
      signal: AbortSignal.any(signals),
    });
    
    if (!response.ok) {
      return { ok: false, reason: "unhealthy" };
    }
    
    const data = await response.json();
    return data.healthy === true 
      ? { ok: true } 
      : { ok: false, reason: "unhealthy" };
  } catch {
    return { ok: false, reason: "unreachable" };
  }
}

/**
 * Connect to an external OpenCode server at the specified URL.
 * Validates the URL format and server health before returning.
 * 
 * NOTE: This function only returns connection info. The actual client
 * is created by runLoop() using createOpencodeClient() with createTimeoutlessFetch().
 * 
 * @throws Error if URL is invalid or server is not healthy
 */
export async function connectToExternalServer(
  url: string,
  options?: { timeoutMs?: number; signal?: AbortSignal }
): Promise<{ url: string; close(): void; attached: boolean }> {
  const timeoutMs = options?.timeoutMs ?? 5000;
  
  const normalizedUrl = validateAndNormalizeServerUrl(url);
  
  // Warn about non-HTTPS for non-localhost (logged to .ralph-log for debugging)
  if (!normalizedUrl.startsWith("https://") && !isLocalhost(normalizedUrl)) {
    log("loop", "WARNING: Using insecure HTTP connection to non-localhost server", { 
      url: normalizedUrl 
    });
  }
  
  // Check server health with timeout (and optional user abort signal)
  const health = await checkServerHealth(normalizedUrl, timeoutMs, options?.signal);
  if (!health.ok) {
    const message = health.reason === "unreachable" 
      ? `Cannot connect to server at ${normalizedUrl}` 
      : `Server unhealthy at ${normalizedUrl}`;
    throw new Error(message);
  }
  
  log("loop", "Connected to external server", { url: normalizedUrl });
  
  return {
    url: normalizedUrl,
    close: () => {}, // No-op - we don't manage external servers
    attached: true,
  };
}

/**
 * Check if an opencode server is already running at the given URL.
 * Uses the /global/health endpoint.
 */
async function tryConnectToExistingServer(url: string): Promise<boolean> {
  try {
    const response = await fetch(`${url}/global/health`, {
      signal: AbortSignal.timeout(1000),
    });
    if (response.ok) {
      const data = await response.json();
      return data.healthy === true;
    }
  } catch {
    // Server not running or not responding
  }
  return false;
}

/**
 * Get or create an opencode server.
 * First tries to attach to an existing server, then starts a new one if needed.
 * If serverUrl is provided, connects to that external server directly.
 */
async function getOrCreateOpencodeServer(options: {
  signal?: AbortSignal;
  port?: number;
  hostname?: string;
  serverUrl?: string;
  serverTimeoutMs?: number;
}): Promise<{ url: string; close(): void; attached: boolean }> {
  // If explicit server URL provided, connect to it directly
  if (options.serverUrl) {
    return connectToExternalServer(options.serverUrl, {
      timeoutMs: options.serverTimeoutMs,
      signal: options.signal,
    });
  }

  const hostname = options.hostname || DEFAULT_HOSTNAME;
  const port = options.port || DEFAULT_PORT;
  const url = `http://${hostname}:${port}`;

  // Try to attach to existing server first
  if (await tryConnectToExistingServer(url)) {
    log("loop", "Attached to existing server", { url });
    return {
      url,
      close: () => {}, // No-op - we didn't start it
      attached: true,
    };
  }

  // Start new server
  log("loop", "Starting new server...");
  const server = await createOpencodeServer(options);
  return {
    ...server,
    attached: false,
  };
}

/**
 * Build the prompt string by replacing {plan} placeholders with the actual plan file path.
 */
export function buildPrompt(options: LoopOptions): string {
  const template = options.prompt || DEFAULT_PROMPT;
  return template.replace(/\{plan\}/g, options.planFile);
}

/**
 * Parse a model string into provider and model IDs.
 * @param model - Model string in format "provider/model" (e.g., "anthropic/claude-opus-4")
 * @throws Error if model string doesn't contain a slash separator
 */
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
  onSessionCreated?: (session: SessionInfo) => void;
  onSessionEnded?: (sessionId: string) => void;
};

export async function runLoop(
  options: LoopOptions,
  persistedState: PersistedState,
  callbacks: LoopCallbacks,
  signal: AbortSignal,
): Promise<void> {
  log("loop", "runLoop started", { planFile: options.planFile, model: options.model });
  
  let server: { url: string; close(): void; attached: boolean } | null = null;

  function createTimeoutlessFetch() {
    return (req: any) => {
      // @ts-ignore - Bun Request supports .timeout
      req.timeout = false;
      return fetch(req);
    };
  }

  try {
    // Get or create opencode server (attach if already running)
    log("loop", "Creating opencode server...");
    server = await getOrCreateOpencodeServer({ 
      signal, 
      port: DEFAULT_PORT,
      serverUrl: options.serverUrl,
      serverTimeoutMs: options.serverTimeoutMs,
    });
    log("loop", "Server ready", { url: server.url, attached: server.attached });
    
    const client = createOpencodeClient({ baseUrl: server.url, fetch: createTimeoutlessFetch() } as any);
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

      // Parse model and build prompt before session creation
      const promptText = buildPrompt(options);
      const { providerID, modelID } = parseModel(options.model);

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

      // Create sendMessage function for steering mode
      const sendMessage = async (message: string): Promise<void> => {
        log("loop", "Sending steering message", { sessionId, message: message.slice(0, 50) });
        await client.session.prompt({
          path: { id: sessionId },
          body: {
            parts: [{ type: "text", text: message }],
            model: { providerID, modelID },
          },
        });
      };

      // Subscribe to events - the SSE connection is established when we start iterating
      log("loop", "Subscribing to events...");
      const events = await client.event.subscribe();

      let promptSent = false;

      // Set idle state while waiting for LLM response
      callbacks.onIdleChanged(true);

      let receivedFirstEvent = false;
      for await (const event of events.stream) {
        // When SSE connection is established, send the prompt
        // This ensures we don't miss any events due to race conditions
        if (event.type === "server.connected" && !promptSent) {
          promptSent = true;
          log("loop", "Sending prompt", { providerID, modelID });

          // Fire prompt in background - don't block event loop
          client.session.prompt({
            path: { id: sessionId },
            body: {
              parts: [{ type: "text", text: promptText }],
              model: { providerID, modelID },
            },
          }).catch((e) => {
            log("loop", "Prompt error", { error: String(e) });
          });

          continue;
        }

        if (signal.aborted) break;

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

          // Reasoning/thought event - capture LLM text responses
          if (part.type === "text" && part.text) {
            // Set isIdle to false when first event arrives
            if (!receivedFirstEvent) {
              receivedFirstEvent = true;
              callbacks.onIdleChanged(false);
            }

            // Truncate long reasoning text for display
            const content = part.text;
            const firstLine = content.split("\n")[0];
            const truncated = firstLine.length > 80 
              ? firstLine.slice(0, 77) + "..." 
              : firstLine;

            if (truncated.trim()) {
              log("loop", "Reasoning", { text: truncated });
              callbacks.onEvent({
                iteration,
                type: "reasoning",
                icon: "thought",
                text: truncated,
                timestamp: Date.now(),
              });
            }
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
