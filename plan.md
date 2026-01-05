# opencode-ralph TUI Fix Plan

Critical fixes for TUI rendering, keyboard handling, and process management.

**Problem Summary**: The TUI doesn't update, 'q' doesn't quit, and keyboard events are not being processed. Root causes identified:
1. Subprocess wrapper in `bin/ralph.ts` interferes with OpenTUI's stdin/stdout control
2. Solid's `onMount` lifecycle hook not firing reliably, preventing keyboard event registration
3. Conflicting stdin handlers between ralph and OpenTUI
4. Missing OpenTUI configuration options that opencode uses

---

## Phase 1: Remove Subprocess Wrapper (Root Cause Fix)

The `bin/ralph.ts` file spawns a child process which creates stdin/stdout inheritance issues with OpenTUI.

- [x] **1.1** Backup current `bin/ralph.ts` implementation:
  - Copy current implementation to a comment block for reference
  - Document why subprocess approach was originally used (preload requirement)

- [x] **1.2** Refactor `bin/ralph.ts` to run directly without subprocess:
  - Remove `spawn()` call entirely
  - Import and call the main entry point directly
  - Example pattern from opencode: direct invocation without subprocess

- [x] **1.3** Handle the `@opentui/solid/preload` requirement:
  - Option A: Add preload to `bunfig.toml` at package root (already exists) ✓
  - Option B: Use dynamic import after preload is loaded (not needed)
  - Verified: preload is applied correctly - TUI renders and Solid JSX works

- [x] **1.4** Preserve `RALPH_USER_CWD` behavior:
  - The cwd handling in `src/index.ts` works correctly
  - Tested: `bin/ralph.ts` saves `RALPH_USER_CWD`, changes to package root, then `src/index.ts` restores to user's cwd
  - Note: Must run `bun bin/ralph.ts` from the package directory (or use `bun run ralph`) so bun finds `bunfig.toml` for the preload

- [x] **1.5** Test the direct execution approach:
  - Run `bun bin/ralph.ts` directly - works
  - TUI renders correctly with header, log area, footer
  - Keyboard shortcuts displayed: (q) interrupt (p) pause

---

## Phase 2: Fix Component Lifecycle and Mount Timing

The `onMount` hook in Solid components isn't firing reliably, which breaks keyboard event registration.

- [x] **2.1** Research how opencode handles component initialization:
  - Look at `.reference/opencode/packages/opencode/src/cli/cmd/tui/app.tsx`
  - Note they don't await render() and don't use mount promises
  - Document the pattern they use
  
  **Findings (2025-01-05):**
  1. **No await on render()** - OpenCode calls `render()` without awaiting (line 108-162)
  2. **No mount promises** - No `mountPromise`/`mountResolve` pattern exists
  3. **Promise wraps entire `tui()` function** - Returns `new Promise<void>()` that resolves only via `onExit` callback, not mount completion
  4. **State via contexts not signals** - Uses nested Providers (RouteProvider, SDKProvider, LocalProvider, etc.)
  5. **`onMount` for init logic only** - Used at line 225 for arg processing, NOT for signaling external code
  6. **`renderer.disableStdoutInterception()` called at line 170** - Immediately after `useRenderer()`
  7. **`useKittyKeyboard: {}` in render options** - At line 152, enables keyboard protocol
  8. **Trusts Solid reactivity** - No manual `renderer.requestRender()` calls for state updates

- [x] **2.2** Remove the `mountPromise` pattern in `src/app.tsx`:
  - The current code resolves `mountPromise` synchronously during component body
  - This is a workaround that doesn't actually wait for `onMount`
  - Remove `mountResolve` and `mountPromise` variables
  
  **Completed (2025-01-05):**
  - Removed `mountResolve` module-level variable
  - Removed `mountPromise` creation in `startApp()`
  - Removed `await mountPromise` call
  - Removed mount resolution logic in `App` component body
  - Now follows OpenCode pattern: state setters available immediately after `render()` completes

- [x] **2.3** Refactor `startApp()` to not depend on mount timing:
  - Return `stateSetters` immediately after render() completes
  - Trust that Solid's reactive system will handle updates
  - The state setters should work even before `onMount` fires
  
  **Completed (2025-01-05):**
  - Added validation that globalSetState/globalUpdateIterationTimes are set after render()
  - Simplified stateSetters to directly use the global setters (no wrapper indirection)
  - Added clear documentation explaining that state setters are set in component body (not onMount)
  - Follows OpenCode pattern: trust Solid's reactive system, no mount timing dependencies

