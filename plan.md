# Feature Consolidation Backlog

## Phase 1: Core UX Improvements

### 1.1 Steering Mode (`:` key)

#### Session Lifecycle Callbacks
- [x] Add `SessionInfo` type to `src/state.ts` with `sessionId`, `serverUrl`, `attached`, `sendMessage` fields
- [x] Add `onSessionCreated` callback type to `LoopCallbacks` in `src/loop.ts`
- [x] Add `onSessionEnded` callback type to `LoopCallbacks` in `src/loop.ts`
- [x] Add `sessionId` field to `LoopState` in `src/state.ts`
- [x] Add `serverUrl` field to `LoopState` in `src/state.ts`
- [x] Add `attached` field to `LoopState` in `src/state.ts`

#### Session Message Sending
- [x] Implement `sendMessage` function in `src/loop.ts` using `client.session.prompt()`
- [x] Add guard in `sendMessage` to check for active session before sending
- [x] Call `onSessionCreated` callback after session creation in `runLoop`
- [x] Call `onSessionEnded` callback when session ends in `runLoop`
- [x] Clear session fields in `LoopState` when `onSessionEnded` fires

#### Steering UI State
- [x] Add `commandMode` signal to `src/app.tsx`
- [x] Add `commandInput` signal to `src/app.tsx`
- [x] Create `isInputFocused()` helper function to check dialog/input state

#### Steering Keyboard Handler
- [x] Add `:` key detection logic (handle colon, semicolon+shift, raw `:`)
- [x] Add keyboard handler for `:` that opens steering mode
- [x] Guard `:` handler to respect `isInputFocused()` state
- [x] Guard `:` handler to check for active session

#### Steering Overlay Component
- [x] Create `src/components/steering.tsx` file
- [x] Add modal overlay with dark background
- [x] Add purple-bordered input box
- [x] Add placeholder text: "Type message and press Enter"
- [x] Add ESC key handler to close overlay
- [x] Add Enter key handler to send message

#### Steering Submit Logic
- [x] Implement `sendSteeringMessage()` function in `src/app.tsx`
- [x] Trim input and validate non-empty before sending
- [x] Call `sendMessage()` with trimmed input
- [x] Close overlay and clear input after successful send
- [x] Show error feedback if no active session

#### Steering Footer Hint
- [x] Update `src/components/footer.tsx` to show `: steer` hint
- [x] Only show hint when session is active

### 1.2 Custom Prompt File Support

#### CLI Option
- [x] Add `--prompt-file` option to yargs in `src/index.ts`
- [x] Set default value to `.ralph-prompt.md`
- [x] Add description: "Path to prompt file"

#### State and Config
- [x] Add `promptFile` field to `LoopOptions` in `src/state.ts`
- [x] Add `promptFile` field to `RalphConfig` type in `src/index.ts`
- [x] Read `promptFile` from global config in `src/index.ts`

#### Prompt Building Logic
- [x] Create `buildPrompt()` function in `src/loop.ts`
- [x] Implement precedence: `--prompt` > `--prompt-file` > DEFAULT_PROMPT
- [x] Read prompt file using `Bun.file()` when `promptFile` specified
- [x] Check file existence with `file.exists()` before reading
- [x] Replace `{plan}` placeholder with `options.planFile`
- [x] Replace `{{PLAN_FILE}}` placeholder with `options.planFile`
- [x] Return DEFAULT_PROMPT as fallback

#### Example Template
- [x] Create `.ralph-prompt.md.example` template file
- [x] Add example content with `{{PLAN_FILE}}` placeholder

#### Tests
- [x] Add test for `--prompt` string taking precedence
- [x] Add test for `--prompt-file` being read correctly
- [x] Add test for placeholder replacement in prompt file
- [x] Add test for fallback to DEFAULT_PROMPT when file missing

### 1.3 Error Retry with Exponential Backoff

