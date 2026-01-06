#!/usr/bin/env bun
/**
 * Cross-platform build script for ralph CLI
 *
 * Builds native executables for all supported platforms using Bun's compile feature.
 * Each platform package gets its own directory with a package.json specifying os/cpu.
 *
 * Usage:
 *   bun run scripts/build.ts          # Build for all platforms
 *   bun run scripts/build.ts --single # Build for current platform only
 */

import solidPlugin from "@opentui/solid/bun-plugin";
import { $ } from "bun";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, "..");

process.chdir(projectRoot);

// Get version from environment or package.json
const pkg = await Bun.file("./package.json").json();
const version = process.env.RALPH_VERSION || pkg.version;

const singleFlag = process.argv.includes("--single");

// All supported build targets
const allTargets: Array<{
  os: "darwin" | "linux" | "win32";
  arch: "arm64" | "x64";
  bunTarget: string;
}> = [
  { os: "darwin", arch: "arm64", bunTarget: "bun-darwin-arm64" },
  { os: "darwin", arch: "x64", bunTarget: "bun-darwin-x64" },
  { os: "linux", arch: "arm64", bunTarget: "bun-linux-arm64" },
  { os: "linux", arch: "x64", bunTarget: "bun-linux-x64" },
  { os: "win32", arch: "x64", bunTarget: "bun-windows-x64" },
];

// Filter to current platform if --single flag is passed
const targets = singleFlag
  ? allTargets.filter(
      (t) => t.os === process.platform && t.arch === process.arch
    )
  : allTargets;

if (targets.length === 0) {
  console.error(
    `No matching target for current platform: ${process.platform}-${process.arch}`
  );
  process.exit(1);
}

// Clean dist directory
await $`rm -rf dist`;

// For cross-platform builds, install platform-specific dependencies for all targets
// @opentui/core has native modules that need to be available for each platform
const skipInstall = process.argv.includes("--skip-install");
if (!singleFlag && !skipInstall) {
  console.log("Installing cross-platform dependencies...");
  const opentuiVersion = pkg.dependencies["@opentui/core"];
  await $`bun install --os="*" --cpu="*" @opentui/core@${opentuiVersion}`;
  console.log("");
}

// Track built binaries for publish script
const binaries: Record<string, string> = {};

for (const target of targets) {
  // Package name follows npm convention: ralph-opencode-{platform}-{arch}
  // Note: win32 becomes "windows" in package name to avoid npm issues
  const platformName = target.os === "win32" ? "windows" : target.os;
  const packageName = `ralph-cli-${platformName}-${target.arch}`;
  const binaryName = target.os === "win32" ? "ralph.exe" : "ralph";

  console.log(`Building ${packageName}...`);

  // Create output directory
  await $`mkdir -p dist/${packageName}/bin`;

  // Build the executable
  const result = await Bun.build({
    entrypoints: ["./bin/ralph.ts"],
    conditions: ["browser"], // Required for SolidJS client-side rendering
    tsconfig: "./tsconfig.json",
    plugins: [solidPlugin],
    sourcemap: "external",
    compile: {
      target: target.bunTarget as any,
      outfile: `dist/${packageName}/bin/${binaryName}`,
      autoloadBunfig: false,
      // @ts-expect-error - These options exist at runtime but aren't in types yet
      autoloadTsconfig: false,
      autoloadPackageJson: true,
    },
    define: {
      RALPH_VERSION: JSON.stringify(version),
    },
  });

  if (!result.success) {
    console.error(`Build failed for ${packageName}:`);
    for (const log of result.logs) {
      console.error(log);
    }
    process.exit(1);
  }

  // Generate platform-specific package.json
  await Bun.file(`dist/${packageName}/package.json`).write(
    JSON.stringify(
      {
        name: packageName,
        version: version,
        os: [target.os],
        cpu: [target.arch],
        preferUnplugged: true,
      },
      null,
      2
    )
  );

  binaries[packageName] = version;
  console.log(`  Built: dist/${packageName}/bin/${binaryName}`);
}

console.log(`\nBuild complete! Built ${Object.keys(binaries).length} packages.`);

// Export binaries map for use by publish script
export { binaries, version };
