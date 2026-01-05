#!/usr/bin/env bun

/*
 * Ralph CLI Entry Point
 * =====================
 * 
 * This entry point works in two modes:
 * 
 * 1. COMPILED MODE (bun build --compile):
 *    - All imports are bundled, no chdir needed
 *    - User's CWD is preserved (ralph runs in their directory)
 * 
 * 2. DEVELOPMENT MODE (bun run bin/ralph.ts):
 *    - Requires bunfig.toml preload for @opentui/solid
 *    - Uses dynamic import
 * 
 * The RALPH_USER_CWD env var stores the user's working directory
 * for both modes, allowing ralph to operate on their project.
 */

// Store the user's current working directory
// This is where ralph will look for tasks, git repo, etc.
process.env.RALPH_USER_CWD = process.cwd();

// Import and run the main entry point
// In compiled mode: this is bundled inline
// In dev mode: this is a dynamic import
import "../src/index.ts";
