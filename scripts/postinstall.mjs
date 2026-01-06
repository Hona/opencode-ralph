#!/usr/bin/env node
/**
 * Postinstall script for ralph-opencode
 *
 * This script runs after `npm install ralph-opencode` and symlinks the
 * platform-specific binary to the bin directory.
 *
 * On Windows, npm handles the .exe directly so we skip symlinking.
 */

import fs from "fs";
import path from "path";
import os from "os";
import { fileURLToPath } from "url";
import { createRequire } from "module";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);

/**
 * Detect the current platform and architecture
 */
function detectPlatformAndArch() {
  let platform;
  switch (os.platform()) {
    case "darwin":
      platform = "darwin";
      break;
    case "linux":
      platform = "linux";
      break;
    case "win32":
      platform = "windows";
      break;
    default:
      platform = os.platform();
      break;
  }

  let arch;
  switch (os.arch()) {
    case "x64":
      arch = "x64";
      break;
    case "arm64":
      arch = "arm64";
      break;
    default:
      arch = os.arch();
      break;
  }

  return { platform, arch };
}

/**
 * Find the platform-specific binary package
 */
function findBinary() {
  const { platform, arch } = detectPlatformAndArch();
  const packageName = `ralph-cli-${platform}-${arch}`;
  const binaryName = platform === "windows" ? "ralph.exe" : "ralph";

  try {
    // Use require.resolve to find the package
    const packageJsonPath = require.resolve(`${packageName}/package.json`);
    const packageDir = path.dirname(packageJsonPath);
    const binaryPath = path.join(packageDir, "bin", binaryName);

    if (!fs.existsSync(binaryPath)) {
      throw new Error(`Binary not found at ${binaryPath}`);
    }

    return { binaryPath, binaryName, packageName };
  } catch (error) {
    throw new Error(`Could not find package ${packageName}: ${error.message}`);
  }
}

/**
 * Prepare the bin directory and return paths
 */
function prepareBinDirectory(binaryName) {
  const binDir = path.join(__dirname, "bin");
  const targetPath = path.join(binDir, binaryName);

  // Ensure bin directory exists
  if (!fs.existsSync(binDir)) {
    fs.mkdirSync(binDir, { recursive: true });
  }

  // Remove existing binary/symlink if it exists
  if (fs.existsSync(targetPath)) {
    fs.unlinkSync(targetPath);
  }

  return { binDir, targetPath };
}

/**
 * Create symlink to the platform binary
 */
function symlinkBinary(sourcePath, binaryName) {
  const { targetPath } = prepareBinDirectory(binaryName);

  fs.symlinkSync(sourcePath, targetPath);
  console.log(`ralph binary symlinked: ${targetPath} -> ${sourcePath}`);

  // Verify the file exists after operation
  if (!fs.existsSync(targetPath)) {
    throw new Error(`Failed to symlink binary to ${targetPath}`);
  }
}

/**
 * Main function
 */
async function main() {
  try {
    // On Windows, npm handles the .exe directly via the bin field
    // No postinstall symlinking needed
    if (os.platform() === "win32") {
      console.log(
        "Windows detected: binary setup not needed (using packaged .exe)"
      );
      return;
    }

    const { binaryPath, binaryName, packageName } = findBinary();
    console.log(`Found ${packageName} at ${binaryPath}`);
    symlinkBinary(binaryPath, binaryName);
  } catch (error) {
    console.error("Failed to setup ralph binary:", error.message);
    // Don't fail the install - the JS launcher will handle finding the binary
    process.exit(0);
  }
}

try {
  main();
} catch (error) {
  console.error("Postinstall script error:", error.message);
  // Exit gracefully - don't break npm install
  process.exit(0);
}
