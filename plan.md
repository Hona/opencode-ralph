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
- [ ] Add guard in `sendMessage` to check for active session before sending
- [ ] Call `onSessionCreated` callback after session creation in `runLoop`
- [ ] Call `onSessionEnded` callback when session ends in `runLoop`
- [ ] Clear session fields in `LoopState` when `onSessionEnded` fires

#### Steering UI State
- [ ] Add `commandMode` signal to `src/app.tsx`
- [ ] Add `commandInput` signal to `src/app.tsx`
- [ ] Create `isInputFocused()` helper function to check dialog/input state

#### Steering Keyboard Handler
- [ ] Add `:` key detection logic (handle colon, semicolon+shift, raw `:`)
- [ ] Add keyboard handler for `:` that opens steering mode
- [ ] Guard `:` handler to respect `isInputFocused()` state
- [ ] Guard `:` handler to check for active session

#### Steering Overlay Component
- [ ] Create `src/components/steering.tsx` file
- [ ] Add modal overlay with dark background
- [ ] Add purple-bordered input box
- [ ] Add placeholder text: "Type message and press Enter"
- [ ] Add ESC key handler to close overlay
- [ ] Add Enter key handler to send message

#### Steering Submit Logic
- [ ] Implement `sendSteeringMessage()` function in `src/app.tsx`
- [ ] Trim input and validate non-empty before sending
- [ ] Call `sendMessage()` with trimmed input
- [ ] Close overlay and clear input after successful send
- [ ] Show error feedback if no active session

#### Steering Footer Hint
- [ ] Update `src/components/footer.tsx` to show `: steer` hint
- [ ] Only show hint when session is active

### 1.2 Custom Prompt File Support

#### CLI Option
- [ ] Add `--prompt-file` option to yargs in `src/index.ts`
- [ ] Set default value to `.ralph-prompt.md`
- [ ] Add description: "Path to prompt file"

#### State and Config
- [ ] Add `promptFile` field to `LoopOptions` in `src/state.ts`
- [ ] Add `promptFile` field to `RalphConfig` type in `src/index.ts`
- [ ] Read `promptFile` from global config in `src/index.ts`

#### Prompt Building Logic
- [ ] Create `buildPrompt()` function in `src/loop.ts`
- [ ] Implement precedence: `--prompt` > `--prompt-file` > DEFAULT_PROMPT
- [ ] Read prompt file using `Bun.file()` when `promptFile` specified
- [ ] Check file existence with `file.exists()` before reading
- [ ] Replace `{plan}` placeholder with `options.planFile`
- [ ] Replace `{{PLAN_FILE}}` placeholder with `options.planFile`
- [ ] Return DEFAULT_PROMPT as fallback

#### Example Template
- [ ] Create `.ralph-prompt.md.example` template file
- [ ] Add example content with `{{PLAN_FILE}}` placeholder

#### Tests
- [ ] Add test for `--prompt` string taking precedence
- [ ] Add test for `--prompt-file` being read correctly
- [ ] Add test for placeholder replacement in prompt file
- [ ] Add test for fallback to DEFAULT_PROMPT when file missing

### 1.3 Error Retry with Exponential Backoff

#### Backoff Calculation
- [ ] Create `calculateBackoffMs()` function in `src/loop.ts`
- [ ] Set base delay to 5000ms (5 seconds)
- [ ] Implement exponential growth: `base * 2^(attempt-1)`
- [ ] Cap maximum delay at 300000ms (5 minutes)
- [ ] Add 10% jitter to prevent synchronized retries

#### Error Tracking
- [ ] Add `errorCount` variable in `runLoop` (local, not persisted)
- [ ] Increment `errorCount` on each caught error
- [ ] Reset `errorCount` to 0 on successful iteration

#### Error Handling Refactor
- [ ] Wrap iteration body in try/catch in `runLoop`
- [ ] Call `callbacks.onError` when error caught
- [ ] Log error with `log("loop", "Error in iteration", { error })`
- [ ] Continue loop instead of rethrowing (unless abort signal set)

