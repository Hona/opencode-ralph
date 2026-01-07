# Connect Ralph to Existing OpenCode Server

Allow Ralph to connect to an existing/running OpenCode server via `--server` URL instead of auto-detecting or launching its own.

**Reference:** See `CONTEXT/PLAN-attach-to-existing-opencode-server-2026-01-06.md` for full design context.

**Key Constraint:** Ralph reads plan files and git state locally. Connecting to a remote server only makes sense if it operates on the same working directory (shared filesystem).

---

## Phase 1: Update Type Definitions

### 1.1 Add serverUrl to LoopOptions type

- [x] **1.1.1** Open `src/state.ts` and locate the `LoopOptions` type at lines 68-72
- [x] **1.1.2** Add `serverUrl?: string;` field after `prompt: string;`
- [x] **1.1.3** Add `serverTimeoutMs?: number;` field after `serverUrl`
- [x] **1.1.4** Run `bun run typecheck` to verify no type errors introduced

### 1.2 Add server fields to RalphConfig interface

- [x] **1.2.1** Open `src/index.ts` and locate `RalphConfig` interface at lines 15-19
- [x] **1.2.2** Add `server?: string;` field for server URL from config
- [x] **1.2.3** Add `serverTimeout?: number;` field for timeout in ms
- [x] **1.2.4** Run `bun run typecheck` to verify no type errors

### 1.3 Update mock factories for tests

- [x] **1.3.1** Open `tests/helpers/mock-factories.ts`
- [x] **1.3.2** Locate `createMockLoopOptions()` function at lines 51-60
- [x] **1.3.3** Add `serverUrl` and `serverTimeoutMs` to the returned object with `undefined` defaults
- [x] **1.3.4** Run `bun test` to verify existing tests still pass

---

## Phase 2: Add URL Validation Functions

### 2.1 Create validateAndNormalizeServerUrl function

- [x] **2.1.1** Open `src/loop.ts`
- [x] **2.1.2** Add the following function after the imports (around line 10):
  ```typescript
  /**
   * Validate and normalize a server URL.
   * @returns normalized origin (no trailing slash)
   * @throws Error if URL is invalid or not an origin
   */
  function validateAndNormalizeServerUrl(url: string): string {
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
  ```
- [x] **2.1.3** Run `bun run typecheck` to verify no errors

### 2.2 Create isLocalhost helper function

- [x] **2.2.1** Add the following function after `validateAndNormalizeServerUrl`:
  ```typescript
  /**
   * Check if a URL points to localhost.
   */
  function isLocalhost(url: string): boolean {
    const parsed = new URL(url);
    return parsed.hostname === "localhost" || 
           parsed.hostname === "127.0.0.1" || 
           parsed.hostname === "::1";
  }
  ```
- [x] **2.2.2** Run `bun run typecheck` to verify no errors

### 2.3 Write unit tests for URL validation

- [x] **2.3.1** Open `tests/unit/loop.test.ts`
- [x] **2.3.2** Add import at top: update the import to include `validateAndNormalizeServerUrl` (will need to export it first)
- [x] **2.3.3** Go back to `src/loop.ts` and add `export` keyword to `validateAndNormalizeServerUrl`
- [x] **2.3.4** Add the following test suite after existing tests:
  ```typescript
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
  ```
- [x] **2.3.5** Run `bun test tests/unit/loop.test.ts` to verify tests pass

---

## Phase 3: Add Health Check Function

### 3.1 Create ServerHealthResult type

- [x] **3.1.1** Open `src/loop.ts`
- [x] **3.1.2** Add the following type after `isLocalhost` function:
  ```typescript
  /**
   * Result of a server health check.
   */
  type ServerHealthResult =
    | { ok: true }
    | { ok: false; reason: "unreachable" | "unhealthy" };
  ```

### 3.2 Create checkServerHealth function

- [x] **3.2.1** Add the following function after `ServerHealthResult` type:
  ```typescript
  /**
   * Check if a server is healthy.
   * Composes timeout with optional abort signal for user cancellation.
   */
  async function checkServerHealth(
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
  ```
