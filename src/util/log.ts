/**
 * Debug logging utility for ralph
 * Logs are written to .ralph.log file
 */
import { appendFileSync, writeFileSync, existsSync } from "node:fs";

export const LOG_FILE = ".ralph.log";

let initialized = false;
let memoryLogInterval: ReturnType<typeof setInterval> | null = null;

/**
 * Initialize the log file. Call with reset=true to clear existing logs.
 */
export function initLog(reset: boolean = false): void {
  if (reset || !existsSync(LOG_FILE)) {
    writeFileSync(
      LOG_FILE,
      `=== Ralph Log Started: ${new Date().toISOString()} ===\n`
    );
  } else {
    appendFileSync(
      LOG_FILE,
      `\n=== Ralph Session Resumed: ${new Date().toISOString()} ===\n`
    );
  }
  initialized = true;
}

/**
 * Log a message with timestamp to .ralph.log
 */
export function log(category: string, message: string, data?: unknown): void {
  if (!initialized) {
    initLog(false);
  }

  const timestamp = new Date().toISOString();
  let line = `[${timestamp}] [${category}] ${message}`;
  if (data !== undefined) {
    try {
      line += ` ${JSON.stringify(data)}`;
    } catch {
      line += ` [unstringifiable data]`;
    }
  }

  try {
    appendFileSync(LOG_FILE, line + "\n");
  } catch {
    // Silently fail if we can't write logs
  }
}

/**
 * Format bytes into human readable string (e.g., "123.4 MB")
 */
function formatBytes(bytes: number): string {
  const mb = bytes / (1024 * 1024);
  return `${mb.toFixed(1)} MB`;
}

/**
 * Log current memory usage to .ralph.log
 * Logs heap used, heap total, RSS, and external memory.
 */
export function logMemory(label?: string): void {
  const mem = process.memoryUsage();
  const data = {
    heapUsed: formatBytes(mem.heapUsed),
    heapTotal: formatBytes(mem.heapTotal),
    rss: formatBytes(mem.rss),
    external: formatBytes(mem.external),
  };
  log("memory", label || "Memory usage", data);
}

/**
 * Start periodic memory logging at the specified interval.
 * @param intervalMs Interval in milliseconds between logs (default: 30000 = 30 seconds)
 */
export function startMemoryLogging(intervalMs: number = 30000): void {
  if (memoryLogInterval !== null) {
    return; // Already running
  }
  
  logMemory("Periodic memory logging started");
  memoryLogInterval = setInterval(() => {
    logMemory("Periodic snapshot");
  }, intervalMs);
}

/**
 * Stop periodic memory logging.
 */
export function stopMemoryLogging(): void {
  if (memoryLogInterval !== null) {
    clearInterval(memoryLogInterval);
    memoryLogInterval = null;
    logMemory("Periodic memory logging stopped");
  }
}
