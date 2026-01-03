# opencode-ralph Implementation Plan

A fullscreen TUI harness for Ralph-driven development using `@opentui/solid` and `@opencode-ai/sdk`. Stateless design with file-based persistence for resume capability.

## Project Overview

Ralph-driven development is a methodology where an AI agent reads a plan, completes one task, commits, updates the plan, and repeats in a stateless loop. This harness provides a beautiful TUI to monitor progress, with proper state persistence for resume capability.

### Key Features

- Fullscreen TUI with alt screen
- Parse plan.md checkboxes for progress tracking
- ETA calculation based on rolling average of iteration times
- Scrollable event log grouped by iteration
- File-based state persistence (resume after Ctrl+C)
- Lock file to prevent multiple instances

### File Structure

```
opencode-ralph/
├── src/
│   ├── index.ts              # CLI entry + startup flow
│   ├── app.tsx               # Main TUI + render()
│   ├── loop.ts               # Core loop with SDK
│   ├── state.ts              # Type definitions
│   ├── git.ts                # Git helpers
│   ├── plan.ts               # Checkbox parser
│   ├── lock.ts               # Lock file mgmt
│   ├── prompt.ts             # Pre-TUI y/n prompts
│   ├── components/
│   │   ├── header.tsx        # Top bar
│   │   ├── log.tsx           # Scrollable log
│   │   ├── footer.tsx        # Bottom bar
│   │   └── paused.tsx        # Pause overlay
│   └── util/
│       └── time.ts           # Duration formatting
├── package.json
├── tsconfig.json
└── README.md
```

---

## Backlog

### Phase 1: Project Setup

- [x] **1.1** Create `package.json` with the following configuration:
  - name: `opencode-ralph`
  - version: `0.0.1`
  - type: `module`
  - bin: `{ "ralph": "./src/index.ts" }`
  - scripts: `{ "dev": "bun run src/index.ts", "typecheck": "bun x tsc --noEmit" }`
  - dependencies: `@opencode-ai/sdk`, `@opentui/core@0.1.67`, `@opentui/solid@0.1.67`, `solid-js@^1.9.0`, `yargs@^18.0.0`
  - devDependencies: `@types/bun@latest`, `typescript@^5.0.0`

- [x] **1.2** Create `tsconfig.json` with:
  - target: `ESNext`
  - module: `ESNext`
  - moduleResolution: `bundler`
  - jsx: `preserve`
  - jsxImportSource: `solid-js`
  - strict: `true`
  - skipLibCheck: `true`
  - noEmit: `true`
  - types: `["bun-types"]`
  - include: `["src/**/*"]`

- [x] **1.3** Run `bun install` to install all dependencies

- [x] **1.4** Create directory structure: `src/`, `src/components/`, `src/util/`

### Phase 2: Type Definitions

- [x] **2.1** Create `src/state.ts` with `PersistedState` type:

  ```typescript
  export type PersistedState = {
    startTime: number; // When run started (epoch ms)
    initialCommitHash: string; // HEAD at start
    iterationTimes: number[]; // Duration of each completed iteration (ms)
    planFile: string; // Which plan file we're working on
  };
  ```

- [x] **2.2** Add `LoopState` type to `src/state.ts`:

  ```typescript
  export type LoopState = {
    status: "starting" | "running" | "paused" | "complete" | "error";
    iteration: number;
    tasksComplete: number;
    totalTasks: number;
    commits: number;
    events: ToolEvent[];
    error?: string;
  };
  ```

- [x] **2.3** Add `ToolEvent` type to `src/state.ts`:

  ```typescript
  export type ToolEvent = {
    iteration: number;
    type: "tool" | "separator";
    icon?: string;
    text: string;
    timestamp: number;
    duration?: number; // For separators: iteration duration
    commitCount?: number; // For separators: commits this iteration
  };
  ```

- [x] **2.4** Add `STATE_FILE` constant and `loadState()` function to `src/state.ts`:
  - Constant: `export const STATE_FILE = ".ralph-state.json"`
  - Function reads file with `Bun.file()`, returns `PersistedState | null`
  - Return `null` if file doesn't exist

