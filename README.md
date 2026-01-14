# ralph

AI agent loop for autonomous task execution. Reads a plan, picks one task, completes it, commits, repeats.

<img width="1714" height="1076" alt="image" src="https://github.com/user-attachments/assets/3dd85500-0164-44cd-8917-dfcbe787c09f" />

## Quick Start

```bash
# Install stable release
bun install -g @hona/ralph-cli

# Or install dev snapshot (latest from dev branch)
bun install -g @hona/ralph-cli@dev

# Run in any project directory
ralph
```

### Install from Source

```bash
git clone https://github.com/hona/opencode-ralph.git
cd opencode-ralph
bun install
bun run build:single  # compiles for current platform
```

## What is Ralph?

Ralph-driven development forces an AI agent to re-read full context every iteration, eliminating context drift. Each loop:

1. Read `plan.md`
2. Pick ONE task
3. Complete it
4. Commit (updating the plan in the same commit)
5. Repeat until done

The agent never pushes—only commits—so you maintain review control.

**Why it works:**
- Deterministic failures are debuggable. When Ralph fails, fix the prompt.
- `AGENTS.md` accumulates wisdom so future iterations don't rediscover fire.
- Human review checkpoint before anything goes live.

See: [ghuntley.com/ralph](https://ghuntley.com/ralph/) · [lukeparker.dev/stop-chatting-with-ai-start-loops-ralph-driven-development](https://lukeparker.dev/stop-chatting-with-ai-start-loops-ralph-driven-development)

## Usage

```bash
ralph                              # uses plan.md in current directory
ralph --plan BACKLOG.md            # different plan file
ralph --model anthropic/claude-opus-4  # different model
ralph --model openai/gpt-5.2-codex --variant xhigh  # model + variant
ralph --reset                      # start fresh, ignore previous state
```

| Option | Default | Description |
|--------|---------|-------------|
| `--plan, -p` | `plan.md` | Plan file path |
| `--model, -m` | `opencode/claude-opus-4-5` | Model (provider/model format) |
| `--variant` | `none` | Model variant (must exist in OpenCode config) |
| `--prompt` | see below | Custom prompt (`{plan}` placeholder) |
| `--reset, -r` | `false` | Reset state |

**Default prompt:**
```
READ all of {plan}. Pick ONE task. If needed, verify via web/code search (this applies to packages, knowledge, deterministic data - NEVER VERIFY EDIT TOOLS WORKED OR THAT YOU COMMITED SOMETHING. BE PRAGMATIC ABOUT EVERYTHING). Complete task. Commit change (update the plan.md in the same commit). ONLY do one task unless GLARINGLY OBVIOUS steps should run together. Update {plan}. If you learn a critical operational detail, update AGENTS.md. When ALL tasks complete, create .ralph-done and exit. NEVER GIT PUSH. ONLY COMMIT.
```

## Keybindings

| Key | Action |
|-----|--------|
| `p` | Pause/resume |
| `q` / `Ctrl+C` | Quit |

## Files

| File | Purpose |
|------|---------|
| `.ralph-state.json` | Persisted state for resume after Ctrl+C |
| `.ralph-lock` | Prevents multiple instances |
| `.ralph-done` | Agent creates this when all tasks complete |
| `.ralph-pause` | Created by `p` key to pause loop |

Add to `.gitignore`:
```
.ralph-*
```

## Architecture

```
src/
├── index.ts      # CLI entry, wires TUI to loop
├── loop.ts       # Main agent loop (prompt → events → commit)
├── app.tsx       # Solid.js TUI root component
├── state.ts      # State types and persistence
├── plan.ts       # Plan file parser (checkbox counting)
├── git.ts        # Git operations (hash, diff, commits)
├── lock.ts       # Lock file management
├── prompt.ts     # User confirmation prompts
├── components/   # TUI components (header, log, footer)
└── util/         # Helpers (time formatting, logging)
```

**Data flow:** `index.ts` starts the TUI (`app.tsx`) and the loop (`loop.ts`) in parallel. The loop sends callbacks to update TUI state. State persists to `.ralph-state.json` for resume capability.

## Writing Plans

The plan is everything. Invest time here.

```markdown
# Project Plan

## Phase 1: Setup
- [ ] Initialize project with bun init
- [ ] Add TypeScript configuration
- [ ] Create src/index.ts entry point

## Phase 2: Core Features
- [ ] Implement user authentication
- [ ] Add database connection
```

**Guidelines:**
- Small, isolated tasks—one commit each
- Chronological order (dependencies first)
- Use `- [ ]` checkboxes (Ralph parses these)
- 1000+ lines is normal; more detail = fewer hallucinations

## AGENTS.md

Ralph writes operational learnings here. Future iterations read it.

```markdown
# AGENTS.md

## Build
- Run `bun install` before `bun run dev`

## Pitfalls
- Never import from `solid-js`, use `@opentui/solid`
```

When Ralph makes a mistake, add a sign to prevent it recurring.

## Testing

```bash
bun test              # run all tests
bun test --watch      # watch mode
bun test --coverage   # with coverage
```

```
tests/
├── unit/         # Module isolation tests
├── integration/  # Full workflow tests
├── fixtures/     # Test plan files
└── helpers/      # Mock factories, temp file utils
```

## Requirements

- [Bun](https://bun.sh) v1.0+
- [OpenCode](https://opencode.ai) CLI running

## License

MIT
