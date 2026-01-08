# Test Plan for Manual Testing

This file is used to test the `parsePlan()` function in opencode-ralph.

## Test Tasks

- [x] **1** Completed task with uppercase X
- [X] **2** Completed task with lowercase x
- [ ] **3** Incomplete task 1
- [ ] **4** Incomplete task 2
- [ ] **5** Incomplete task 3

## Expected Results

When parsed with `parsePlan()`:
- `done` should be 2 (tasks 1 and 2 are checked)
- `total` should be 5 (2 done + 3 not done)