- [x] **2.5** Add `saveState(state: PersistedState)` function to `src/state.ts`:
  - Write state to `STATE_FILE` using `Bun.write()` with `JSON.stringify(state, null, 2)`

- [x] **2.6** Add `LoopOptions` type to `src/state.ts`:
  ```typescript
  export type LoopOptions = {
    planFile: string;
    model: string;
    prompt: string;
  };
  ```

### Phase 3: Utility Functions

- [x] **3.1** Create `src/util/time.ts` with `formatDuration(ms: number): string`:
  - If hours > 0: return `"Xh Ym"`
  - If minutes > 0: return `"Xm Ys"`
  - Else: return `"Xs"`

- [x] **3.2** Add `calculateEta(iterationTimes: number[], remainingTasks: number): number | null` to `src/util/time.ts`:
  - Return `null` if `iterationTimes.length === 0`
  - Calculate average: `sum / length`
  - Return `average * remainingTasks`

- [x] **3.3** Add `formatEta(ms: number | null): string` to `src/util/time.ts`:
  - Return `"--:--"` if `ms === null`
  - Otherwise return `"~" + formatDuration(ms) + " remaining"`

- [x] **3.4** Create `src/git.ts` with `getHeadHash(): Promise<string>`:
  - Spawn `git rev-parse HEAD` using `Bun.spawn()`
  - Read stdout, trim, return hash

- [x] **3.5** Add `getCommitsSince(hash: string): Promise<number>` to `src/git.ts`:
  - Spawn `git rev-list --count ${hash}..HEAD`
  - Parse output as integer, return 0 if NaN

- [x] **3.6** Create `src/plan.ts` with `parsePlan(path: string): Promise<{ done: number; total: number }>`:
  - Read file with `Bun.file(path).text()`
  - Return `{ done: 0, total: 0 }` if file doesn't exist
  - Count `- [x]` (case insensitive) for done
  - Count `- [ ]` for not done
  - Return `{ done, total: done + notDone }`

- [x] **3.7** Create `src/lock.ts` with `LOCK_FILE` constant (`.ralph-lock`)

