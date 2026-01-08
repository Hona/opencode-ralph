import { createOpencodeServer, createOpencodeClient } from "@opencode-ai/sdk";
import type { LoopOptions, PersistedState, SessionInfo, ToolEvent } from "./state.js";
import { getHeadHash, getCommitsSince, getDiffStats } from "./git.js";
import { parsePlan } from "./plan.js";
import { log } from "./util/log.js";

const DEFAULT_PROMPT = `READ all of {plan}. Pick ONE task. If needed, verify via web/code search (this applies to packages, knowledge, deterministic data - NEVER VERIFY EDIT TOOLS WORKED OR THAT YOU COMMITED SOMETHING. BE PRAGMATIC ABOUT EVERYTHING). Complete task. Commit change (update the plan.md in the same commit). ONLY do one task unless GLARINGLY OBVIOUS steps should run together. Update {plan}. If you learn a critical operational detail, update AGENTS.md. When ALL tasks complete, create .ralph-done and exit. NEVER GIT PUSH. ONLY COMMIT.`;

const DEFAULT_PORT = 4190;

// Backoff configuration
const BACKOFF_BASE_MS = 5000; // 5 seconds
const BACKOFF_MAX_MS = 300000; // 5 minutes

/**
 * Calculate exponential backoff delay with jitter.
 * Formula: base * 2^(attempt-1) with 10% jitter, capped at max.
 * @param attempt - The attempt number (1-based)
 * @returns Delay in milliseconds
 */
export function calculateBackoffMs(attempt: number): number {
  if (attempt <= 0) return 0;
  
  // Exponential growth: base * 2^(attempt-1)
  const exponentialDelay = BACKOFF_BASE_MS * Math.pow(2, attempt - 1);
  
  // Cap at maximum delay
  const cappedDelay = Math.min(exponentialDelay, BACKOFF_MAX_MS);
  
  // Add 10% jitter to prevent synchronized retries
  const jitter = cappedDelay * 0.1 * Math.random();
  
  return Math.round(cappedDelay + jitter);
}
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
 * Debug session state - holds server and client for debug mode.
 * Cached across createDebugSession calls to avoid recreating server.
 */
let debugServer: { url: string; close(): void; attached: boolean } | null = null;
let debugClient: ReturnType<typeof createOpencodeClient> | null = null;

/**
 * Create a new session in debug mode.
 * Initializes server/client on first call, then creates a session.
 * Returns session info for use in the TUI.
 */
export async function createDebugSession(options: {
  serverUrl?: string;
  serverTimeoutMs?: number;
  model: string;
  agent?: string;
}): Promise<{
  sessionId: string;
  serverUrl: string;
  attached: boolean;
  sendMessage: (message: string) => Promise<void>;
}> {
  // Initialize server and client if not already created
  if (!debugServer || !debugClient) {
    log("loop", "Debug mode: initializing server/client...");
    debugServer = await getOrCreateOpencodeServer({
      port: DEFAULT_PORT,
      serverUrl: options.serverUrl,
      serverTimeoutMs: options.serverTimeoutMs,
    });
    
    const createTimeoutlessFetch = () => {
      return (req: any) => {
        req.timeout = false;
        return fetch(req);
      };
    };
    
    debugClient = createOpencodeClient({ 
      baseUrl: debugServer.url, 
      fetch: createTimeoutlessFetch() 
    } as any);
    
    log("loop", "Debug mode: server/client ready", { url: debugServer.url });
  }

  // Create a new session
  log("loop", "Debug mode: creating session...");
  const sessionResult = await debugClient.session.create();
  if (!sessionResult.data) {
    throw new Error("Failed to create debug session");
  }
  
  const sessionId = sessionResult.data.id;
  log("loop", "Debug mode: session created", { sessionId });

  // Parse model for sendMessage
  const { providerID, modelID } = parseModel(options.model);
  const client = debugClient;

  // Create sendMessage function
  const sendMessage = async (message: string): Promise<void> => {
    log("loop", "Debug mode: sending message", { sessionId, message: message.slice(0, 50) });
    await client.session.prompt({
      path: { id: sessionId },
      body: {
        parts: [{ type: "text", text: message }],
        model: { providerID, modelID },
        ...(options.agent && { agent: options.agent }),
      },
    });
  };

  return {
    sessionId,
    serverUrl: debugServer.url,
    attached: debugServer.attached,
    sendMessage,
  };
}

/**
 * Clean up debug mode resources.
 * Call this when exiting debug mode.
 */
