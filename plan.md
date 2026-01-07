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
- [ ] Copy `github.json` theme file
- [ ] Copy `gruvbox.json` theme file
- [ ] Copy `kanagawa.json` theme file
- [ ] Copy `lucent-orng.json` theme file
- [ ] Copy `material.json` theme file
- [ ] Copy `matrix.json` theme file
- [ ] Copy `mercury.json` theme file
- [ ] Copy `monokai.json` theme file
- [ ] Copy `nightowl.json` theme file
- [ ] Copy `nord.json` theme file
- [ ] Copy `one-dark.json` theme file
- [ ] Copy `opencode.json` theme file
- [ ] Copy `orng.json` theme file
- [ ] Copy `osaka-jade.json` theme file
- [ ] Copy `palenight.json` theme file
- [ ] Copy `rosepine.json` theme file
- [ ] Copy `solarized.json` theme file
- [ ] Copy `synthwave84.json` theme file
- [ ] Copy `tokyonight.json` theme file
- [ ] Copy `vercel.json` theme file
- [ ] Copy `vesper.json` theme file
- [ ] Copy `zenburn.json` theme file

#### Theme Index
- [ ] Create `src/lib/themes/index.ts` file
- [ ] Import all theme JSON files
- [ ] Export `themes` map keyed by theme name
- [ ] Export `themeNames` array for listing

#### Theme Resolver
- [ ] Create `src/lib/theme-resolver.ts` file
- [ ] Define `Theme` interface with color fields
- [ ] Implement `resolveTheme()` to parse theme JSON
- [ ] Handle variable references in theme colors
- [ ] Support dark/light mode variants

#### Theme Context
- [ ] Create `src/context/ThemeContext.tsx` file
- [ ] Create `ThemeContext` using `createContext()`
- [ ] Create `ThemeProvider` component
- [ ] Read OpenCode state from `~/.local/state/opencode/kv.json`
- [ ] Parse theme preference from OpenCode state
- [ ] Create `theme()` accessor for current theme
- [ ] Default to "opencode" theme
- [ ] Create `useTheme()` hook

#### Component Updates
- [ ] Update `src/components/header.tsx` to use theme colors
- [ ] Update `src/components/footer.tsx` to use theme colors
- [ ] Update `src/components/log.tsx` to use theme colors
- [ ] Update dialog components to use theme colors
- [ ] Update steering overlay to use theme colors

#### Colors Migration
- [ ] Preserve existing `colors.ts` values as fallback
- [ ] Create theme-based color accessor functions
- [ ] Migrate components from direct colors import to theme accessor
- [ ] Remove direct color imports after migration complete

### 3.2 Token Tracking

#### Session Stats Hook
- [ ] Create `src/hooks/useSessionStats.ts` file
- [ ] Define `SessionTokens` interface with `input`, `output`, `reasoning`, `cacheRead`, `cacheWrite`
- [ ] Create `createSessionStats()` function
- [ ] Create signals for each token counter
- [ ] Create `reset()` function to zero all counters
- [ ] Create `addTokens()` function to increment counters

#### SSE Event Integration
- [ ] Identify token event name in current SDK (e.g., `step.finish`)
- [ ] Hook into SSE event handler in loop
- [ ] Extract token counts from event payload
- [ ] Call `addTokens()` with extracted values

#### Token Display
- [ ] Add token display to footer component
- [ ] Format: "Tokens: 1.2K in / 500 out / 200 reasoning"
- [ ] Use `formatNumber()` helper for compact display
- [ ] Only show when tokens > 0

#### Session Reset
- [ ] Call `reset()` on session start
- [ ] Clear display when no active session

### 3.3 Toast Notifications

#### Toast Context
- [ ] Create `src/context/ToastContext.tsx` file
- [ ] Define `ToastOptions` interface with `variant`, `message`, `duration`
- [ ] Define `Toast` type extending options with `id`
- [ ] Define `ToastContextValue` interface with `show()`
- [ ] Create `ToastContext` using `createContext()`
- [ ] Create `ToastProvider` component with toasts array signal
- [ ] Implement `show()` to add toast with auto-generated ID
- [ ] Implement auto-dismiss with setTimeout based on duration
- [ ] Create `useToast()` hook

#### Toast Display Component
- [ ] Create `src/components/toast.tsx` file
- [ ] Position container at bottom of screen
- [ ] Render each toast as inline box
- [ ] Style success variant with green color
- [ ] Style error variant with red color
- [ ] Style info variant with blue color
- [ ] Add dismiss animation (fade out)

#### Toast Stack Rendering
- [ ] Create `ToastStack` component
- [ ] Render toasts in order (newest at bottom)
- [ ] Handle multiple toasts queued
- [ ] Limit max visible toasts to 3

#### App Integration
- [ ] Wrap App with `ToastProvider` in `src/app.tsx`
- [ ] Add `<ToastStack />` after main content

### 3.4 Clipboard Support

#### Clipboard Tool Detection
- [ ] Create `src/lib/clipboard.ts` file
- [ ] Define `ClipboardTool` type
- [ ] Define `ClipboardResult` type with success/error
- [ ] Implement `detectClipboardTool()` function
- [ ] Check WAYLAND_DISPLAY for wl-copy (Linux Wayland)
- [ ] Check for xclip availability (Linux X11)
- [ ] Check for xsel availability (Linux X11 fallback)
- [ ] Use pbcopy on macOS
- [ ] Use clip on Windows
- [ ] Cache detection result

