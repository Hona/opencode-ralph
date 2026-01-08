/**
 * Configuration persistence module for Ralph.
 * Handles reading and writing user preferences to ~/.config/ralph/config.json
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync } from "fs";
import { join, dirname } from "path";
import { homedir } from "os";

/**
 * Ralph configuration schema.
 * This extends the RalphConfig type used for CLI defaults.
 */
export interface RalphConfig {
  // CLI defaults (also used by index.ts loadGlobalConfig)
  adapter?: string;
  model?: string;
  plan?: string;
  prompt?: string;
  promptFile?: string;
  server?: string;
  serverTimeout?: number;
  agent?: string;
  headless?: boolean;
  format?: string;
  timestamps?: boolean;
  yes?: boolean;
  autoReset?: boolean;
  maxIterations?: number;
  maxTime?: number;

  // Terminal launcher preferences
  /** Name of the preferred terminal (must match KnownTerminal.name) */
  preferredTerminal?: string;
  /** Custom terminal command with {cmd} placeholder for attach command */
  customTerminalCommand?: string;
}

/**
 * Path to the Ralph configuration file.
 */
export const CONFIG_PATH = join(homedir(), ".config", "ralph", "config.json");

/**
 * Load the Ralph configuration from disk.
 * Returns an empty config object if the file doesn't exist or is invalid.
 */
export function loadConfig(): RalphConfig {
  if (!existsSync(CONFIG_PATH)) {
    return {};
  }

  try {
    const content = readFileSync(CONFIG_PATH, "utf-8");
    return JSON.parse(content) as RalphConfig;
  } catch {
    // Silently ignore invalid config (malformed JSON, etc.)
    return {};
  }
}

/**
 * Save the Ralph configuration to disk.
 * Creates the config directory if it doesn't exist.
 *
 * @param config - The configuration object to save
 */
export function saveConfig(config: RalphConfig): void {
  const configDir = dirname(CONFIG_PATH);

  // Ensure config directory exists
  if (!existsSync(configDir)) {
    mkdirSync(configDir, { recursive: true });
  }

  // Write config with pretty formatting
  writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2), "utf-8");
}

/**
 * Update specific fields in the config while preserving others.
 * Convenience wrapper around loadConfig + saveConfig.
 *
 * @param updates - Partial config object with fields to update
 */
export function updateConfig(updates: Partial<RalphConfig>): void {
  const existing = loadConfig();
  const merged = { ...existing, ...updates };
  saveConfig(merged);
}

/**
 * Get the preferred terminal name from config.
 * Returns undefined if not set.
 */
export function getPreferredTerminal(): string | undefined {
  const config = loadConfig();
  return config.preferredTerminal;
}

/**
 * Set the preferred terminal name in config.
 *
 * @param terminalName - Name of the terminal (must match KnownTerminal.name)
 */
export function setPreferredTerminal(terminalName: string): void {
  updateConfig({ preferredTerminal: terminalName });
}

/**
 * Get the custom terminal command from config.
 * Returns undefined if not set.
 */
export function getCustomTerminalCommand(): string | undefined {
  const config = loadConfig();
  return config.customTerminalCommand;
}

/**
 * Set a custom terminal command in config.
 * The command should include {cmd} as a placeholder for the attach command.
 *
 * @param command - Custom terminal command with {cmd} placeholder
 */
export function setCustomTerminalCommand(command: string): void {
  updateConfig({ customTerminalCommand: command });
}

/**
 * Clear terminal preferences (both preferred terminal and custom command).
 */
export function clearTerminalPreferences(): void {
  const config = loadConfig();
  delete config.preferredTerminal;
  delete config.customTerminalCommand;
  saveConfig(config);
}