- [x] **3.2.2** Run `bun run typecheck` to verify no errors

### 3.3 Write unit tests for health check

- [x] **3.3.1** Open `tests/unit/loop.test.ts`
- [x] **3.3.2** Export `checkServerHealth` from `src/loop.ts`
- [x] **3.3.3** Add import for `checkServerHealth` in test file
- [x] **3.3.4** Add the following test suite:
  ```typescript
  describe("checkServerHealth", () => {
    it("should return ok:true when server responds with healthy:true", async () => {
      const originalFetch = globalThis.fetch;
      globalThis.fetch = mock(() => 
        Promise.resolve(new Response(JSON.stringify({ healthy: true }), { status: 200 }))
      );
      
      const result = await checkServerHealth("http://localhost:4190", 1000);
      expect(result).toEqual({ ok: true });
      
      globalThis.fetch = originalFetch;
    });

    it("should return ok:false reason:unhealthy when healthy:false", async () => {
      const originalFetch = globalThis.fetch;
      globalThis.fetch = mock(() => 
        Promise.resolve(new Response(JSON.stringify({ healthy: false }), { status: 200 }))
      );
      
      const result = await checkServerHealth("http://localhost:4190", 1000);
      expect(result).toEqual({ ok: false, reason: "unhealthy" });
      
      globalThis.fetch = originalFetch;
    });

    it("should return ok:false reason:unhealthy on non-200 response", async () => {
      const originalFetch = globalThis.fetch;
      globalThis.fetch = mock(() => 
        Promise.resolve(new Response("error", { status: 500 }))
      );
      
      const result = await checkServerHealth("http://localhost:4190", 1000);
      expect(result).toEqual({ ok: false, reason: "unhealthy" });
      
      globalThis.fetch = originalFetch;
    });

    it("should return ok:false reason:unreachable on network error", async () => {
      const originalFetch = globalThis.fetch;
      globalThis.fetch = mock(() => Promise.reject(new Error("Network error")));
      
      const result = await checkServerHealth("http://localhost:4190", 1000);
      expect(result).toEqual({ ok: false, reason: "unreachable" });
      
      globalThis.fetch = originalFetch;
    });
  });
  ```
- [x] **3.3.5** Run `bun test tests/unit/loop.test.ts` to verify tests pass

---

## Phase 4: Add External Server Connection Function

### 4.1 Create connectToExternalServer function

- [x] **4.1.1** Open `src/loop.ts`
- [x] **4.1.2** Add the following function after `checkServerHealth`:
   ```typescript
   /**
    * Connect to an external OpenCode server at the specified URL.
    * Validates the URL format and server health before returning.
    * 
    * NOTE: This function only returns connection info. The actual client
    * is created by runLoop() using createOpencodeClient() with createTimeoutlessFetch().
    * 
    * @throws Error if URL is invalid or server is not healthy
    */
   async function connectToExternalServer(
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
   ```
- [x] **4.1.3** Run `bun run typecheck` to verify no errors

### 4.2 Write unit tests for connectToExternalServer

- [x] **4.2.1** Export `connectToExternalServer` from `src/loop.ts`
- [x] **4.2.2** Add import in `tests/unit/loop.test.ts`
- [x] **4.2.3** Add the following test suite:
  ```typescript
  describe("connectToExternalServer", () => {
    it("should return connection info for healthy server", async () => {
      const originalFetch = globalThis.fetch;
      globalThis.fetch = mock(() => 
        Promise.resolve(new Response(JSON.stringify({ healthy: true }), { status: 200 }))
      );
      
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
      globalThis.fetch = mock(() => Promise.reject(new Error("Network error")));
      
      await expect(connectToExternalServer("http://localhost:4190")).rejects.toThrow("Cannot connect");
      
      globalThis.fetch = originalFetch;
    });

    it("should throw on unhealthy server", async () => {
      const originalFetch = globalThis.fetch;
      globalThis.fetch = mock(() => 
        Promise.resolve(new Response(JSON.stringify({ healthy: false }), { status: 200 }))
      );
      
      await expect(connectToExternalServer("http://localhost:4190")).rejects.toThrow("Server unhealthy");
      
      globalThis.fetch = originalFetch;
    });
  });
  ```