#### Copy Function
- [ ] Implement `copyToClipboard()` function
- [ ] Call `detectClipboardTool()` to get tool
- [ ] Spawn tool process with Bun.spawn
- [ ] Pipe text to tool's stdin
- [ ] Wait for process to complete
- [ ] Return success or error result

#### Copy Action Integration
- [ ] Create "Copy attach command" action
- [ ] Generate attach command from session info
- [ ] Call `copyToClipboard()` with command
- [ ] Show toast on success: "Copied to clipboard"
- [ ] Show toast on error: "Failed to copy"

#### Fallback Behavior
- [ ] Show attach command in dialog if no clipboard tool
- [ ] Allow manual selection and copy

### 3.5 Hooks Architecture Refactor

#### Loop State Hook
- [ ] Create `src/hooks/useLoopState.ts` file
- [ ] Define `LoopAction` type union
- [ ] Define reducer function for state transitions
- [ ] Create `createLoopState()` function
- [ ] Create state signal with initial idle state
- [ ] Create `dispatch()` function for actions
- [ ] Create derived helpers: `isRunning()`, `isPaused()`, `isIdle()`
- [ ] Add session-related derived helpers

#### Loop Stats Hook
- [ ] Create `src/hooks/useLoopStats.ts` file
- [ ] Create `createLoopStats()` function
- [ ] Track iteration start times
- [ ] Track iteration durations
- [ ] Calculate average iteration time
- [ ] Handle pause-aware elapsed time
- [ ] Estimate remaining time (ETA)

#### Activity Log Hook
- [ ] Create `src/hooks/useActivityLog.ts` file
- [ ] Define `ActivityEvent` type with timestamp, type, message
- [ ] Create `createActivityLog()` function
- [ ] Create events array signal (max 100 items)
- [ ] Implement `log()` to add event
- [ ] Implement `clear()` to reset events
- [ ] Auto-trim oldest events when limit reached

#### State Migration
- [ ] Identify current state management in `src/app.tsx`
- [ ] Create hook instances in App component
- [ ] Wire dispatch actions to UI handlers
- [ ] Replace direct signal updates with dispatch calls

#### App Cleanup
- [ ] Remove inline state logic from App component
- [ ] Use hook-provided derived states
- [ ] Simplify component to UI rendering only

### 3.6 Enhanced Activity Log

#### Event Type Definitions
- [ ] Create `src/types/events.ts` file
- [ ] Define `ActivityEventType` union type
- [ ] Add "session_start" type
- [ ] Add "session_idle" type
- [ ] Add "task" type
- [ ] Add "file_edit" type
- [ ] Add "file_read" type
- [ ] Add "error" type
- [ ] Add "user_message" type
- [ ] Add "assistant_message" type
- [ ] Add "reasoning" type
- [ ] Add "tool_use" type

#### Event Icons and Colors
- [ ] Define icon map for each event type
- [ ] Define color map for each event type
- [ ] Create `getEventIcon()` helper function
- [ ] Create `getEventColor()` helper function

#### Event Detail Support
- [ ] Add optional `detail` field to ActivityEvent
- [ ] Populate detail for tool_use events with arguments
- [ ] Populate detail for file events with path

#### Verbose Event Styling
- [ ] Add `verbose` flag to ActivityEvent
- [ ] Mark reasoning events as verbose
- [ ] Mark file_read events as verbose
- [ ] Apply dimmed text style to verbose events

#### Log Component Updates
- [ ] Update log component to render icons
- [ ] Apply event-specific colors
- [ ] Render detail text when present
- [ ] Apply dimmed styling for verbose events
- [ ] Ensure auto-scroll to latest event

---

## Testing & Validation

### Unit Tests
- [ ] Add tests for `buildPrompt()` precedence logic
- [ ] Add tests for `calculateBackoffMs()` function
- [ ] Add tests for `parsePlanTasks()` function
- [ ] Add tests for `detectClipboardTool()` function
- [ ] Add tests for `detectInstalledTerminals()` function
- [ ] Add tests for `resolveTheme()` function

### Integration Tests
- [ ] Test loop with external server attachment
- [ ] Test session creation and steering message sending
- [ ] Test prompt-file precedence and placeholder replacement
- [ ] Test plan parsing with various checkbox formats
- [ ] Test terminal detection on different systems

### Manual Testing
- [ ] Verify steering mode sends messages correctly
- [ ] Verify custom prompt file is read
- [ ] Verify backoff delays work as expected
- [ ] Verify agent flag passes through to API
- [ ] Verify command palette shows/filters commands
- [ ] Verify terminal launches with correct command
- [ ] Verify debug mode creates manual sessions
- [ ] Verify tasks panel shows all tasks
- [ ] Verify themes apply correctly
- [ ] Verify tokens accumulate properly
- [ ] Verify toasts appear and dismiss
- [ ] Verify clipboard copies on Linux/macOS
- [ ] Verify all keybindings work without conflicts