#### Backoff Calculation
- [x] Create `calculateBackoffMs()` function in `src/loop.ts`
- [x] Set base delay to 5000ms (5 seconds)
- [x] Implement exponential growth: `base * 2^(attempt-1)`
- [x] Cap maximum delay at 300000ms (5 minutes)
- [x] Add 10% jitter to prevent synchronized retries

#### Error Tracking
- [x] Add `errorCount` variable in `runLoop` (local, not persisted)
- [x] Increment `errorCount` on each caught error
- [x] Reset `errorCount` to 0 on successful iteration

#### Error Handling Refactor
- [x] Wrap iteration body in try/catch in `runLoop`
- [x] Call `callbacks.onError` when error caught
- [x] Log error with `log("loop", "Error in iteration", { error })`
- [x] Continue loop instead of rethrowing (unless abort signal set)

#### Backoff Application
- [x] Check `errorCount > 0` before iteration starts
- [x] Calculate backoff with `calculateBackoffMs(errorCount)`
- [x] Log backoff delay with `log("loop", "Error backoff", { errorCount, backoffMs })`
- [x] Apply delay with `await Bun.sleep(backoffMs)`

#### Error Display in TUI
- [x] Add `errorBackoffMs` field to `LoopState` in `src/state.ts`
- [x] Add `errorRetryAt` field to `LoopState` (timestamp for countdown)
- [x] Update TUI to show retry countdown when backoff active
- [x] Format countdown as "Retrying in Xs..." in log component

### 1.4 Agent Selection (`-a` flag)

#### CLI Option
- [x] Add `--agent` option to yargs in `src/index.ts`
- [x] Add `-a` alias for `--agent`
- [x] Add description: "Agent to use (e.g., 'code', 'plan', 'build')"

#### State and Config
- [x] Add `agent` field to `LoopOptions` in `src/state.ts`
- [x] Add `agent` field to `RalphConfig` type
- [x] Read `agent` from global config in `src/index.ts`

#### API Integration
- [x] Pass `agent` to `client.session.prompt()` body in `src/loop.ts`
- [x] Only include `agent` field when options.agent is defined

---

## Phase 2: Power User Features

### 2.3 Dialog System (Required by 2.1, 2.2)

#### Context Provider
- [x] Create `src/context/DialogContext.tsx` file
- [x] Define `DialogComponent` type
- [x] Define `DialogContextValue` interface with `show`, `replace`, `clear`, `pop`, `stack`, `hasDialogs`
- [x] Create `DialogContext` using `createContext()`
- [x] Create `DialogProvider` component with stack signal
- [x] Implement `show()` to push dialog onto stack
- [x] Implement `replace()` to swap top dialog
- [x] Implement `clear()` to empty stack
- [x] Implement `pop()` to remove top dialog
- [x] Create `useDialog()` hook for consuming context

#### Base Dialog Component
- [x] Create `src/ui/Dialog.tsx` file
- [x] Add dark overlay background (semi-transparent)
- [x] Add centered content box with border
- [x] Add border styling (default color)
- [x] Add Escape key handler to call `pop()`

#### Confirmation Dialog
- [x] Create `src/ui/DialogConfirm.tsx` file
- [x] Add `title` and `message` props
- [x] Add Confirm/Cancel buttons
- [x] Add Y key shortcut for confirm
- [x] Add N key shortcut for cancel
- [x] Call `onConfirm` or `onCancel` callback accordingly

#### Prompt Dialog
- [x] Create `src/ui/DialogPrompt.tsx` file
- [x] Add text input field
- [x] Add placeholder text prop
- [x] Add Submit/Cancel buttons
- [x] Add Enter key to submit
- [x] Add Escape key to cancel
- [x] Call `onSubmit(value)` or `onCancel` callback

#### Alert Dialog
- [x] Create `src/ui/DialogAlert.tsx` file
- [x] Add message display area
- [x] Add Dismiss button
- [x] Add Enter/Escape to dismiss
- [x] Call `onDismiss` callback

#### Dialog Stack Renderer
- [x] Create `DialogStack` component in `src/context/DialogContext.tsx`
- [x] Render all dialogs in stack with proper z-indexing
- [x] Only render when `hasDialogs()` is true