#### Backoff Application
- [ ] Check `errorCount > 0` before iteration starts
- [ ] Calculate backoff with `calculateBackoffMs(errorCount)`
- [ ] Log backoff delay with `log("loop", "Error backoff", { errorCount, backoffMs })`
- [ ] Apply delay with `await Bun.sleep(backoffMs)`

#### Error Display in TUI
- [ ] Add `errorBackoffMs` field to `LoopState` in `src/state.ts`
- [ ] Add `errorRetryAt` field to `LoopState` (timestamp for countdown)
- [ ] Update TUI to show retry countdown when backoff active
- [ ] Format countdown as "Retrying in Xs..." in log component

### 1.4 Agent Selection (`-a` flag)

#### CLI Option
- [ ] Add `--agent` option to yargs in `src/index.ts`
- [ ] Add `-a` alias for `--agent`
- [ ] Add description: "Agent to use (e.g., 'code', 'plan', 'build')"

#### State and Config
- [ ] Add `agent` field to `LoopOptions` in `src/state.ts`
- [ ] Add `agent` field to `RalphConfig` type
- [ ] Read `agent` from global config in `src/index.ts`

#### API Integration
- [ ] Pass `agent` to `client.session.prompt()` body in `src/loop.ts`
- [ ] Only include `agent` field when options.agent is defined

---

## Phase 2: Power User Features

### 2.3 Dialog System (Required by 2.1, 2.2)

#### Context Provider
- [ ] Create `src/context/DialogContext.tsx` file
- [ ] Define `DialogComponent` type
- [ ] Define `DialogContextValue` interface with `show`, `replace`, `clear`, `pop`, `stack`, `hasDialogs`
- [ ] Create `DialogContext` using `createContext()`
- [ ] Create `DialogProvider` component with stack signal
- [ ] Implement `show()` to push dialog onto stack
- [ ] Implement `replace()` to swap top dialog
- [ ] Implement `clear()` to empty stack
- [ ] Implement `pop()` to remove top dialog
- [ ] Create `useDialog()` hook for consuming context

#### Base Dialog Component
- [ ] Create `src/ui/Dialog.tsx` file
- [ ] Add dark overlay background (semi-transparent)
- [ ] Add centered content box with border
- [ ] Add border styling (default color)
- [ ] Add Escape key handler to call `pop()`

#### Confirmation Dialog
- [ ] Create `src/ui/DialogConfirm.tsx` file
- [ ] Add `title` and `message` props
- [ ] Add Confirm/Cancel buttons
- [ ] Add Y key shortcut for confirm
- [ ] Add N key shortcut for cancel
- [ ] Call `onConfirm` or `onCancel` callback accordingly

#### Prompt Dialog
- [ ] Create `src/ui/DialogPrompt.tsx` file
- [ ] Add text input field
- [ ] Add placeholder text prop
- [ ] Add Submit/Cancel buttons
- [ ] Add Enter key to submit
- [ ] Add Escape key to cancel
- [ ] Call `onSubmit(value)` or `onCancel` callback

#### Alert Dialog
- [ ] Create `src/ui/DialogAlert.tsx` file
- [ ] Add message display area
- [ ] Add Dismiss button
- [ ] Add Enter/Escape to dismiss
- [ ] Call `onDismiss` callback

#### Dialog Stack Renderer
- [ ] Create `DialogStack` component in `src/context/DialogContext.tsx`
- [ ] Render all dialogs in stack with proper z-indexing
- [ ] Only render when `hasDialogs()` is true

#### Input Focus Management
- [ ] Create `inputFocused` signal in DialogContext
- [ ] Set `inputFocused(true)` when any dialog opens
- [ ] Set `inputFocused(false)` when all dialogs close
- [ ] Export `isInputFocused()` accessor

#### App Integration
- [ ] Wrap App content with `DialogProvider` in `src/app.tsx`
- [ ] Add `<DialogStack />` after main content

### 2.1 Command Palette (Ctrl+P)

#### Dependencies
- [ ] Install `fuzzysort` package: `bun add fuzzysort`

