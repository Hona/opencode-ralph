# Performance Fix Plan

Fix TUI freezing caused by memory leak and excessive CPU usage.

## Problem Summary

- Process consumes 99.4% CPU and 5.5GB memory after ~19 iterations
- Unbounded event array grows indefinitely, never trimmed
- OpenTUI creates new TextBuffers on every render cycle
- 30fps render + 80ms spinner + growing event list = allocation thrashing

---

## Phase 1: Event List Memory Management

- [x] Add `MAX_EVENTS` constant to `src/state.ts` (e.g., 200)
- [ ] Update `onEvent` callback in `src/index.ts` to slice events array to keep only last `MAX_EVENTS`
- [ ] Add unit test in `tests/unit/state.test.ts` to verify event trimming behavior
- [ ] Verify memory usage stays bounded after 20+ iterations

## Phase 2: Reduce Render Frequency

- [ ] Lower `targetFps` from 30 to 15 in `src/app.tsx` render options
- [ ] Increase spinner interval from 80ms to 120ms in `src/components/log.tsx`
- [ ] Increase elapsed time update interval from 1000ms to 2000ms in `src/app.tsx`
- [ ] Verify spinner still appears smooth at 120ms interval

## Phase 3: Optimize Event List Rendering

- [ ] Extract event item key function in `src/components/log.tsx` to use stable keys (e.g., `${iteration}-${timestamp}`)
- [ ] Wrap `ToolEventItem` component with memoization to prevent re-renders of unchanged items
- [ ] Wrap `SeparatorEvent` component with memoization to prevent re-renders of unchanged items
- [ ] Add `index` prop to `<For>` loop for stable keying

## Phase 4: Batch State Updates

- [ ] Create `batchStateUpdate` helper function in `src/index.ts` to coalesce rapid state changes
- [ ] Debounce `onEvent` callback to batch events arriving within 50ms window
- [ ] Debounce `onDiffUpdated` and `onCommitsUpdated` callbacks (these can lag slightly)
- [ ] Ensure `onIterationStart` and `onIterationComplete` remain unbatched (user needs immediate feedback)

## Phase 5: Idle Mode Optimization

- [ ] Add `isIdle` state flag to `LoopState` in `src/state.ts`
- [ ] Set `isIdle: true` when waiting for LLM response (after prompt sent, before events arrive)
- [ ] Set `isIdle: false` when tool events start arriving
- [ ] Skip elapsed timer updates when `isIdle: true` (reduce unnecessary re-renders)
- [ ] Only animate spinner when `isIdle: false` (static spinner during idle waits)

## Phase 6: Scrollbox Optimization

- [ ] Investigate OpenTUI scrollbox `stickyScroll` performance with large content
- [ ] Consider adding `overflow="hidden"` and manual scroll position management
- [ ] Test if disabling scrollbar reduces TextBuffer allocations
- [ ] Profile before/after to measure improvement

## Phase 7: Memory Profiling & Validation

- [ ] Add memory usage logging to `src/util/log.ts` (log `process.memoryUsage()` periodically)
- [ ] Create integration test that runs 50 mock iterations and asserts memory stays under 500MB
- [ ] Document expected memory footprint in README.md
- [ ] Add `--profile` CLI flag to enable verbose performance logging

## Phase 8: Cleanup & Documentation

- [ ] Remove any unused imports introduced during optimization
- [ ] Add code comments explaining performance-critical sections
- [ ] Update README.md with performance characteristics and known limitations
- [ ] Run full test suite to ensure no regressions