#### Input Focus Management
- [x] Create `inputFocused` signal in DialogContext
- [x] Set `inputFocused(true)` when any dialog opens
- [x] Set `inputFocused(false)` when all dialogs close
- [x] Export `isInputFocused()` accessor

#### App Integration
- [x] Wrap App content with `DialogProvider` in `src/app.tsx`
- [x] Add `<DialogStack />` after main content

### 2.1 Command Palette (Ctrl+P)

#### Dependencies
- [x] Install `fuzzysort` package: `bun add fuzzysort`

#### Context Provider
- [x] Create `src/context/CommandContext.tsx` file
- [x] Define `CommandOption` interface with `title`, `value`, `description`, `category`, `keybind`, `disabled`, `onSelect`
- [x] Define `CommandContextValue` interface with `register`, `show`, `trigger`, `suspended`, `keybinds`
- [x] Create `CommandContext` using `createContext()`
- [x] Create `CommandProvider` component
- [x] Implement `register()` to store command factory functions
- [x] Implement `show()` to open command palette dialog
- [x] Implement `trigger(value)` to execute command by value
- [x] Implement `keybinds(enabled)` to toggle global keybinds
- [x] Create `useCommand()` hook for consuming context

#### Fuzzy Search Dialog
- [x] Create `src/ui/DialogSelect.tsx` file
- [x] Add search input at top
- [x] Add results list below input
- [x] Integrate fuzzysort for filtering
- [x] Highlight matched characters in results
- [x] Show keybind hint for each option
- [x] Show description text if present

#### Keyboard Navigation
- [x] Add ↑/↓ arrow key handlers for selection
- [x] Add Enter key to execute selected command
- [x] Add Escape key to close palette
- [x] Auto-focus search input on open
- [x] Scroll selected item into view

#### Default Commands
- [x] Create `src/lib/keymap.ts` file with centralized keybind definitions
- [x] Define `copyAttach` keybind in keymap
- [x] Define `terminalConfig` keybind in keymap
- [x] Define `toggleTasks` keybind in keymap
- [x] Define `togglePause` keybind in keymap
- [x] Register "Copy attach command" action
- [x] Register "Choose default terminal" action
- [x] Register "Toggle tasks panel" action
- [x] Register "Pause/Resume" action

#### Ctrl+P Handler
- [x] Add Ctrl+P keyboard handler in `src/app.tsx`
- [x] Check `isInputFocused()` before opening palette
- [x] Call `command.show()` to open palette

#### App Integration
- [x] Wrap App with `CommandProvider` in `src/app.tsx`
- [x] Initialize default commands on mount

### 2.2 Terminal Launcher (T key)

#### Terminal Definitions
- [x] Create `src/lib/terminal-launcher.ts` file
- [x] Define `KnownTerminal` interface with `name`, `command`, `args`
- [x] Add alacritty terminal definition
- [x] Add kitty terminal definition
- [x] Add wezterm terminal definition
- [x] Add gnome-terminal definition
- [x] Add konsole terminal definition
- [x] Add xfce4-terminal definition
- [x] Add foot terminal definition
- [x] Add tilix terminal definition
- [x] Add terminator terminal definition
- [x] Add xterm terminal definition
- [x] Add urxvt terminal definition
- [x] Add x-terminal-emulator definition

#### Platform-Specific Terminals
- [x] Add macOS Terminal.app definition
- [x] Add macOS iTerm2 definition
- [x] Add Windows Terminal definition
- [x] Add Windows cmd.exe definition

#### Terminal Detection
- [x] Implement `detectInstalledTerminals()` function
- [x] Use `which` command to check terminal availability
- [x] Filter terminals by platform (darwin/linux/win32)
- [x] Return array of installed terminals
- [x] Cache detection result

#### Terminal Launch
- [x] Implement `launchTerminal()` function
- [x] Build args array with `{cmd}` placeholder replacement
- [x] Split command string into args array
- [x] Use `Bun.spawn()` with detached option
- [x] Call `unref()` on spawned process
- [x] Return success/error result