#### Context Provider
- [ ] Create `src/context/CommandContext.tsx` file
- [ ] Define `CommandOption` interface with `title`, `value`, `description`, `category`, `keybind`, `disabled`, `onSelect`
- [ ] Define `CommandContextValue` interface with `register`, `show`, `trigger`, `suspended`, `keybinds`
- [ ] Create `CommandContext` using `createContext()`
- [ ] Create `CommandProvider` component
- [ ] Implement `register()` to store command factory functions
- [ ] Implement `show()` to open command palette dialog
- [ ] Implement `trigger(value)` to execute command by value
- [ ] Implement `keybinds(enabled)` to toggle global keybinds
- [ ] Create `useCommand()` hook for consuming context

#### Fuzzy Search Dialog
- [ ] Create `src/ui/DialogSelect.tsx` file
- [ ] Add search input at top
- [ ] Add results list below input
- [ ] Integrate fuzzysort for filtering
- [ ] Highlight matched characters in results
- [ ] Show keybind hint for each option
- [ ] Show description text if present

#### Keyboard Navigation
- [ ] Add ↑/↓ arrow key handlers for selection
- [ ] Add Enter key to execute selected command
- [ ] Add Escape key to close palette
- [ ] Auto-focus search input on open
- [ ] Scroll selected item into view

#### Default Commands
- [ ] Create `src/lib/keymap.ts` file with centralized keybind definitions
- [ ] Define `copyAttach` keybind in keymap
- [ ] Define `terminalConfig` keybind in keymap
- [ ] Define `toggleTasks` keybind in keymap
- [ ] Define `togglePause` keybind in keymap
- [ ] Register "Copy attach command" action
- [ ] Register "Choose default terminal" action
- [ ] Register "Toggle tasks panel" action
- [ ] Register "Pause/Resume" action

#### Ctrl+P Handler
- [ ] Add Ctrl+P keyboard handler in `src/app.tsx`
- [ ] Check `isInputFocused()` before opening palette
- [ ] Call `command.show()` to open palette

#### App Integration
- [ ] Wrap App with `CommandProvider` in `src/app.tsx`
- [ ] Initialize default commands on mount

### 2.2 Terminal Launcher (T key)

#### Terminal Definitions
- [ ] Create `src/lib/terminal-launcher.ts` file
- [ ] Define `KnownTerminal` interface with `name`, `command`, `args`
- [ ] Add alacritty terminal definition
- [ ] Add kitty terminal definition
- [ ] Add wezterm terminal definition
- [ ] Add gnome-terminal definition
- [ ] Add konsole terminal definition
- [ ] Add xfce4-terminal definition
- [ ] Add foot terminal definition
- [ ] Add tilix terminal definition
- [ ] Add terminator terminal definition
- [ ] Add xterm terminal definition
- [ ] Add urxvt terminal definition
- [ ] Add x-terminal-emulator definition

#### Platform-Specific Terminals
- [ ] Add macOS Terminal.app definition
- [ ] Add macOS iTerm2 definition
- [ ] Add Windows Terminal definition
- [ ] Add Windows cmd.exe definition

#### Terminal Detection
- [ ] Implement `detectInstalledTerminals()` function
- [ ] Use `which` command to check terminal availability
- [ ] Filter terminals by platform (darwin/linux/win32)
- [ ] Return array of installed terminals
- [ ] Cache detection result

#### Terminal Launch
- [ ] Implement `launchTerminal()` function
- [ ] Build args array with `{cmd}` placeholder replacement
- [ ] Split command string into args array
- [ ] Use `Bun.spawn()` with detached option
- [ ] Call `unref()` on spawned process
- [ ] Return success/error result

#### Attach Command
- [ ] Implement `getAttachCommand()` function
- [ ] Format: `opencode attach ${url} --session ${sessionId}`
- [ ] Handle missing sessionId gracefully

#### Config Persistence
- [ ] Create `src/lib/config.ts` file
- [ ] Define config file path: `~/.config/ralph/config.json`
- [ ] Implement `loadConfig()` to read JSON file
- [ ] Implement `saveConfig()` to write JSON file
- [ ] Add `preferredTerminal` field to config
- [ ] Add `customTerminalCommand` field to config

#### Terminal Config Dialog
- [ ] Create terminal selection dialog component
- [ ] List detected terminals as options
- [ ] Add "Custom command..." option
- [ ] Add "Copy to clipboard" option
- [ ] Save selection to config on confirm

