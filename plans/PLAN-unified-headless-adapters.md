# Unified Headless + Adapter Execution (Checklist)

## Decisions (Resolved)
- [x] Headless + pause file: exit with code `2` if `.ralph-pause` is encountered; do not clear it.
- [x] Steering: live send to active session **and** append to next-iteration prompt.
- [x] Terminal rendering: `ghostty-opentui` required (no fallback renderer).

## Constraints (Must Preserve)
- [x] Keep all existing `LoopOptions` fields/behavior (`promptFile`, `debug`, `agent`, `serverUrl`, `serverTimeoutMs`).
- [x] Keep all existing `LoopCallbacks` fields/behavior (`onSessionCreated`, `onBackoff`, `onTokens`, etc.).
- [x] Preserve OpenCode server lifecycle logic and health checks.
- [x] Preserve OpenTUI renderer options and `renderer.disableStdoutInterception()` usage.
- [x] Preserve Windows keyboard fallback and TTY checks.
- [x] Do not alter TS/Bun config for `@opentui/solid`.
- [x] Keep build-time version injection (no runtime package.json read in compiled builds).

## Phase 1: CLI + Config + Exit Codes
- [x] Add CLI flags: `--headless/-H`, `--format`, `--timestamps`, `--yes`, `--no-auto-reset`.
- [x] Add CLI flags: `--adapter` (default `opencode-server`), `--max-iterations`, `--max-time`.
- [x] Bypass `confirm()` when `--headless` or `--yes`.
- [x] If non-TTY and prompt would occur: auto-reset unless `--no-auto-reset`, then exit `2`.
- [x] Remove unconditional `process.exit(0)`; use `process.exitCode`.
- [x] Ensure signal handlers set non-zero exit codes in headless mode when appropriate.

## Phase 2: Headless Runner + Output Formats
- [x] Add `src/cli-output.ts` with headless `LoopCallbacks` wrapper.
- [x] Add formatters: `src/formats/text.ts`, `src/formats/jsonl.ts`, `src/formats/json.ts`.
- [x] Emit only fields currently available from callbacks.
- [x] Ignore `spinner` and `separator` events in headless output.

## Phase 3: PTY Adapter Infrastructure
- [x] Add `src/adapters/types.ts` and `src/adapters/registry.ts`.
- [x] Keep adapter events limited to `output`, `exit`, `error`.
- [x] Add `src/pty/spawn.ts` with real PTY support and stderr drain.
- [x] Implement `opencode-run` adapter (`opencode run --print ...`).
- [x] Implement `codex` adapter (`codex exec ...`, strip provider prefix if present).
- [x] Use an `AbortController` per session; never dispatch on a signal.

## Phase 4: Loop + TUI Integration
- [x] Extend `LoopOptions` with `adapter?: string`.
- [x] Extend `LoopCallbacks` with `onRawOutput?` and optional `onAdapterModeChanged?`.
- [x] Keep SDK path unchanged when adapter is `opencode-server`.
- [x] Add PTY adapter path in `runLoop()` and stream output to `onRawOutput`.
- [x] Add `signal.aborted` check inside pause loop.
- [x] Append steering context to prompt for future iterations.
- [x] Add `src/components/terminal-pane.tsx` using `ghostty-opentui`.
- [x] Maintain a bounded terminal output buffer for PTY mode.
- [x] Render terminal pane in PTY mode; keep event log in SDK mode.
- [x] Reset terminal title on exit if required by renderer teardown.

## Phase 5: Dependency + Config Updates
- [x] Add `ghostty-opentui` dependency.
- [x] Register `ghostty-terminal` renderable in `src/index.ts` with `@opentui/core/extend`.
- [x] Update config in `src/index.ts` and `src/lib/config.ts` with:
  - [x] `adapter`
  - [x] `headless`
  - [x] `format`
  - [x] `timestamps`
  - [x] `yes`
  - [x] `autoReset`
  - [x] `maxIterations`
  - [x] `maxTime`
- [x] Preserve config merge behavior for existing fields.

## Phase 6: Tests
- [x] Unit tests for formatters.
- [x] Unit tests for PTY wrapper (mocked).
- [x] Integration tests for `--headless` (no TTY).
- [x] Integration tests for exit codes (success/error/abort/limit).
- [x] Integration tests for adapter selection (mocked PTY).
- [x] Ensure existing SDK loop tests remain valid.

## Risk Mitigations
- [x] Fail fast if `ghostty-opentui` is missing; exit non-zero.
- [x] Check Bun PTY availability/version on PTY adapter selection.
- [x] Exit headless on `.ralph-pause` detection.
- [x] Ensure exit codes are not forced to `0`.

## Acceptance Criteria
- [x] `ralph --headless` runs without TTY and emits valid text/JSONL/JSON.
- [x] Exit codes reflect success/error/interrupt/limit.
- [x] TUI behavior unchanged in SDK mode.
- [x] PTY adapters render terminal output via `ghostty-opentui`.
