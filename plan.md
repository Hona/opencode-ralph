# opencode-ralph Test Suite Implementation Plan

Comprehensive test suite for the Ralph TUI harness using Bun's built-in test runner.

---

## Phase 1: Test Infrastructure Setup

- [x] **1.1** Add `bun:test` script to `package.json`:
  - Add script: `"test": "bun test"`
  - Add script: `"test:watch": "bun test --watch"`
  - Add script: `"test:coverage": "bun test --coverage"`

- [x] **1.2** Create `tests/` directory structure:
  ```
  tests/
  ├── unit/
  │   ├── plan.test.ts
  │   ├── time.test.ts
  │   ├── git.test.ts
  │   ├── state.test.ts
  │   ├── lock.test.ts
  │   └── loop.test.ts
  ├── integration/
  │   └── ralph-flow.test.ts
  └── fixtures/
      └── plans/
          ├── empty.md
          ├── all-complete.md
          ├── partial-complete.md
          └── complex-nested.md
  ```

- [x] **1.3** Create test fixtures for plan parsing:
  - `fixtures/plans/empty.md` - Empty file
  - `fixtures/plans/all-complete.md` - All tasks marked `[x]`
  - `fixtures/plans/partial-complete.md` - Mix of `[x]` and `[ ]`
  - `fixtures/plans/complex-nested.md` - Nested lists, code blocks, edge cases

---

## Phase 2: Unit Tests - Plan Parser (`src/plan.ts`)

- [x] **2.1** Test `parsePlan()` with non-existent file:
  - Should return `{ done: 0, total: 0 }`
  - Verify no error thrown

- [x] **2.2** Test `parsePlan()` with empty file:
  - Should return `{ done: 0, total: 0 }`

- [x] **2.3** Test `parsePlan()` with all completed tasks:
  - Given 5 `- [x]` items
  - Should return `{ done: 5, total: 5 }`

- [ ] **2.4** Test `parsePlan()` with all incomplete tasks:
  - Given 3 `- [ ]` items
  - Should return `{ done: 0, total: 3 }`

- [ ] **2.5** Test `parsePlan()` with mixed task states:
  - Given 3 `- [x]` and 7 `- [ ]` items
  - Should return `{ done: 3, total: 10 }`

- [ ] **2.6** Test `parsePlan()` case insensitivity:
  - Given `- [X]` (uppercase)
  - Should count as completed

- [ ] **2.7** Test `parsePlan()` ignores checkboxes in code blocks:
  - Given markdown with code blocks containing `- [ ]`
  - Should not count code block checkboxes (or document current behavior)

- [ ] **2.8** Test `parsePlan()` handles nested lists:
  - Given nested checkbox items
  - Should count all checkboxes at any nesting level

---

## Phase 3: Unit Tests - Time Utilities (`src/util/time.ts`)

- [ ] **3.1** Test `formatDuration()` for seconds only:
  - `formatDuration(5000)` should return `"5s"`
  - `formatDuration(59000)` should return `"59s"`

- [ ] **3.2** Test `formatDuration()` for minutes and seconds:
  - `formatDuration(90000)` should return `"1m 30s"`
  - `formatDuration(300000)` should return `"5m 0s"`

- [ ] **3.3** Test `formatDuration()` for hours:
  - `formatDuration(3700000)` should return `"1h 1m"`
  - `formatDuration(7200000)` should return `"2h 0m"`

- [ ] **3.4** Test `formatDuration()` edge cases:
  - `formatDuration(0)` should return `"0s"`
  - `formatDuration(999)` should return `"0s"` (rounds down)

- [ ] **3.5** Test `calculateEta()` with empty array:
  - `calculateEta([], 10)` should return `null`

- [ ] **3.6** Test `calculateEta()` with single iteration:
  - `calculateEta([60000], 5)` should return `300000` (5 * 60000)

- [ ] **3.7** Test `calculateEta()` with multiple iterations:
  - `calculateEta([60000, 120000, 90000], 4)` should return `360000` (avg 90000 * 4)

- [ ] **3.8** Test `calculateEta()` with zero remaining tasks:
  - `calculateEta([60000], 0)` should return `0`

- [ ] **3.9** Test `formatEta()` with null:
  - `formatEta(null)` should return `"--:--"`

- [ ] **3.10** Test `formatEta()` with valid duration:
  - `formatEta(300000)` should return `"~5m 0s remaining"`

---

## Phase 4: Unit Tests - State Management (`src/state.ts`)

- [ ] **4.1** Test `loadState()` when file doesn't exist:
  - Should return `null`
  - Should not throw

- [ ] **4.2** Test `loadState()` with valid state file:
  - Create state file with valid JSON
  - Should return parsed `PersistedState`

- [ ] **4.3** Test `saveState()` creates valid JSON:
  - Save state, read file, verify valid JSON structure
  - Verify all fields present: `startTime`, `initialCommitHash`, `iterationTimes`, `planFile`

- [ ] **4.4** Test `saveState()` overwrites existing state:
  - Save state twice with different values
  - Verify second state is what's persisted

- [ ] **4.5** Test state roundtrip:
  - Create state, save it, load it
  - Verify loaded state matches original

---

## Phase 5: Unit Tests - Lock File (`src/lock.ts`)

- [ ] **5.1** Test `acquireLock()` when no lock exists:
  - Should return `true`
  - Should create `.ralph-lock` file with current PID

- [ ] **5.2** Test `acquireLock()` when lock held by current process:
  - Acquire lock
  - Try to acquire again
  - Should return `false` (same PID, process exists)