#### Attach Command
- [x] Implement `getAttachCommand()` function
- [x] Format: `opencode attach ${url} --session ${sessionId}`
- [x] Handle missing sessionId gracefully

#### Config Persistence
- [x] Create `src/lib/config.ts` file
- [x] Define config file path: `~/.config/ralph/config.json`
- [x] Implement `loadConfig()` to read JSON file
- [x] Implement `saveConfig()` to write JSON file
- [x] Add `preferredTerminal` field to config
- [x] Add `customTerminalCommand` field to config

#### Terminal Config Dialog
- [x] Create terminal selection dialog component
- [x] List detected terminals as options
- [x] Add "Custom command..." option
- [x] Add "Copy to clipboard" option
- [x] Save selection to config on confirm

#### T Key Handler
- [x] Add T key handler in `src/app.tsx`
- [x] Check for active session before launching
- [x] Check for configured terminal preference
- [x] If configured: launch terminal directly
- [x] If not configured: show config dialog
- [x] Use external server URL when attached mode

### 2.4 Debug/Sandbox Mode (`-d` flag)

#### CLI Flag
- [x] Add `--debug` / `-d` flag to yargs in `src/index.ts`
- [x] Add description: "Debug mode - manual session creation"

#### State Changes
- [x] Add `debug` optional field to `LoopOptions` in `src/state.ts`
- [x] Pass debug flag from CLI to LoopOptions

#### Debug Mode Behavior
- [x] Skip plan file validation when debug mode enabled
- [x] Skip automatic loop start in debug mode
- [x] Set initial state to idle in debug mode

#### Debug Key Handlers
- [x] Add N key handler for "new session" in debug mode
- [x] Add P key handler for "prompt input" in debug mode
- [x] Add Q key handler for quit (shared with normal mode)

#### Debug Session Creation
- [x] Implement `createDebugSession()` function
- [x] Call `client.session.create({})` to create session
- [x] Store session ID in state
- [x] Log session creation event

#### Debug Prompt Dialog
- [x] Use DialogPrompt for manual prompt input
- [x] Send prompt via `client.session.prompt()`
- [x] Log prompt send event

#### Debug Mode Indicator
- [x] Add debug mode indicator in header component
- [x] Show "[DEBUG]" badge when debug mode active
- [x] Style with distinct color (yellow/orange)

### 2.5 Tasks Panel

#### Task Parser
- [x] Create `Task` type in `src/plan.ts` with `id`, `line`, `text`, `done` fields
- [x] Create `parsePlanTasks()` function (separate from `parsePlan()`)
- [x] Read file content line by line
- [x] Match checkbox pattern: `/^(\s*)-\s*\[([ xX])\]\s*(.+)$/`
- [x] Extract line number, done status, and text
- [x] Generate unique ID from line number
- [x] Return array of Task objects

#### Tasks Component
- [x] Create `src/components/tasks.tsx` file
- [x] Add `tasks` prop for Task array
- [x] Add `onClose` callback prop
- [x] Render scrollable list container
- [x] Render checkbox indicator: `[✓]` or `[ ]`
- [x] Render task text next to checkbox
- [x] Gray out completed tasks
- [x] Add ESC key handler to close (handled via onClose callback from parent)

#### Tasks State
- [x] Add `showTasks` signal to `src/app.tsx`
- [x] Add `tasks` signal to store parsed tasks
- [x] Initialize tasks by parsing plan file on mount

#### Task Refresh
- [x] Create `refreshTasks()` function
- [x] Call `parsePlanTasks()` with plan file path
- [x] Update `tasks` signal with result
- [x] Add polling interval (every 2 seconds)
- [x] Clear interval on unmount

#### Tasks Key Handler
- [x] Check for key conflict with Terminal Launcher (both use T)
- [x] Choose alternative key if conflict (e.g., Shift+T or use command palette)
- [x] Add key handler to toggle `showTasks` signal
- [x] Update footer to show tasks keybind hint