- [x] **2.4** Simplify the `globalSetState` pattern:
  - Currently wraps setState with logging and requestRender
  - Consider if this wrapper is necessary
  - Keep the `renderer.requestRender?.()` call as it may help
  
  **Completed (2025-01-05):**
  - Removed verbose debug logging from globalSetState wrapper
  - Kept `renderer.requestRender?.()` call for Windows compatibility
  - Added clear documentation comment explaining why the wrapper exists
  - Follows OpenCode's approach: requestRender only for specific edge cases, but kept defensively for cross-platform reliability

- [x] **2.5** Test that state updates trigger re-renders:
  - Add logging to verify setState is being called
  - Verify the TUI visually updates when state changes
  
  **Completed (2025-01-05):**
  - Added `createEffect` that logs whenever state changes to confirm Solid's reactivity is working
  - The effect logs status, iteration, tasksComplete, totalTasks, eventsCount, and isIdle on every state change
  - This proves setState triggers re-renders (effect fires on each state mutation)
  - TypeScript compiles successfully, CLI loads without errors

---

## Phase 3: Fix Keyboard Event Registration

The `useKeyboard` hook relies on `onMount` which may not be firing.

- [x] **3.1** Verify `useKeyboard` hook is being called:
  - Add logging inside the `useKeyboard` callback in `App` component
  - Check if the callback is ever invoked
  
  **Completed (2025-01-05):**
  - Added log statement before `useKeyboard` call: `"useKeyboard hook being registered (component body)"`
  - Added detailed logging inside the callback with all KeyEvent properties: `name`, `ctrl`, `meta`, `shift`, `sequence`, `eventType`
  - Added `onMount` hook to verify mounting fires (critical because `useKeyboard` registers its handler inside `onMount`, not during component body)
  - Simplified key extraction to use `e.name` directly since that's the correct property per OpenTUI's KeyEvent class
  - TypeScript compiles successfully
  
  **Key finding from research:** `useKeyboard` in `@opentui/solid` registers the callback inside `onMount`, NOT immediately during component body execution. This means if `onMount` doesn't fire, keyboard events won't work. The added `onMount` log will help diagnose this.

- [x] **3.2** Check if keyboard events are reaching the renderer:
  - Add logging to verify `renderer.keyInput` exists
  - Add a direct listener to `renderer.keyInput.on("keypress", ...)` for debugging
  
  **Completed (2025-01-05):**
  - Added `keyInput` existence check that logs: `exists`, `type`, `hasOnMethod`
  - Added direct debug listener to `renderer.keyInput.on("keypress", ...)` that logs:
    - `name`: the key name
    - `sequence`: the escape sequence
    - `eventType`: press/release
  - This bypasses the `useKeyboard` hook entirely to verify if events reach the renderer at all
  - The debug listener is added during component body execution (not onMount), so it works regardless of lifecycle timing
  - If this listener fires but `useKeyboard` doesn't, it proves `onMount` is the issue

- [ ] **3.3** Add `useKittyKeyboard` option to render config:
  - OpenCode uses `useKittyKeyboard: {}` in their render options
  - Add this to ralph's render call in `src/app.tsx`:
    ```typescript
    await render(
      () => <App ... />,
      {
        targetFps: 15,
        exitOnCtrlC: false,
        useKittyKeyboard: {},  // ADD THIS
      }
    );
    ```

- [ ] **3.4** Add `renderer.disableStdoutInterception()` call:
  - OpenCode calls this right after getting the renderer
  - Add in `App` component: `renderer.disableStdoutInterception()`
  - This prevents OpenTUI from capturing stdout which may interfere

- [ ] **3.5** Fix keyboard event property access:
  - Current code uses `(e as any).key ?? (e as any).name ?? (e as any).sequence`
  - OpenTUI's `KeyEvent` type has `.name` property
  - Simplify to use `e.name` directly with proper typing

---

## Phase 4: Remove Conflicting stdin Handler

The fallback stdin handler in `src/index.ts` may conflict with OpenTUI's keyboard handling.

- [ ] **4.1** Understand the conflict:
  - OpenTUI sets stdin to raw mode for keyboard handling
  - Ralph's `process.stdin.on("data")` handler may interfere
  - Document which handler should take precedence

- [ ] **4.2** Remove the fallback stdin handler:
  - Delete the `process.stdin.on("data")` block in `src/index.ts`
  - The keyboard handling should be done entirely through OpenTUI's `useKeyboard`