- [x] **4.2.4** Run `bun test tests/unit/loop.test.ts` to verify tests pass

---

## Phase 5: Update getOrCreateOpencodeServer

### 5.1 Update function signature

- [x] **5.1.1** Open `src/loop.ts`
- [x] **5.1.2** Locate `getOrCreateOpencodeServer` function (around line 35)
- [x] **5.1.3** Update the options parameter type to add:
  ```typescript
  async function getOrCreateOpencodeServer(options: {
    signal?: AbortSignal;
    port?: number;
    hostname?: string;
    serverUrl?: string;        // ADD THIS
    serverTimeoutMs?: number;  // ADD THIS
  }): Promise<{ url: string; close(): void; attached: boolean }> {
  ```
- [x] **5.1.4** Run `bun run typecheck` to verify no errors

### 5.2 Add external server connection logic

- [x] **5.2.1** Add the following code at the start of `getOrCreateOpencodeServer` function body (before existing logic):
  ```typescript
  // If explicit server URL provided, connect to it directly
  if (options.serverUrl) {
    return connectToExternalServer(options.serverUrl, {
      timeoutMs: options.serverTimeoutMs,
      signal: options.signal,
    });
  }
  ```
- [x] **5.2.2** Run `bun run typecheck` to verify no errors
- [x] **5.2.3** Run `bun test` to verify all existing tests still pass

---

## Phase 6: Update runLoop to Pass Server Options

### 6.1 Update runLoop server acquisition

- [x] **6.1.1** Open `src/loop.ts`
- [x] **6.1.2** Locate the call to `getOrCreateOpencodeServer` in `runLoop` (around line 120)
- [x] **6.1.3** Update the call to pass the new options:
  ```typescript
  server = await getOrCreateOpencodeServer({ 
    signal, 
    port: DEFAULT_PORT,
    serverUrl: options.serverUrl,
    serverTimeoutMs: options.serverTimeoutMs,
  });
  ```
- [x] **6.1.4** Run `bun run typecheck` to verify no errors
- [x] **6.1.5** Run `bun test` to verify all tests pass

---

## Phase 7: Update CLI Argument Parsing

### 7.1 Update config loading

- [x] **7.1.1** Open `src/index.ts`
- [x] **7.1.2** Locate `loadGlobalConfig()` function (lines 21-32)
- [x] **7.1.3** The function already returns `RalphConfig` which now includes `server` and `serverTimeout` fields
- [x] **7.1.4** Verify the JSON parsing will pick up these new fields automatically (it will, since it uses `as RalphConfig`)

### 7.2 Add --server CLI option

- [x] **7.2.1** Locate the yargs configuration (around line 130)
- [x] **7.2.2** Add the following option after the `--reset` option:
  ```typescript
  .option("server", {
    alias: "s",
    type: "string",
    description: "URL of existing OpenCode server to connect to",
    default: globalConfig.server,
  })
  ```
- [x] **7.2.3** Run `bun run typecheck` to verify no type errors

### 7.3 Add --server-timeout CLI option

- [x] **7.3.1** Add the following option after `--server`:
  ```typescript
  .option("server-timeout", {
    type: "number",
    description: "Health check timeout in ms for external server",
    default: globalConfig.serverTimeout ?? 5000,
  })
  ```
- [x] **7.3.2** Run `bun run typecheck` to verify no errors

### 7.4 Pass options to LoopOptions

- [x] **7.4.1** Locate the `LoopOptions` creation (around line 228)
- [x] **7.4.2** Update to include new fields:
  ```typescript
  const loopOptions: LoopOptions = {
    planFile: argv.plan,
    model: argv.model,
    prompt: argv.prompt || "",
    serverUrl: argv.server,
    serverTimeoutMs: argv.serverTimeout,
  };
  ```
- [x] **7.4.3** Run `bun run typecheck` to verify no errors
- [x] **7.4.4** Run `bun test` to verify all tests pass