#### Tasks Overlay
- [x] Render TasksPanel when `showTasks()` is true
- [x] Position as right-side overlay
- [x] Add border and title "Tasks"
- [x] Pass tasks and onClose props

---

## Phase 3: Polish & Integration

### 3.1 Theme System

#### Theme Files
- [x] Create `src/lib/themes/` directory
- [x] Copy `aura.json` theme file
- [x] Copy `ayu.json` theme file
- [x] Copy `catppuccin-frappe.json` theme file
- [x] Copy `catppuccin-latte.json` theme file
- [x] Copy `catppuccin-mocha.json` theme file
- [x] Copy `cobalt2.json` theme file
- [x] Copy `cursor.json` theme file
- [x] Copy `dracula.json` theme file
- [x] Copy `everforest.json` theme file
- [x] Copy `flexoki.json` theme file
- [x] Copy `github.json` theme file
- [x] Copy `gruvbox.json` theme file
- [x] Copy `kanagawa.json` theme file
- [x] Copy `lucent-orng.json` theme file
- [x] Copy `material.json` theme file
- [x] Copy `matrix.json` theme file
- [x] Copy `mercury.json` theme file
- [x] Copy `monokai.json` theme file
- [x] Copy `nightowl.json` theme file
- [x] Copy `nord.json` theme file
- [x] Copy `one-dark.json` theme file
- [x] Copy `opencode.json` theme file
- [x] Copy `orng.json` theme file
- [x] Copy `osaka-jade.json` theme file
- [x] Copy `palenight.json` theme file
- [x] Copy `rosepine.json` theme file
- [x] Copy `solarized.json` theme file
- [x] Copy `synthwave84.json` theme file
- [x] Copy `tokyonight.json` theme file
- [x] Copy `vercel.json` theme file
- [x] Copy `vesper.json` theme file
- [x] Copy `zenburn.json` theme file

#### Theme Index
- [x] Create `src/lib/themes/index.ts` file
- [x] Import all theme JSON files
- [x] Export `themes` map keyed by theme name
- [x] Export `themeNames` array for listing

#### Theme Resolver
- [x] Create `src/lib/theme-resolver.ts` file
- [x] Define `Theme` interface with color fields
- [x] Implement `resolveTheme()` to parse theme JSON
- [x] Handle variable references in theme colors
- [x] Support dark/light mode variants

#### Theme Context
- [x] Create `src/context/ThemeContext.tsx` file
- [x] Create `ThemeContext` using `createContext()`
- [x] Create `ThemeProvider` component
- [x] Read OpenCode state from `~/.local/state/opencode/kv.json`
- [x] Parse theme preference from OpenCode state
- [x] Create `theme()` accessor for current theme
- [x] Default to "opencode" theme
- [x] Create `useTheme()` hook

#### Component Updates
- [x] Update `src/components/header.tsx` to use theme colors
- [x] Update `src/components/footer.tsx` to use theme colors
- [x] Update `src/components/log.tsx` to use theme colors
- [x] Update dialog components to use theme colors
- [x] Update steering overlay to use theme colors

#### Colors Migration
- [x] Preserve existing `colors.ts` values as fallback
- [x] Create theme-based color accessor functions
- [x] Migrate components from direct colors import to theme accessor
- [x] Remove direct color imports after migration complete

### 3.2 Token Tracking

#### Session Stats Hook
- [x] Create `src/hooks/useSessionStats.ts` file
- [x] Define `SessionTokens` interface with `input`, `output`, `reasoning`, `cacheRead`, `cacheWrite`
- [x] Create `createSessionStats()` function
- [x] Create signals for each token counter
- [x] Create `reset()` function to zero all counters
- [x] Create `addTokens()` function to increment counters

#### SSE Event Integration
- [x] Identify token event name in current SDK (e.g., `step.finish`)
      <!-- Token event is `step-finish` part type in `message.part.updated` events.
           Structure: StepFinishPart.tokens = { input, output, reasoning, cache: { read, write } } -->
