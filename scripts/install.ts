#!/usr/bin/env bun
/**
 * Install script for ralph CLI
 * 
 * Copies the compiled executable to Bun's global bin directory (~/.bun/bin)
 * so it's available in PATH without manual configuration.
 */

import { $ } from "bun";
import { copyFileSync, existsSync } from "node:fs";
import { join } from "node:path";

const isWindows = process.platform === "win32";
const exeName = isWindows ? "ralph.exe" : "ralph";

// Get paths
const projectRoot = join(import.meta.dir, "..");
const source = join(projectRoot, "dist", exeName);

// Get Bun's global bin directory
const globalBin = (await $`bun pm bin -g`.text()).trim();
const dest = join(globalBin, exeName);

// Verify source exists
if (!existsSync(source)) {
  console.error(`Error: Compiled executable not found at ${source}`);
  console.error("Run 'bun run build' first.");
  process.exit(1);
}

// Copy executable
try {
  copyFileSync(source, dest);
  console.log(`Installed ralph to ${dest}`);
} catch (error) {
  if ((error as NodeJS.ErrnoException).code === "EACCES") {
    console.error(`Error: Permission denied writing to ${dest}`);
    console.error("Try running with elevated permissions.");
  } else {
    throw error;
  }
  process.exit(1);
}

// Verify it's in PATH by checking if globalBin is accessible
const pathDirs = (process.env.PATH || "").split(isWindows ? ";" : ":");
const inPath = pathDirs.some(dir => dir.toLowerCase() === globalBin.toLowerCase());

if (!inPath) {
  console.warn(`\nWarning: ${globalBin} is not in your PATH.`);
  console.warn("Add it to your PATH to use 'ralph' from anywhere.");
}
