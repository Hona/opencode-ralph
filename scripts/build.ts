#!/usr/bin/env bun
/**
 * Build script for ralph CLI
 * 
 * Uses Bun.build() with the @opentui/solid plugin to properly transform
 * SolidJS JSX and compile into a standalone executable.
 */

import solidPlugin from "@opentui/solid/bun-plugin";

const result = await Bun.build({
  entrypoints: ["./bin/ralph.ts"],
  target: "bun",
  conditions: ["browser"], // Use client-side SolidJS (not SSR) - required for onMount/lifecycle hooks
  tsconfig: "./tsconfig.json",
  minify: false, // Keep readable for debugging
  plugins: [solidPlugin],
  compile: {
    outfile: "./dist/ralph",
    autoloadBunfig: false, // Ignore bunfig.toml in user's CWD (preloads don't work in compiled exes)
    // @ts-expect-error - These options exist at runtime but aren't in the types yet
    autoloadTsconfig: true,
    autoloadPackageJson: true,
  },
});

if (!result.success) {
  console.error("Build failed:");
  for (const log of result.logs) {
    console.error(log);
  }
  process.exit(1);
}

console.log("Build successful!");
for (const output of result.outputs) {
  console.log(`  ${output.path}`);
}
