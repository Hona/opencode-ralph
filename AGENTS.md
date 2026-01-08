# AGENTS.md - Critical Operational Details

## TypeScript Configuration

When using `@opentui/solid`, the `jsxImportSource` must be set to `"@opentui/solid"`, NOT `"solid-js"`. The plan.md incorrectly specifies `solid-js` but the actual requirement from the OpenTUI documentation is:

```json
{
  "compilerOptions": {
    "jsx": "preserve",
    "jsxImportSource": "@opentui/solid"
  }
}
```

Additionally, a `bunfig.toml` preload is required:

```toml
preload = ["@opentui/solid/preload"]
```

## Dependencies

The package.json uses `@types/bun` (modern approach) which doesn't require explicitly listing `bun-types` in the tsconfig's `types` array. The types are discovered automatically.

## OpenTUI Configuration

When using `@opentui/solid` for CLI TUI rendering, use these render options:

```typescript
render(
  () => <App />,
  {
    targetFps: 30,           // Balance between smoothness and CPU usage
    gatherStats: false,      // Disable stats gathering for performance
    exitOnCtrlC: false,      // Handle Ctrl+C manually via useKeyboard
    useKittyKeyboard: {},    // Enable Kitty keyboard protocol
  }
);
```

**Critical pattern**: Call `renderer.disableStdoutInterception()` immediately after `useRenderer()` to prevent OpenTUI from capturing stdout, which can interfere with logging.

## Keyboard Handling

**Known Issue**: The `onMount` lifecycle hook in `@opentui/solid` does NOT fire reliably on Windows. Since `useKeyboard` registers its handler inside `onMount`, keyboard events may not work through OpenTUI's native keyboard handling.

**Workaround**: Implement a fallback stdin handler that activates after a timeout if no OpenTUI keyboard events are received:

```typescript
// In src/index.ts
let keyboardWorking = false;
const keyboardTimeout = setTimeout(() => {
  if (!keyboardWorking && process.stdin.isTTY) {
    process.stdin.setRawMode(true);
    process.stdin.resume();
    process.stdin.on("data", (data) => {
      if (keyboardWorking) return; // OpenTUI took over
      const key = data.toString();
      if (key === "q" || key === "\x03") { /* quit */ }
      if (key === "p") { /* pause */ }
    });
  }
}, 5000);

// Pass callback to App to signal when OpenTUI keyboard works
onKeyboardEvent: () => { keyboardWorking = true; clearTimeout(keyboardTimeout); }
```

**Key event typing**: Import `KeyEvent` from `@opentui/core` for proper typing in `useKeyboard` callbacks:

```typescript
import type { KeyEvent } from "@opentui/core";
useKeyboard((e: KeyEvent) => {
  if (e.name === "q" && !e.ctrl && !e.meta) { /* quit */ }
});
```

## Windows-Specific Considerations

1. **Keepalive interval**: Windows may terminate the process prematurely if there's no activity. Use a keepalive interval:
   ```typescript
   const keepalive = setInterval(() => {}, 30000);
   // Clear in finally block: clearInterval(keepalive);
   ```

2. **Defensive requestRender**: Call `renderer.requestRender?.()` after state updates on Windows where automatic redraw can stall.

3. **TTY checks**: Always check `process.stdin.isTTY` before calling `setRawMode(true)`.

4. **Terminal title reset**: Call `renderer.setTerminalTitle("")` before `renderer.destroy()` to reset the window title on exit.

## Local Development & Building

### Building and Installing Locally

**ALWAYS follow this exact sequence when asked to build/install:**

```bash
# 1. Run tests first
bun test

# 2. Build all platform binaries
bun run build

# 3. Install to /usr/local/bin (Linux/macOS)
sudo cp dist/hona-ralph-cli-linux-x64/bin/ralph /usr/local/bin/ralph

# 4. Verify installation
ralph -v
```

**Platform-specific binary paths:**
- Linux x64: `dist/hona-ralph-cli-linux-x64/bin/ralph`
- Linux arm64: `dist/hona-ralph-cli-linux-arm64/bin/ralph`
- macOS x64: `dist/hona-ralph-cli-darwin-x64/bin/ralph`
- macOS arm64: `dist/hona-ralph-cli-darwin-arm64/bin/ralph`
- Windows x64: `dist/hona-ralph-cli-windows-x64/bin/ralph.exe`

### Version Handling

**CRITICAL**: Version is injected at build time via Bun's `define` option, NOT read from package.json at runtime.

In `src/index.ts`:
```typescript
// @ts-expect-error - RALPH_VERSION is replaced at build time
const version: string = RALPH_VERSION;
```

In `scripts/build.ts`:
```typescript
define: {
  RALPH_VERSION: JSON.stringify(version),
},
```

**Never import version from package.json** - it won't work in compiled binaries.

### Version Bumping Workflow

When releasing a new version:

```bash
# 1. Bump version (creates commit automatically if --no-git-tag-version is omitted)
npm version patch --no-git-tag-version

# 2. Commit the version bump
git add package.json
git commit -m "chore: bump version to X.Y.Z"

# 3. Build and install
bun run build
sudo cp dist/hona-ralph-cli-linux-x64/bin/ralph /usr/local/bin/ralph

# 4. Verify
ralph -v

# 5. Push
git push origin master
```

### Common Pitfalls

1. **Stale binary in PATH**: Check `which -a ralph` - there may be an old binary in `~/.bun/bin/ralph` shadowing the new one. Remove it: `rm ~/.bun/bin/ralph`

2. **Shell hash cache**: After installing, run `hash -r` to clear the shell's command cache

3. **Forgetting to rebuild**: The version is baked into the binary at build time. Changing package.json does nothing until you rebuild.

## NPM Publishing

To release a new version to npm, run:

```bash
gh workflow run publish.yml --field bump=patch
```

Options for `bump`:
- `patch` - Bug fixes (0.1.0 -> 0.1.1)
- `minor` - New features (0.1.0 -> 0.2.0)
- `major` - Breaking changes (0.1.0 -> 1.0.0)

The workflow will automatically:
1. Build binaries for all platforms (darwin/linux/windows, arm64/x64)
2. Publish platform-specific packages (`@hona/ralph-cli-{platform}-{arch}`)
3. Publish the main wrapper package (`@hona/ralph-cli`)