- [x] Hook into SSE event handler in loop
- [x] Extract token counts from event payload
- [x] Call `addTokens()` with extracted values
      <!-- Added onTokens callback to LoopCallbacks and handler for step-finish parts in SSE loop.
           Callback maps StepFinishPart.tokens to TokenUsage type and fires onTokens callback. -->

#### Token Display
- [x] Add token display to footer component
- [x] Format: "Tokens: 1.2K in / 500 out / 200 reasoning"
- [x] Use `formatNumber()` helper for compact display
- [x] Only show when tokens > 0

#### Session Reset
- [x] Call `reset()` on session start
- [x] Clear display when no active session

### 3.3 Toast Notifications

#### Toast Context
- [x] Create `src/context/ToastContext.tsx` file
- [x] Define `ToastOptions` interface with `variant`, `message`, `duration`
- [x] Define `Toast` type extending options with `id`
- [x] Define `ToastContextValue` interface with `show()`
- [x] Create `ToastContext` using `createContext()`
- [x] Create `ToastProvider` component with toasts array signal
- [x] Implement `show()` to add toast with auto-generated ID
- [x] Implement auto-dismiss with setTimeout based on duration
- [x] Create `useToast()` hook

#### Toast Display Component
- [x] Create `src/components/toast.tsx` file
- [x] Position container at bottom of screen
- [x] Render each toast as inline box
- [x] Style success variant with green color
- [x] Style error variant with red color
- [x] Style info variant with blue color
- [x] Add dismiss animation (fade out)

#### Toast Stack Rendering
- [x] Create `ToastStack` component
- [x] Render toasts in order (newest at bottom)
- [x] Handle multiple toasts queued
- [x] Limit max visible toasts to 3

#### App Integration
- [x] Wrap App with `ToastProvider` in `src/app.tsx`
- [x] Add `<ToastStack />` after main content

### 3.4 Clipboard Support

#### Clipboard Tool Detection
- [x] Create `src/lib/clipboard.ts` file
- [x] Define `ClipboardTool` type
- [x] Define `ClipboardResult` type with success/error
- [x] Implement `detectClipboardTool()` function
- [x] Check WAYLAND_DISPLAY for wl-copy (Linux Wayland)
- [x] Check for xclip availability (Linux X11)
- [x] Check for xsel availability (Linux X11 fallback)
- [x] Use pbcopy on macOS
- [x] Use clip on Windows
- [x] Cache detection result

#### Copy Function
- [x] Implement `copyToClipboard()` function
- [x] Call `detectClipboardTool()` to get tool
- [x] Spawn tool process with Bun.spawn
- [x] Pipe text to tool's stdin
- [x] Wait for process to complete
- [x] Return success or error result

#### Copy Action Integration
- [x] Create "Copy attach command" action
- [x] Generate attach command from session info
- [x] Call `copyToClipboard()` with command
- [x] Show toast on success: "Copied to clipboard"
- [x] Show toast on error: "Failed to copy"

#### Fallback Behavior
- [x] Show attach command in dialog if no clipboard tool
- [x] Allow manual selection and copy

### 3.5 Hooks Architecture Refactor

#### Loop State Hook
- [x] Create `src/hooks/useLoopState.ts` file
- [x] Define `LoopAction` type union
- [x] Define reducer function for state transitions
- [x] Create `createLoopState()` function
- [x] Create state signal with initial idle state
- [x] Create `dispatch()` function for actions
- [x] Create derived helpers: `isRunning()`, `isPaused()`, `isIdle()`
- [x] Add session-related derived helpers

#### Loop Stats Hook
- [x] Create `src/hooks/useLoopStats.ts` file
- [x] Create `createLoopStats()` function
- [x] Track iteration start times
- [x] Track iteration durations
- [x] Calculate average iteration time
- [x] Handle pause-aware elapsed time
- [x] Estimate remaining time (ETA)