- [x] **3.8** Add `acquireLock(): Promise<boolean>` to `src/lock.ts`:
  - Check if lock file exists with `Bun.file(LOCK_FILE).exists()`
  - If exists, read PID from file
  - Check if process running with `process.kill(pid, 0)` in try/catch
  - If process exists, return `false`
  - If stale (process doesn't exist), continue
  - Write current PID to lock file
  - Return `true`

- [x] **3.9** Add `releaseLock(): Promise<void>` to `src/lock.ts`:
  - Check if lock file exists
  - If exists, delete with `Bun.file(LOCK_FILE).delete()`

- [x] **3.10** Create `src/prompt.ts` with `confirm(message: string): Promise<boolean>`:
  - Print message + `(y/n)` to stdout
  - Read single character from stdin
  - Return `true` if 'y' or 'Y', `false` otherwise
  - Use raw mode for single character input

### Phase 4: TUI Components - Colors and Constants

- [x] **4.1** Create `src/components/colors.ts` with Tokyo Night color palette:

  ```typescript
  export const colors = {
    bg: "#1a1b26",
    bgDark: "#16161e",
    bgHighlight: "#292e42",
    bgPanel: "#1f2335",
    fg: "#c0caf5",
    fgDark: "#565f89",
    fgMuted: "#9aa5ce",
    green: "#9ece6a",
    red: "#f7768e",
    yellow: "#e0af68",
    blue: "#7aa2f7",
    purple: "#bb9af7",
    cyan: "#7dcfff",
    border: "#414868",
  };
  ```

- [x] **4.2** Add `TOOL_ICONS` constant to `src/components/colors.ts`:
  ```typescript
  export const TOOL_ICONS: Record<string, string> = {
    read: "→",
    write: "←",
    edit: "←",
    glob: "✱",
    grep: "✱",
    bash: "$",
    task: "◉",
    webfetch: "%",
    websearch: "◈",
    codesearch: "◇",
    todowrite: "☐",
    todoread: "☐",
  };
  ```

### Phase 5: TUI Components - Header

- [x] **5.1** Create `src/components/header.tsx` with basic structure:
  - Import `solid-js` and colors
  - Export `Header` component that takes props: `status`, `iteration`, `tasksComplete`, `totalTasks`, `eta`
  - Return a `<box>` with `flexDirection="row"` and bottom border

- [x] **5.2** Add status indicator to Header:
  - `■` with green color for "running"
  - `⏸` with yellow color for "paused"
  - `✓` with green color for "complete"
  - `✗` with red color for "error"
  - `◌` with muted color for "starting"

- [x] **5.3** Add iteration display to Header:
  - Text: `iteration {iteration}`
  - Separated by `│` with muted color

- [x] **5.4** Add task progress to Header:
  - Text: `{tasksComplete}/{totalTasks} tasks`
  - Separated by `│` with muted color

- [x] **5.5** Add ETA display to Header:
  - Use `formatEta()` from time utils
  - Separated by `│` with muted color

### Phase 6: TUI Components - Footer

- [x] **6.1** Create `src/components/footer.tsx` with basic structure:
  - Import `solid-js` and colors
  - Export `Footer` component that takes props: `commits`, `elapsed`, `paused`
  - Return a `<box>` with `flexDirection="row"` and top border

- [x] **6.2** Add keybind hints to Footer (left side):
  - Text: `p pause · q quit · ↑↓ scroll`
  - Use muted color for separators, normal for keys

- [x] **6.3** Add spacer `<box flexGrow={1} />` between left and right

- [x] **6.4** Add stats to Footer (right side):
  - Text: `{commits} commits · {formatDuration(elapsed)}`
  - Use muted color

### Phase 7: TUI Components - Log

- [x] **7.1** Create `src/components/log.tsx` with basic scrollbox structure:
  - Import `solid-js`, `For`, colors
  - Export `Log` component that takes props: `events: ToolEvent[]`
  - Return a `<scrollbox>` with `stickyScroll={true}` and `stickyStart="bottom"`
  - Set `flexGrow={1}` to fill available space

- [x] **7.2** Add scrollbox styling to Log:
  - `rootOptions`: backgroundColor from colors.bg
  - `viewportOptions`: backgroundColor from colors.bgDark
  - Set vertical scrollbar visible with border color

- [x] **7.3** Add `<For each={events}>` inside scrollbox:
  - Render each event based on `event.type`

- [x] **7.4** Add separator rendering in Log:
  - When `event.type === "separator"`
  - Format: `── iteration {n} ──────────── {duration} · {commits} commit(s) ──`
  - Use `─` characters to create line effect
  - Show "running" instead of duration if iteration in progress
  - Use muted color for lines, normal for text

- [x] **7.5** Add tool event rendering in Log:
  - When `event.type === "tool"`
  - Format: `{icon} {text}`
  - Use icon from `TOOL_ICONS` or default to `⚙`
  - Use appropriate color based on tool type (blue for read, green for write/edit, etc.)

### Phase 8: TUI Components - Paused Overlay

- [x] **8.1** Create `src/components/paused.tsx`:
  - Import `solid-js`, `Show`, colors
  - Export `PausedOverlay` component that takes props: `visible: boolean`

- [x] **8.2** Add overlay box structure:
  - Use `<Show when={visible}>` to conditionally render
  - Outer box: `position="absolute"`, full width/height, centered content
  - Use semi-transparent background effect (bgHighlight color)

- [x] **8.3** Add overlay content:
  - Inner box with padding, border, bgPanel background
  - Large `⏸ PAUSED` text in yellow
  - Smaller `press p to resume` hint in muted color

### Phase 9: Main App Component

- [x] **9.1** Create `src/app.tsx` with imports:
  - Import `render`, `useKeyboard` from `@opentui/solid`
  - Import `createSignal`, `onCleanup` from `solid-js`
  - Import all components (Header, Log, Footer, PausedOverlay)
  - Import types and colors

- [x] **9.2** Define `AppProps` type:

  ```typescript
  type AppProps = {
    options: LoopOptions;
    persistedState: PersistedState;
    onQuit: () => void;
  };
  ```

- [x] **9.3** Create `App` component with state signals:
  - `[state, setState]` for `LoopState`
  - Initialize with: status "starting", iteration from persisted iterationTimes.length, events empty array
  - Calculate elapsed from `Date.now() - persistedState.startTime`

- [x] **9.4** Add keyboard handling to App:
  - Use `useKeyboard()` hook
  - `p` key: toggle pause (create/delete `.ralph-pause` file)
  - `q` key: call `onQuit()`
  - `Ctrl+C`: call `onQuit()`

- [x] **9.5** Compose App layout:
  - Outer `<box>` with `flexDirection="column"`, full height, bgDark background
  - `<Header>` with state props
  - `<Log>` with events prop, `flexGrow={1}`
  - `<Footer>` with commits, elapsed props
  - `<PausedOverlay>` with visible when status is "paused"

- [x] **9.6** Create `startApp` export function:
  - Takes `AppProps`
  - Returns promise that resolves when app exits
  - Calls `render()` with App component and opentui options:
    - `targetFps: 30`
    - `exitOnCtrlC: false`

### Phase 10: Loop Logic

- [x] **10.1** Create `src/loop.ts` with imports:
  - Import `createOpencodeServer`, `createOpencodeClient` from `@opencode-ai/sdk`
  - Import types from state.ts
  - Import git and plan utilities

- [x] **10.2** Define `LoopCallbacks` type:

  ```typescript
  type LoopCallbacks = {
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
  ```

- [x] **10.3** Define `DEFAULT_PROMPT` constant:

  ```typescript
  const DEFAULT_PROMPT = `READ all of {plan}. Pick ONE task. If needed, verify via web/code search. Complete task. Commit change (update the plan.md in the same commit). ONLY do one task unless GLARINGLY OBVIOUS steps should run together. Update {plan}. If you learn a critical operational detail, update AGENTS.md. When ALL tasks complete, create .ralph-done and exit. NEVER GIT PUSH. ONLY COMMIT.`;
  ```

- [x] **10.4** Create `buildPrompt(options: LoopOptions): string` function:
  - Take the prompt template (options.prompt or DEFAULT_PROMPT)
  - Replace `{plan}` with `options.planFile`
  - Return final prompt string

- [x] **10.5** Create `parseModel(model: string): { providerID: string; modelID: string }` function:
  - Split model string by `/`
  - Return provider and model parts
  - Handle `opencode/` prefix specially if needed

- [x] **10.6** Create main `runLoop` function signature:

  ```typescript
  export async function runLoop(
    options: LoopOptions,
    persistedState: PersistedState,
    callbacks: LoopCallbacks,
    signal: AbortSignal,
  ): Promise<void>;
  ```

- [x] **10.7** Implement server startup in `runLoop`:
  - Call `createOpencodeServer()` to start opencode backend
  - Create client with `createOpencodeClient({ baseUrl: server.url })`
  - Store server reference for cleanup

- [x] **10.8** Implement main loop structure in `runLoop`:
  - Initialize iteration counter from `persistedState.iterationTimes.length`
  - Enter `while (!signal.aborted)` loop
  - Check for `.ralph-done` file at start of each iteration
  - Check for `.ralph-pause` file, call callbacks and sleep if exists

- [x] **10.9** Implement `.ralph-done` check:
  - Use `Bun.file(".ralph-done").exists()`
  - If exists, delete file, call `callbacks.onComplete()`, break loop

- [x] **10.10** Implement `.ralph-pause` check:
  - Use `Bun.file(".ralph-pause").exists()`
  - If exists, call `callbacks.onPause()`, sleep 1000ms, continue loop
  - Track pause state to call `callbacks.onResume()` when unpaused

- [x] **10.11** Implement iteration start:
  - Increment iteration counter
  - Record iteration start time
  - Call `callbacks.onIterationStart(iteration)`
  - Add separator event for new iteration

- [x] **10.12** Implement plan parsing in loop:
  - Call `parsePlan(options.planFile)`
  - Call `callbacks.onTasksUpdated(done, total)`

- [x] **10.13** Implement session creation:
  - Call `client.session.create()`
  - Extract session ID from response

- [x] **10.14** Implement prompt sending:
  - Build prompt with `buildPrompt(options)`
  - Parse model with `parseModel(options.model)`
  - Call `client.session.prompt()` with session ID, parts, model

- [ ] **10.15** Implement event streaming:
  - Call `client.event.subscribe()`
  - Iterate over `events.stream` with `for await`
  - Filter events for current session ID

- [ ] **10.16** Implement tool event mapping:
  - Check for `message.part.updated` events
  - Extract tool name and state from part
  - Map to `ToolEvent` with appropriate icon
  - Call `callbacks.onEvent(event)`

- [ ] **10.17** Implement session completion detection:
  - Check for `session.idle` event with matching session ID
  - Break out of event loop when detected

- [ ] **10.18** Implement session error handling:
  - Check for `session.error` event
  - Extract error message
  - Call `callbacks.onError(message)`
  - Close server and throw error

- [ ] **10.19** Implement iteration completion:
  - Calculate iteration duration
  - Get commit count with `getCommitsSince(persistedState.initialCommitHash)`
  - Calculate commits this iteration (current - previous)
  - Call `callbacks.onIterationComplete(iteration, duration, commitsThisIteration)`
  - Call `callbacks.onCommitsUpdated(totalCommits)`

- [ ] **10.20** Implement cleanup in `runLoop`:
  - Close server on completion, error, or abort
  - Use try/finally pattern

### Phase 11: CLI Entry Point

- [ ] **11.1** Create `src/index.ts` with yargs setup:
  - Import yargs
  - Define options: `--plan`, `--model`, `--prompt`, `--reset`
  - Set defaults: plan="plan.md", model="opencode/claude-opus-4-5"

- [ ] **11.2** Add lock acquisition at startup:
  - Call `acquireLock()`
  - If returns false, print error "Another ralph instance is running" and exit(1)

- [ ] **11.3** Add state loading logic:
  - Call `loadState()`
  - If state exists and `--reset` not passed, check plan file

- [ ] **11.4** Add resume confirmation prompts:
  - If state exists with same plan: `confirm("Continue previous run?")`
  - If state exists with different plan: `confirm("Reset state for new plan?")`
  - Handle user response appropriately

- [ ] **11.5** Add fresh start state creation:
  - If no state or user chose to reset
  - Get HEAD hash with `getHeadHash()`
  - Create new `PersistedState` with current time, hash, empty iterationTimes, planFile

- [ ] **11.6** Add TUI launch:
  - Create abort controller for cancellation
  - Call `startApp()` with options, state, and quit handler
  - Start `runLoop()` in parallel with callbacks wired to app state

- [ ] **11.7** Wire up loop callbacks to app state updates:
  - `onIterationStart`: update state.iteration, add separator event
  - `onEvent`: append to state.events
  - `onIterationComplete`: update separator with duration/commits, save state
  - `onTasksUpdated`: update state.tasksComplete, state.totalTasks
  - `onCommitsUpdated`: update state.commits
  - `onPause`/`onResume`: update state.status
  - `onComplete`: update state.status to "complete"
  - `onError`: update state.status to "error", set state.error

- [ ] **11.8** Add cleanup on exit:
  - Call `releaseLock()` in finally block
  - Handle SIGINT/SIGTERM signals

- [ ] **11.9** Add error handling wrapper:
  - Wrap main logic in try/catch
  - On error: release lock, print error, exit(1)

### Phase 12: Integration and Testing

- [ ] **12.1** Create minimal test plan file for manual testing:
  - Create `test-plan.md` with a few checkbox items
  - Test parsing with `parsePlan()`

- [ ] **12.2** Test lock file functionality:
  - Run `ralph`, verify `.ralph-lock` created
  - Try running second instance, verify error message
  - Kill first instance, verify lock released

- [ ] **12.3** Test state persistence:
  - Run `ralph`, let it complete one iteration
  - Kill with Ctrl+C
  - Run again, verify resume prompt appears
  - Verify iteration count and elapsed time restored

- [ ] **12.4** Test pause functionality:
  - Run `ralph`
  - Press `p`, verify PAUSED overlay appears
  - Verify `.ralph-pause` file created
  - Press `p` again, verify resume
  - Verify `.ralph-pause` file deleted

- [ ] **12.5** Test completion flow:
  - Create small plan with 1-2 tasks
  - Run until agent creates `.ralph-done`
  - Verify clean exit with completion message

### Phase 13: Documentation

- [ ] **13.1** Create `README.md` with project overview:
  - Title and description
  - What is Ralph-driven development
  - Link to original blog post

- [ ] **13.2** Add installation section to README:
  - Clone instructions
  - `bun install` command
  - Optional: global install with `bun link`

- [ ] **13.3** Add usage section to README:
  - Basic usage: `ralph`
  - With options: `ralph --plan BACKLOG.md --model anthropic/claude-opus-4`
  - All CLI options table

- [ ] **13.4** Add files documentation to README:
  - `.ralph-state.json` - Persisted state for resume
  - `.ralph-lock` - Lock file to prevent multiple instances
  - `.ralph-done` - Created by agent when plan complete
  - `.ralph-pause` - Created by user to pause loop

- [ ] **13.5** Add keybindings table to README:
  - `p` - Toggle pause
  - `q` - Quit
  - `↑/k` - Scroll up
  - `↓/j` - Scroll down
  - `g` - Scroll to top
  - `G` - Scroll to bottom

- [ ] **13.6** Add tips section to README:
  - Planning tips (spend time on plan before running)
  - AGENTS.md usage
  - Monitoring with GitHub Desktop

---

## Reference: Default Loop Prompt

```
READ all of {plan}. Pick ONE task. If needed, verify via web/code search. Complete task. Commit change (update the plan.md in the same commit). ONLY do one task unless GLARINGLY OBVIOUS steps should run together. Update {plan}. If you learn a critical operational detail, update AGENTS.md. When ALL tasks complete, create .ralph-done and exit. NEVER GIT PUSH. ONLY COMMIT.
```

## Reference: Tokyo Night Colors

```typescript
const colors = {
  bg: "#1a1b26",
  bgDark: "#16161e",
  bgHighlight: "#292e42",
  bgPanel: "#1f2335",
  fg: "#c0caf5",
  fgDark: "#565f89",
  fgMuted: "#9aa5ce",
  green: "#9ece6a",
  red: "#f7768e",
  yellow: "#e0af68",
  blue: "#7aa2f7",
  purple: "#bb9af7",
  cyan: "#7dcfff",
  border: "#414868",
};
```

## Reference: Tool Icons

```typescript
const TOOL_ICONS: Record<string, string> = {
  read: "→",
  write: "←",
  edit: "←",
  glob: "✱",
  grep: "✱",
  bash: "$",
  task: "◉",
  webfetch: "%",
  websearch: "◈",
  codesearch: "◇",
  todowrite: "☐",
  todoread: "☐",
};
```

## Reference: TUI Layout

```
┌─────────────────────────────────────────────────────────────────────────┐
│  ■ running │ iteration 3 │ 12/47 tasks │ ~35 min remaining              │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                          │
│  ── iteration 1 ──────────────────────────────────── 01:12 · 1 commit ──│
│  → Read plan.md                                                          │
│  ✱ Grep "TODO" in src/ (3 matches)                                      │
│  ← Edit src/main.ts                                                      │
│  $ git commit -m "feat: implement feature X"                            │
│  ← Edit plan.md                                                          │
│                                                                          │
│  ── iteration 2 ──────────────────────────────────── 01:45 · 1 commit ──│
│  → Read plan.md                                                          │
│  ...                                                                     │
│                                                                          │
├─────────────────────────────────────────────────────────────────────────┤
│  p pause · q quit · ↑↓ scroll                   3 commits · 00:04:32    │
└─────────────────────────────────────────────────────────────────────────┘
```