export function cleanupDebugSession(): void {
  if (debugServer) {
    log("loop", "Debug mode: cleaning up server");
    debugServer.close();
    debugServer = null;
  }
  debugClient = null;
}

/**
 * Build the prompt string with precedence: --prompt > --prompt-file > DEFAULT_PROMPT.
 * Replaces {plan} and {{PLAN_FILE}} placeholders with the actual plan file path.
 */
export async function buildPrompt(options: LoopOptions): Promise<string> {
  let template: string;

  // Precedence 1: --prompt CLI option (explicit string)
  if (options.prompt && options.prompt.trim()) {
    template = options.prompt;
  }
  // Precedence 2: --prompt-file (read from file if it exists)
  else if (options.promptFile) {
    const file = Bun.file(options.promptFile);
    if (await file.exists()) {
      template = await file.text();
      log("loop", "Loaded prompt from file", { path: options.promptFile });
    } else {
      // File doesn't exist, fall through to default
      template = DEFAULT_PROMPT;
    }
  }
  // Precedence 3: DEFAULT_PROMPT fallback
  else {
    template = DEFAULT_PROMPT;
  }

  // Replace both {plan} and {{PLAN_FILE}} placeholders
  return template
    .replace(/\{plan\}/g, options.planFile)
    .replace(/\{\{PLAN_FILE\}\}/g, options.planFile);
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

/**
 * Token usage data from step-finish events.
 * Maps to StepFinishPart.tokens structure from the SDK.
 */
export type TokenUsage = {
  input: number;
  output: number;
  reasoning: number;
  cacheRead: number;
  cacheWrite: number;
};

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
  onBackoff?: (backoffMs: number, retryAt: number) => void;
  onBackoffCleared?: () => void;
  /** Called when token usage data is received from step-finish events */
  onTokens?: (tokens: TokenUsage) => void;
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
    // Check if pause file exists at startup - if so, start in paused state
    // to avoid calling onPause() callback (which would override "ready" status)
    const pauseFileExistsAtStart = await Bun.file(".ralph-pause").exists();
    let isPaused = pauseFileExistsAtStart;
    let previousCommitCount = await getCommitsSince(persistedState.initialCommitHash);
    
    // Error tracking for exponential backoff (local, not persisted)
    let errorCount = 0;
    
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

      // Apply error backoff before iteration starts
      if (errorCount > 0) {
        const backoffMs = calculateBackoffMs(errorCount);
        const retryAt = Date.now() + backoffMs;
        log("loop", "Error backoff", { errorCount, backoffMs, retryAt });
        callbacks.onBackoff?.(backoffMs, retryAt);
        await Bun.sleep(backoffMs);
        callbacks.onBackoffCleared?.();
      }

      // Iteration start (10.11)
      iteration++;
      const iterationStartTime = Date.now();
      log("loop", "Iteration starting", { iteration });
      callbacks.onIterationStart(iteration);

      try {
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
        // Skip plan file validation in debug mode - plan file is optional
        if (!options.debug) {
          log("loop", "Parsing plan file");
          const { done, total } = await parsePlan(options.planFile);
          log("loop", "Plan parsed", { done, total });
          callbacks.onTasksUpdated(done, total);
        } else {
          log("loop", "Debug mode: skipping plan file validation");
        }

        // Parse model and build prompt before session creation
        const promptText = await buildPrompt(options);
        const { providerID, modelID } = parseModel(options.model);

        // Create session (10.13)
        log("loop", "Creating session...");
        const sessionResult = await client.session.create();
        if (!sessionResult.data) {
          log("loop", "ERROR: Failed to create session");
          throw new Error("Failed to create session");
        }
        const sessionId = sessionResult.data.id;
        log("loop", "Session created", { sessionId });

        // Track whether current session is active (for steering mode guard)
        let sessionActive = true;

        // Create sendMessage function for steering mode
        const sendMessage = async (message: string): Promise<void> => {
          // Guard: check for active session before sending
          if (!sessionActive) {
            log("loop", "Cannot send steering message: no active session");
            throw new Error("No active session");
          }
          log("loop", "Sending steering message", { sessionId, message: message.slice(0, 50) });
          await client.session.prompt({
            path: { id: sessionId },
            body: {
              parts: [{ type: "text", text: message }],
              model: { providerID, modelID },
              ...(options.agent && { agent: options.agent }),
            },
          });
        };

        // Call onSessionCreated callback with session info
        callbacks.onSessionCreated?.({
          sessionId,
          serverUrl: server!.url,
          attached: server!.attached,
          sendMessage,
        });

        // Subscribe to events - the SSE connection is established when we start iterating
        log("loop", "Subscribing to events...");
        const events = await client.event.subscribe();

        let promptSent = false;

        // Set idle state while waiting for LLM response
        callbacks.onIdleChanged(true);

        let receivedFirstEvent = false;
        // Track streamed text parts by ID - stores text we've already logged
        // so we only emit complete lines, not every streaming delta
        const loggedTextByPartId = new Map<string, string>();
        
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
                ...(options.agent && { agent: options.agent }),
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
              const input = part.state.input;
              const title =
                part.state.title ||
                (Object.keys(input).length > 0
                  ? JSON.stringify(input)
                  : "Unknown");

              // Extract detail based on tool type
              // For file tools: use filePath or path
              // For bash: use command
              // For others: compact JSON of args
              let detail: string | undefined;
              if (input.filePath) {
                detail = String(input.filePath);
              } else if (input.path) {
                detail = String(input.path);
              } else if (input.command) {
                detail = String(input.command);
              } else if (Object.keys(input).length > 0) {
                // Compact JSON for other tools with args
                detail = JSON.stringify(input);
              }

              // Mark file read tools as verbose (dimmed display)
              const isFileRead = toolName === "read";

              log("loop", "Tool completed", { toolName, title, detail });
              callbacks.onEvent({
                iteration,
                type: "tool",
                icon: toolName,
                text: title,
                timestamp: part.state.time.end,
                detail,
                verbose: isFileRead,
              });
            }

            // Reasoning/thought event - capture LLM text responses
            // Only emit complete lines to avoid noisy streaming updates
            if (part.type === "text" && part.text) {
              // Set isIdle to false when first event arrives
              if (!receivedFirstEvent) {
                receivedFirstEvent = true;
                callbacks.onIdleChanged(false);
              }

              const partId = part.id;
              const previouslyLogged = loggedTextByPartId.get(partId) || "";
              const fullText = part.text;
              
              // Find new content that hasn't been logged yet
              const newContent = fullText.slice(previouslyLogged.length);
              
              // Split into lines - only emit lines that are complete (have \n after them)
              const lines = newContent.split("\n");
              
              // Process all complete lines (all except the last one which may be partial)
              for (let i = 0; i < lines.length - 1; i++) {
                const line = lines[i].trim();
                if (line) {
                  // Truncate long lines for display
                  const truncated = line.length > 80 
                    ? line.slice(0, 77) + "..." 
                    : line;
                  
                  log("loop", "Reasoning", { text: truncated });
                  callbacks.onEvent({
                    iteration,
                    type: "reasoning",
                    icon: "thought",
                    text: truncated,
                    timestamp: Date.now(),
                    verbose: true,
                  });
                }
              }
              
              // Update tracked position to include all complete lines we've logged
              // Keep partial last line for next update
              const completedLength = previouslyLogged.length + 
                (lines.length > 1 ? newContent.lastIndexOf("\n") + 1 : 0);
              if (completedLength > previouslyLogged.length) {
                loggedTextByPartId.set(partId, fullText.slice(0, completedLength));
              }
            }

            // Step finish event - extract token usage data
            if (part.type === "step-finish" && callbacks.onTokens) {
              const tokens = part.tokens;
              log("loop", "Step finished with tokens", {
                input: tokens.input,
                output: tokens.output,
                reasoning: tokens.reasoning,
                cacheRead: tokens.cache.read,
                cacheWrite: tokens.cache.write,
              });
              callbacks.onTokens({
                input: tokens.input,
                output: tokens.output,
                reasoning: tokens.reasoning,
                cacheRead: tokens.cache.read,
                cacheWrite: tokens.cache.write,
              });
            }
          }

          // Session completion detection (10.17)
          if (event.type === "session.idle" && event.properties.sessionID === sessionId) {
            log("loop", "Session idle, breaking event loop");
            sessionActive = false;
            callbacks.onSessionEnded?.(sessionId);
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
            sessionActive = false;
            callbacks.onSessionEnded?.(sessionId);
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

        // Reset error count on successful iteration
        errorCount = 0;
      } catch (iterationError) {
        // Handle iteration errors with retry logic
        if (signal.aborted) {
          // Don't retry if abort signal is set
          throw iterationError;
        }

        const errorMessage = iterationError instanceof Error ? iterationError.message : String(iterationError);
        errorCount++;
        log("loop", "Error in iteration", { error: errorMessage, errorCount });
        callbacks.onError(errorMessage);
        // Continue loop to retry with backoff
      }
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