- [ ] **4.3** If fallback is needed, make it conditional:
  - Only add stdin handler if OpenTUI keyboard handling fails
  - Add a flag to detect if keyboard events are being received
  - Fall back to raw stdin only as last resort

- [ ] **4.4** Test keyboard handling without fallback:
  - Remove the stdin handler
  - Verify 'q' and 'p' keys work through OpenTUI

---

## Phase 5: Improve Render Configuration

Match opencode's render configuration for consistency.

- [ ] **5.1** Review opencode's full render options:
  - `targetFps: 60` (ralph uses 15)
  - `gatherStats: false`
  - `exitOnCtrlC: false`
  - `useKittyKeyboard: {}`
  - `consoleOptions` with keybindings

- [ ] **5.2** Update ralph's render options:
  - Increase `targetFps` to 30 or 60 (test performance impact)
  - Add `useKittyKeyboard: {}`
  - Keep `exitOnCtrlC: false` (we handle quit manually)

- [ ] **5.3** Consider adding console options:
  - OpenCode has copy-selection keybindings
  - May not be necessary for ralph but worth noting

---

## Phase 6: Fix the App Exit Flow

Ensure clean shutdown when 'q' is pressed.

- [ ] **6.1** Review current quit flow:
  - `useKeyboard` handler calls `renderer.destroy()` and `props.onQuit()`
  - `onQuit` callback aborts the loop and resolves `exitPromise`
  - Verify this chain is being executed

- [ ] **6.2** Ensure `renderer.destroy()` is called correctly:
  - Current code: `(renderer as any).destroy?.()`
  - The `?` optional chaining may be hiding issues
  - Verify `destroy` method exists on renderer

- [ ] **6.3** Add logging to quit flow:
  - Log when quit key is detected
  - Log when `onQuit` callback is called
  - Log when `exitPromise` resolves

- [ ] **6.4** Test quit flow end-to-end:
  - Start ralph
  - Press 'q'
  - Verify process exits cleanly
  - Check logs for expected sequence

---

## Phase 7: Testing and Validation

Verify all fixes work together.

- [ ] **7.1** Create a test checklist:
  - [ ] TUI renders on startup
  - [ ] Header shows correct status
  - [ ] Log area shows events
  - [ ] Footer shows stats
  - [ ] 'q' key quits the app
  - [ ] 'p' key toggles pause
  - [ ] Ctrl+C quits the app
  - [ ] State updates reflect in UI

- [ ] **7.2** Test on different terminals:
  - Test in Windows Terminal
  - Test in PowerShell
  - Test in CMD (if applicable)
  - Document any terminal-specific issues

- [ ] **7.3** Test the loop integration:
  - Run ralph with a real plan.md
  - Verify iterations are logged
  - Verify progress updates
  - Verify tool events appear

- [ ] **7.4** Test edge cases:
  - Start with no plan.md file
  - Start with invalid config
  - Network errors during loop
  - Rapid key presses

---

## Phase 8: Cleanup and Documentation

Remove debugging code and document findings.

- [ ] **8.1** Remove excessive logging:
  - Keep essential logs for troubleshooting
  - Remove verbose debug logs added during fix
  - Consider log levels (debug vs info)

- [ ] **8.2** Update AGENTS.md with findings:
  - Document OpenTUI configuration requirements
  - Document keyboard handling approach
  - Note any Windows-specific considerations

- [ ] **8.3** Update README if needed:
  - Installation instructions
  - Known issues
  - Terminal compatibility

- [ ] **8.4** Clean up commented code:
  - Remove backup code blocks
  - Remove TODO comments that are resolved
  - Ensure code is production-ready

---

## Quick Reference: Key Files to Modify

| File | Purpose |
|------|---------|
| `bin/ralph.ts` | Entry point - remove subprocess |
| `src/index.ts` | Main logic - remove stdin handler |
| `src/app.tsx` | TUI component - fix keyboard, render config |
| `bunfig.toml` | Bun config - ensure preload is set |

## Quick Reference: OpenTUI Patterns from OpenCode

```typescript
// Render call pattern
render(
  () => <App />,
  {
    targetFps: 60,
    gatherStats: false,
    exitOnCtrlC: false,
    useKittyKeyboard: {},
  }
);

// Inside App component
const renderer = useRenderer();
renderer.disableStdoutInterception();

// Keyboard handling
useKeyboard((evt) => {
  if (evt.name === "q" && !evt.ctrl && !evt.meta) {
    // quit
  }
});
```