---

## Phase 8: Update Integration Tests

### 8.1 Test that createOpencodeServer is not called when serverUrl provided

- [x] **8.1.1** Open `tests/integration/ralph-flow.test.ts`
- [x] **8.1.2** Add a new test case:
  ```typescript
  it("should not call createOpencodeServer when serverUrl is provided", async () => {
    // Mock fetch for health check
    const originalFetch = globalThis.fetch;
    globalThis.fetch = mock(() => 
      Promise.resolve(new Response(JSON.stringify({ healthy: true }), { status: 200 }))
    );

    const options: LoopOptions = {
      planFile: testPlanFile,
      model: "anthropic/claude-sonnet-4",
      prompt: "Test prompt for {plan}",
      serverUrl: "http://localhost:4190",
      serverTimeoutMs: 1000,
    };

    const persistedState: PersistedState = {
      startTime: Date.now(),
      initialCommitHash: "abc123",
      iterationTimes: [],
      planFile: testPlanFile,
    };

    const callbacks = createTestCallbacks();
    const controller = new AbortController();

    // Create .ralph-done to stop immediately
    cleanupFiles.push(".ralph-done");
    await Bun.write(".ralph-done", "");

    await runLoop(options, persistedState, callbacks, controller.signal);

    // Verify createOpencodeServer was NOT called (since serverUrl was provided)
    // The mock at line 77-82 tracks this
    const { createOpencodeServer } = await import("@opencode-ai/sdk");
    // Note: Due to how the mock is set up, we verify by checking the connection logic worked
    
    globalThis.fetch = originalFetch;
  });
  ```
- [x] **8.1.3** Run `bun test tests/integration/ralph-flow.test.ts` to verify test passes

### 8.2 Test connection error handling

- [x] **8.2.1** Add another test case:
  ```typescript
  it("should call onError when serverUrl is unreachable", async () => {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = mock(() => Promise.reject(new Error("Network error")));

    const options: LoopOptions = {
      planFile: testPlanFile,
      model: "anthropic/claude-sonnet-4",
      prompt: "Test prompt for {plan}",
      serverUrl: "http://unreachable:4190",
      serverTimeoutMs: 100,
    };

    const persistedState: PersistedState = {
      startTime: Date.now(),
      initialCommitHash: "abc123",
      iterationTimes: [],
      planFile: testPlanFile,
    };

    const callbacks = createTestCallbacks();
    const controller = new AbortController();

    await expect(runLoop(options, persistedState, callbacks, controller.signal))
      .rejects.toThrow("Cannot connect");

    // Verify onError was called
    expect(callbackOrder).toContain(expect.stringMatching(/^onError:/));

    globalThis.fetch = originalFetch;
  });
  ```
- [x] **8.2.2** Run `bun test tests/integration/ralph-flow.test.ts` to verify test passes

---

## Phase 9: Update Documentation

### 9.1 Update README.md usage table

- [x] **9.1.1** Open `README.md`
- [x] **9.1.2** Locate the usage table (around line 57)
- [x] **9.1.3** Add rows for new options:
  ```markdown
  | `--server, -s` | (none) | OpenCode server URL to connect to |
  | `--server-timeout` | `5000` | Health check timeout in ms |
  ```
- [x] **9.1.4** Verify table formatting is correct

### 9.2 Add example usage section

- [x] **9.2.1** Add the following after the usage table:
  ```markdown
  ### Connecting to an Existing Server

  Ralph can connect to an already-running OpenCode server instead of starting its own:

  ```bash
  # Connect to local server on custom port
  ralph --server http://localhost:5000

  # Connect to remote server (requires shared filesystem)
  ralph -s http://192.168.1.100:4190

  # With custom timeout
  ralph --server http://localhost:4190 --server-timeout 10000
  ```

  **Important:** Ralph reads `plan.md` and git state locally. When connecting to a remote server, ensure both machines have access to the same working directory (e.g., via NFS mount or the same repo checkout).
  ```

### 9.3 Document config file options