- [ ] **5.3** Test `acquireLock()` with stale lock (dead PID):
  - Write lock file with non-existent PID
  - Should return `true` (stale lock overwritten)

- [ ] **5.4** Test `releaseLock()` removes lock file:
  - Acquire lock
  - Release lock
  - Verify `.ralph-lock` file deleted

- [ ] **5.5** Test `releaseLock()` when no lock exists:
  - Should not throw
  - Should complete successfully

---

## Phase 6: Unit Tests - Git Utilities (`src/git.ts`)

- [ ] **6.1** Test `getHeadHash()` returns valid hash:
  - Should return 40-character hex string
  - Should match `git rev-parse HEAD` output

- [ ] **6.2** Test `getCommitsSince()` with current HEAD:
  - `getCommitsSince(currentHead)` should return `0`

- [ ] **6.3** Test `getCommitsSince()` with ancestor commit:
  - Get HEAD~5 hash
  - `getCommitsSince(headMinus5)` should return `5`

- [ ] **6.4** Test `getCommitsSince()` with invalid hash:
  - Should return `0` or handle gracefully

---

## Phase 7: Unit Tests - Loop Logic (`src/loop.ts`)

- [ ] **7.1** Test `buildPrompt()` template substitution:
  - Given `{plan}` in template
  - Should replace with `options.planFile`
  - Multiple `{plan}` occurrences should all be replaced

- [ ] **7.2** Test `buildPrompt()` with custom prompt:
  - Given custom `options.prompt`
  - Should use custom prompt instead of default

- [ ] **7.3** Test `buildPrompt()` with default prompt:
  - Given no `options.prompt`
  - Should use `DEFAULT_PROMPT`

- [ ] **7.4** Test `parseModel()` with valid format:
  - `parseModel("anthropic/claude-opus-4")` should return `{ providerID: "anthropic", modelID: "claude-opus-4" }`

- [ ] **7.5** Test `parseModel()` with opencode provider:
  - `parseModel("opencode/claude-opus-4-5")` should return `{ providerID: "opencode", modelID: "claude-opus-4-5" }`

- [ ] **7.6** Test `parseModel()` with invalid format:
  - `parseModel("invalid-no-slash")` should throw with descriptive error

- [ ] **7.7** Test `parseModel()` with multiple slashes:
  - `parseModel("provider/model/version")` should return `{ providerID: "provider", modelID: "model/version" }`

---

## Phase 8: Integration Tests

- [ ] **8.1** Test complete Ralph iteration cycle (mocked):
  - Mock `createOpencodeServer` and `createOpencodeClient`
  - Verify callbacks called in correct order:
    1. `onIterationStart`
    2. `onEvent` (separator)
    3. `onTasksUpdated`
    4. `onEvent` (tool events)
    5. `onIterationComplete`
    6. `onCommitsUpdated`

- [ ] **8.2** Test pause/resume flow:
  - Create `.ralph-pause` file during loop
  - Verify `onPause` callback called
  - Delete `.ralph-pause` file
  - Verify `onResume` callback called

- [ ] **8.3** Test completion detection:
  - Create `.ralph-done` file during loop
  - Verify `onComplete` callback called
  - Verify loop exits cleanly

- [ ] **8.4** Test abort signal handling:
  - Start loop with AbortController
  - Call `abort()` mid-iteration
  - Verify loop exits without error

- [ ] **8.5** Test state persistence across iterations:
  - Run mock iteration
  - Verify `iterationTimes` array updated
  - Verify state file written with correct values

---

## Phase 9: Test Utilities and Cleanup

- [ ] **9.1** Create test helper for temporary files:
  - Function to create temp directory for test fixtures
  - Automatic cleanup after tests

- [ ] **9.2** Create mock factories for common types:
  - `createMockPersistedState(overrides?)`
  - `createMockLoopOptions(overrides?)`
  - `createMockToolEvent(overrides?)`

- [ ] **9.3** Add test cleanup in `afterEach`:
  - Remove `.ralph-lock`, `.ralph-pause`, `.ralph-done`, `.ralph-state.json`
  - Reset any global state

- [ ] **9.4** Remove legacy ad-hoc test files:
  - Delete `test-parse-plan.ts`
  - Delete `test-state-persistence.ts`
  - Delete `test-pause-functionality.ts`
  - Delete `test-completion-flow.ts`

---

## Phase 10: Documentation and CI

- [ ] **10.1** Update README.md with testing instructions:
  - How to run tests: `bun test`
  - How to run with coverage: `bun test --coverage`
  - How to run in watch mode: `bun test --watch`

- [ ] **10.2** Document test structure in README:
  - Explain `tests/unit/` vs `tests/integration/`
  - Explain fixture usage

- [ ] **10.3** Add pre-commit hook for tests (optional):
  - Run `bun test` before commits
  - Or document how to add with husky/lint-staged

---

## Reference: Bun Test API

```typescript
import { describe, it, expect, beforeEach, afterEach, mock } from "bun:test";

describe("module", () => {
  beforeEach(() => {
    // Setup
  });

  afterEach(() => {
    // Cleanup
  });

  it("should do something", () => {
    expect(actual).toBe(expected);
  });

  it("should handle async", async () => {
    const result = await asyncFunction();
    expect(result).toEqual({ key: "value" });
  });
});

// Mocking
const mockFn = mock(() => "mocked");
expect(mockFn).toHaveBeenCalled();
```

## Reference: Test File Naming

- Unit tests: `*.test.ts`
- Integration tests: `*.test.ts` (in integration folder)
- Fixtures: Plain files in `fixtures/` directory
