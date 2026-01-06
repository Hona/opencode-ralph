#!/usr/bin/env bun
/**
 * Publish script for ralph-opencode
 *
 * Builds all platform binaries and publishes them to npm along with the main wrapper package.
 *
 * Environment variables:
 *   RALPH_BUMP=patch|minor|major  - Bump version from latest npm release
 *   RALPH_VERSION=x.y.z           - Use explicit version
 *   (none)                        - Preview release: 0.0.0-{branch}-{timestamp}
 *
 * The script will:
 * 1. Determine version (from env or npm registry)
 * 2. Build all platform binaries
 * 3. Smoke test the current platform binary
 * 4. Create the main wrapper package
 * 5. Publish all packages to npm
 */

import { $ } from "bun";
import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, "..");

process.chdir(projectRoot);

const pkg = await Bun.file("./package.json").json();
const PACKAGE_NAME = "ralph-cli";

// Determine channel and version
const env = {
  RALPH_BUMP: process.env.RALPH_BUMP,
  RALPH_VERSION: process.env.RALPH_VERSION,
};

const channel = await (async () => {
  if (env.RALPH_BUMP) return "latest";
  if (env.RALPH_VERSION && !env.RALPH_VERSION.startsWith("0.0.0-"))
    return "latest";
  // Preview release - use branch name
  try {
    return await $`git branch --show-current`.text().then((x) => x.trim()) || "dev";
  } catch {
    return "dev";
  }
})();

const isPreview = channel !== "latest";

const version = await (async () => {
  if (env.RALPH_VERSION) return env.RALPH_VERSION;

  if (isPreview) {
    // Preview version: 0.0.0-{branch}-{timestamp}
    const timestamp = new Date()
      .toISOString()
      .slice(0, 16)
      .replace(/[-:T]/g, "");
    return `0.0.0-${channel}-${timestamp}`;
  }

  // Production release - fetch current version from npm and bump
  let currentVersion = "0.0.0";
  try {
    const res = await fetch(`https://registry.npmjs.org/${PACKAGE_NAME}/latest`);
    if (res.ok) {
      const data = (await res.json()) as { version: string };
      currentVersion = data.version;
    }
  } catch {
    // Package doesn't exist yet, start at 0.1.0
    currentVersion = "0.0.0";
  }

  const [major, minor, patch] = currentVersion.split(".").map((x) => Number(x) || 0);
  const bump = env.RALPH_BUMP?.toLowerCase();

  if (bump === "major") return `${major + 1}.0.0`;
  if (bump === "minor") return `${major}.${minor + 1}.0`;
  // Default to patch bump, but if starting fresh use 0.1.0
  if (currentVersion === "0.0.0") return "0.1.0";
  return `${major}.${minor}.${patch + 1}`;
})();

const tag = isPreview ? channel : "latest";

console.log("=== ralph-opencode publish ===");
console.log(`  Version: ${version}`);
console.log(`  Channel: ${channel}`);
console.log(`  Tag: ${tag}`);
console.log(`  Preview: ${isPreview}`);
console.log("");

// Set version in environment for build script
process.env.RALPH_VERSION = version;

// Run build
console.log("=== Building all platforms ===\n");
const { binaries } = await import("./build.ts");

// Smoke test current platform binary
const platformName = process.platform === "win32" ? "windows" : process.platform;
const currentPlatformPkg = `ralph-cli-${platformName}-${process.arch}`;
const binaryName = process.platform === "win32" ? "ralph.exe" : "ralph";
const binaryPath = `./dist/${currentPlatformPkg}/bin/${binaryName}`;

if (fs.existsSync(binaryPath)) {
  console.log(`\n=== Smoke test: ${currentPlatformPkg} ===`);
  try {
    // Just test that the binary runs (--help should work)
    await $`${binaryPath} --help`;
    console.log("Smoke test passed!\n");
  } catch (e) {
    console.error("Smoke test failed:", e);
    process.exit(1);
  }
} else {
  console.log(`\nSkipping smoke test (no binary for current platform: ${currentPlatformPkg})\n`);
}

// Create main wrapper package
console.log("=== Creating main package ===\n");
await $`mkdir -p ./dist/${PACKAGE_NAME}/bin`;

// Copy JS launcher
await $`cp ./bin/ralph ./dist/${PACKAGE_NAME}/bin/ralph`;

// Copy postinstall script
await $`cp ./scripts/postinstall.mjs ./dist/${PACKAGE_NAME}/postinstall.mjs`;

// Generate main package.json with optionalDependencies
const mainPackageJson = {
  name: PACKAGE_NAME,
  version: version,
  description: "Ralph - AI coding assistant CLI",
  bin: {
    ralph: "./bin/ralph",
  },
  scripts: {
    postinstall: "node ./postinstall.mjs",
  },
  optionalDependencies: binaries,
  repository: {
    type: "git",
    url: "git+https://github.com/hona/opencode-ralph.git",
  },
  keywords: ["cli", "ai", "coding", "assistant"],
  license: "MIT",
};

await Bun.file(`./dist/${PACKAGE_NAME}/package.json`).write(
  JSON.stringify(mainPackageJson, null, 2)
);

console.log(`Created dist/${PACKAGE_NAME}/package.json`);
console.log(`  optionalDependencies: ${Object.keys(binaries).join(", ")}\n`);

// Publish platform packages
console.log("=== Publishing platform packages ===\n");
for (const [name] of Object.entries(binaries)) {
  const pkgDir = `./dist/${name}`;

  // Set executable permissions on Unix
  if (process.platform !== "win32") {
    await $`chmod -R 755 ${pkgDir}`;
  }

  console.log(`Publishing ${name}@${version}...`);
  await $`bun pm pack`.cwd(pkgDir);
  await $`npm publish *.tgz --access public --tag ${tag}`.cwd(pkgDir);
  console.log(`  Published ${name}@${version}\n`);
}

// Publish main package
console.log("=== Publishing main package ===\n");
const mainPkgDir = `./dist/${PACKAGE_NAME}`;
await $`bun pm pack`.cwd(mainPkgDir);
await $`npm publish *.tgz --access public --tag ${tag}`.cwd(mainPkgDir);
console.log(`Published ${PACKAGE_NAME}@${version}\n`);

console.log("=== Publish complete ===");
console.log(`\nInstall with: npm install -g ${PACKAGE_NAME}${isPreview ? `@${tag}` : ""}`);