#### T Key Handler
- [ ] Add T key handler in `src/app.tsx`
- [ ] Check for active session before launching
- [ ] Check for configured terminal preference
- [ ] If configured: launch terminal directly
- [ ] If not configured: show config dialog
- [ ] Use external server URL when attached mode

### 2.4 Debug/Sandbox Mode (`-d` flag)

#### CLI Flag
- [ ] Add `--debug` / `-d` flag to yargs in `src/index.ts`
- [ ] Add description: "Debug mode - manual session creation"

#### State Changes
- [ ] Add `debug` optional field to `LoopState` in `src/state.ts`
- [ ] Pass debug flag from CLI to LoopOptions

#### Debug Mode Behavior
- [ ] Skip plan file validation when debug mode enabled
- [ ] Skip automatic loop start in debug mode
- [ ] Set initial state to idle in debug mode

#### Debug Key Handlers
- [ ] Add N key handler for "new session" in debug mode
- [ ] Add P key handler for "prompt input" in debug mode
- [ ] Add Q key handler for quit (shared with normal mode)

#### Debug Session Creation
- [ ] Implement `createDebugSession()` function
- [ ] Call `client.session.create({})` to create session
- [ ] Store session ID in state
- [ ] Log session creation event

#### Debug Prompt Dialog
- [ ] Use DialogPrompt for manual prompt input
- [ ] Send prompt via `client.session.prompt()`
- [ ] Log prompt send event

#### Debug Mode Indicator
- [ ] Add debug mode indicator in header component
- [ ] Show "[DEBUG]" badge when debug mode active
- [ ] Style with distinct color (yellow/orange)

### 2.5 Tasks Panel

#### Task Parser
- [ ] Create `Task` type in `src/plan.ts` with `id`, `line`, `text`, `done` fields
- [ ] Create `parsePlanTasks()` function (separate from `parsePlan()`)
- [ ] Read file content line by line
- [ ] Match checkbox pattern: `/^(\s*)-\s*\[([ xX])\]\s*(.+)$/`
- [ ] Extract line number, done status, and text
- [ ] Generate unique ID from line number
- [ ] Return array of Task objects

#### Tasks Component
- [ ] Create `src/components/tasks.tsx` file
- [ ] Add `tasks` prop for Task array
- [ ] Add `onClose` callback prop
- [ ] Render scrollable list container
- [ ] Render checkbox indicator: `[✓]` or `[ ]`
- [ ] Render task text next to checkbox
- [ ] Gray out completed tasks
- [ ] Add ESC key handler to close

#### Tasks State
- [ ] Add `showTasks` signal to `src/app.tsx`
- [ ] Add `tasks` signal to store parsed tasks
- [ ] Initialize tasks by parsing plan file on mount

#### Task Refresh
- [ ] Create `refreshTasks()` function
- [ ] Call `parsePlanTasks()` with plan file path
- [ ] Update `tasks` signal with result
- [ ] Add polling interval (every 2 seconds)
- [ ] Clear interval on unmount

#### Tasks Key Handler
- [ ] Check for key conflict with Terminal Launcher (both use T)
- [ ] Choose alternative key if conflict (e.g., Shift+T or use command palette)
- [ ] Add key handler to toggle `showTasks` signal
- [ ] Update footer to show tasks keybind hint

#### Tasks Overlay
- [ ] Render TasksPanel when `showTasks()` is true
- [ ] Position as right-side overlay
- [ ] Add border and title "Tasks"
- [ ] Pass tasks and onClose props

---

## Phase 3: Polish & Integration

### 3.1 Theme System

#### Theme Files
- [ ] Create `src/lib/themes/` directory
- [ ] Copy `aura.json` theme file
- [ ] Copy `ayu.json` theme file
- [ ] Copy `catppuccin-frappe.json` theme file
- [ ] Copy `catppuccin-latte.json` theme file
- [ ] Copy `catppuccin-mocha.json` theme file
- [ ] Copy `cobalt2.json` theme file
- [ ] Copy `cursor.json` theme file
- [ ] Copy `dracula.json` theme file
- [ ] Copy `everforest.json` theme file
- [ ] Copy `flexoki.json` theme file
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