#### Activity Log Hook
- [x] Create `src/hooks/useActivityLog.ts` file
- [x] Define `ActivityEvent` type with timestamp, type, message
- [x] Create `createActivityLog()` function
- [x] Create events array signal (max 100 items)
- [x] Implement `log()` to add event
- [x] Implement `clear()` to reset events
- [x] Auto-trim oldest events when limit reached

#### State Migration
- [x] Identify current state management in `src/app.tsx`
      <!-- Analysis complete:
           1. Main LoopState signal (lines 149-159): status, iteration, tasks, commits, lines, events, session fields
           2. Steering mode signals (lines 162-163): commandMode, commandInput
           3. Tasks panel signals (lines 166-167): showTasks, tasks
           4. Iteration times signal (lines 197-199): for ETA calculation
           5. Elapsed time signal (lines 211-212): runtime tracking
           6. Module-level refs (lines 54-56): globalSetState, globalUpdateIterationTimes, globalSendMessage
           Migration targets:
           - useLoopState hook can replace main state + dispatch pattern
           - useLoopStats hook can replace iterationTimes + elapsed + ETA
           - Activity log events are already in LoopState.events (ToolEvent[])
      -->
- [x] Create hook instances in App component
- [x] Wire dispatch actions to UI handlers
- [x] Replace direct signal updates with dispatch calls

#### App Cleanup
- [x] Remove inline state logic from App component
- [x] Use hook-provided derived states
- [x] Simplify component to UI rendering only

### 3.6 Enhanced Activity Log

#### Event Type Definitions
- [x] Create `src/types/events.ts` file
- [x] Define `ActivityEventType` union type
- [x] Add "session_start" type
- [x] Add "session_idle" type
- [x] Add "task" type
- [x] Add "file_edit" type
- [x] Add "file_read" type
- [x] Add "error" type
- [x] Add "user_message" type
- [x] Add "assistant_message" type
- [x] Add "reasoning" type
- [x] Add "tool_use" type

#### Event Icons and Colors
- [x] Define icon map for each event type
- [x] Define color map for each event type
- [x] Create `getEventIcon()` helper function
- [x] Create `getEventColor()` helper function

#### Event Detail Support
- [x] Add optional `detail` field to ActivityEvent
- [x] Populate detail for tool_use events with arguments
- [x] Populate detail for file events with path

#### Verbose Event Styling
- [x] Add `verbose` flag to ActivityEvent
- [x] Mark reasoning events as verbose
- [x] Mark file_read events as verbose
- [x] Apply dimmed text style to verbose events

#### Log Component Updates
- [x] Update log component to render icons
- [x] Apply event-specific colors
- [x] Render detail text when present
- [x] Apply dimmed styling for verbose events
- [x] Ensure auto-scroll to latest event

---

## Testing & Validation

### Unit Tests
- [x] Add tests for `buildPrompt()` precedence logic
- [x] Add tests for `calculateBackoffMs()` function
- [x] Add tests for `parsePlanTasks()` function
- [x] Add tests for `detectClipboardTool()` function
- [x] Add tests for `detectInstalledTerminals()` function
- [x] Add tests for `resolveTheme()` function

### Integration Tests
- [x] Test loop with external server attachment
- [x] Test session creation and steering message sending
- [x] Test prompt-file precedence and placeholder replacement
- [x] Test plan parsing with various checkbox formats
- [x] Test terminal detection on different systems

### Manual Testing
- [x] Verify steering mode sends messages correctly
- [x] Verify custom prompt file is read
- [x] Verify backoff delays work as expected
- [x] Verify agent flag passes through to API
- [x] Verify command palette shows/filters commands
- [x] Verify terminal launches with correct command
- [x] Verify debug mode creates manual sessions
- [ ] Verify tasks panel shows all tasks
- [ ] Verify themes apply correctly
- [ ] Verify tokens accumulate properly
- [ ] Verify toasts appear and dismiss
- [ ] Verify clipboard copies on Linux/macOS
- [ ] Verify all keybindings work without conflicts
