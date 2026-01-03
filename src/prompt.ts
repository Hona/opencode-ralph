/**
 * Pre-TUI confirmation prompts using raw mode for single character input.
 */

/**
 * Prompt user for y/n confirmation.
 * @param message - The message to display before (y/n)
 * @returns Promise<boolean> - true if 'y' or 'Y', false otherwise
 */
export async function confirm(message: string): Promise<boolean> {
  // Print prompt without newline
  process.stdout.write(`${message} (y/n) `);

  // Enable raw mode for single character input
  if (process.stdin.isTTY) {
    process.stdin.setRawMode(true);
  }
  process.stdin.resume();

  return new Promise<boolean>((resolve) => {
    const onData = (data: Buffer) => {
      const char = data.toString();

      // Restore terminal state
      if (process.stdin.isTTY) {
        process.stdin.setRawMode(false);
      }
      process.stdin.pause();
      process.stdin.removeListener("data", onData);

      // Print the character and newline for feedback
      process.stdout.write(char + "\n");

      // Handle Ctrl+C
      if (char === "\x03") {
        process.exit(1);
      }

      // Return true for y/Y, false otherwise
      resolve(char.toLowerCase() === "y");
    };

    process.stdin.on("data", onData);
  });
}