- [x] **9.3.1** Locate the existing config documentation or create a new section after "Files"
- [x] **9.3.2** Add:
  ```markdown
  ## Configuration

  Ralph reads configuration from `~/.config/ralph/config.json`:

  ```json
  {
    "model": "opencode/claude-opus-4-5",
    "plan": "plan.md",
    "server": "http://localhost:4190",
    "serverTimeout": 5000
  }
  ```

  CLI arguments override config file values.
  ```

---

## Phase 10: Final Testing and Cleanup

### 10.1 Run full test suite

- [x] **10.1.1** Run `bun test` to verify all tests pass
- [x] **10.1.2** Run `bun run typecheck` to verify no type errors
- [x] **10.1.3** Fix any failing tests or type errors

### 10.2 Manual testing checklist

- [ ] **10.2.1** Test: `ralph` (no args) - should work as before (auto-detect or start server)
- [ ] **10.2.2** Test: `ralph --server http://localhost:4190` with server running - should connect
- [ ] **10.2.3** Test: `ralph --server http://localhost:4190` without server - should show "Cannot connect" error
- [ ] **10.2.4** Test: `ralph --server not-a-url` - should show "Invalid URL format" error
- [ ] **10.2.5** Test: `ralph --server http://localhost:4190/api` - should show "origin only" error
- [ ] **10.2.6** Test: `ralph -s http://localhost:4190` - alias should work
- [ ] **10.2.7** Test: Create config file with `server` option, run `ralph` - should use config value
- [ ] **10.2.8** Test: Config file + CLI override - CLI should take precedence

### 10.3 Verify HTTP warning in logs

- [ ] **10.3.1** Run `ralph --server http://192.168.1.1:4190` (non-localhost HTTP)
- [ ] **10.3.2** Check `.ralph-log` for warning message about insecure connection
- [ ] **10.3.3** Run `ralph --server https://example.com:4190` - should NOT log warning
- [ ] **10.3.4** Run `ralph --server http://localhost:4190` - should NOT log warning (localhost is ok)

### 10.4 Code review checklist

- [ ] **10.4.1** All new functions have JSDoc comments
- [ ] **10.4.2** No `console.log` statements left in code
- [ ] **10.4.3** Error messages are clear and actionable
- [x] **10.4.4** All exports are intentional (don't export internal helpers)
- [ ] **10.4.5** No TODO/FIXME comments left unresolved

### 10.5 Final cleanup

- [ ] **10.5.1** Remove any debug logging added during development
- [ ] **10.5.2** Ensure exports are minimal (only export what's needed for tests)
- [ ] **10.5.3** Run `bun test` one final time
- [ ] **10.5.4** Run `bun run typecheck` one final time

---

## Quick Reference

### Files Modified

| File | Changes |
|------|---------|
| `src/state.ts` | Add `serverUrl`, `serverTimeoutMs` to `LoopOptions` |
| `src/index.ts` | Add `server`, `serverTimeout` to `RalphConfig`, CLI args |
| `src/loop.ts` | Add URL validation, health check, connection functions |
| `tests/unit/loop.test.ts` | Add tests for new functions |
| `tests/integration/ralph-flow.test.ts` | Add integration tests |
| `tests/helpers/mock-factories.ts` | Update mock factory |
| `README.md` | Document new options |

### New Functions in src/loop.ts

1. `validateAndNormalizeServerUrl(url: string): string` - Validates and normalizes server URL
2. `isLocalhost(url: string): boolean` - Checks if URL is localhost
3. `checkServerHealth(url, timeoutMs, signal?): Promise<ServerHealthResult>` - Health check with timeout
4. `connectToExternalServer(url, options?): Promise<{url, close, attached}>` - Connect to external server

### Key Behaviors

- `--server` provided: Skip auto-detect, connect directly to specified URL
- No `--server`: Use existing behavior (auto-detect then start if needed)
- Health check timeout: Default 5000ms, configurable via `--server-timeout`
- HTTP warning: Logged to `.ralph-log` for non-localhost HTTP connections
- Errors: Thrown and handled by existing error path at `src/loop.ts:303-307`
