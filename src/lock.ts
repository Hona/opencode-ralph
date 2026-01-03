export const LOCK_FILE = ".ralph-lock";

/**
 * Attempts to acquire the lock file.
 * Returns true if lock was acquired, false if another instance is running.
 */
export async function acquireLock(): Promise<boolean> {
  const file = Bun.file(LOCK_FILE);
  const exists = await file.exists();

  if (exists) {
    // Read the PID from the lock file
    const content = await file.text();
    const pid = parseInt(content.trim(), 10);

    if (!isNaN(pid)) {
      // Check if the process is still running using signal 0
      try {
        process.kill(pid, 0);
        // Process exists, lock is held by another instance
        return false;
      } catch {
        // Process doesn't exist, lock is stale - continue to acquire
      }
    }
  }

  // Write current PID to lock file
  await Bun.write(LOCK_FILE, String(process.pid));
  return true;
}

/**
 * Releases the lock file if it exists.
 */
export async function releaseLock(): Promise<void> {
  const file = Bun.file(LOCK_FILE);
  const exists = await file.exists();

  if (exists) {
    await file.delete();
  }
}
