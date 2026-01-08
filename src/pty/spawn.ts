import type { PtyProcess, PtyOptions } from "./types";
import { log } from "../util/log";

export function spawnPty(command: string[], options: PtyOptions = {}): PtyProcess {
  const { cols = 80, rows = 24, cwd = process.cwd(), env = {} } = options;

  const dataCallbacks: Array<(data: string) => void> = [];
  const exitCallbacks: Array<(info: { exitCode: number; signal?: number }) => void> = [];
  let isCleanedUp = false;

  const proc = Bun.spawn(command, {
    cwd,
    env: { ...process.env, ...env, TERM: "xterm-256color", COLUMNS: String(cols), LINES: String(rows) },
    stdin: "pty",
    stdout: "pipe",
    stderr: "pipe",
  });

  const decoder = new TextDecoder();

  const pushData = (data: string) => {
    if (isCleanedUp) return;
    for (const cb of dataCallbacks) {
      cb(data);
    }
  };

  const readStream = async (stream: ReadableStream<Uint8Array> | null | undefined, label: string) => {
    if (!stream) return;
    const reader = stream.getReader();
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        const text = decoder.decode(value, { stream: true });
        if (text) {
          pushData(text);
        }
      }
    } catch (error) {
      log("pty", `${label} read error`, { error: String(error) });
    }
  };

  readStream(proc.stdout, "stdout");
  readStream(proc.stderr, "stderr");

  proc.exited.then((exitCode) => {
    for (const cb of exitCallbacks) {
      cb({ exitCode });
    }
  });

  return {
    write: (data: string) => {
      if (isCleanedUp) return;
      try {
        proc.stdin.write(data);
      } catch (error) {
        log("pty", "stdin write error", { error: String(error) });
      }
    },
    resize: (newCols: number, newRows: number) => {
      const stdinAny = proc.stdin as unknown as { resize?: (c: number, r: number) => void };
      if (typeof stdinAny.resize === "function") {
        stdinAny.resize(newCols, newRows);
      } else {
        log("pty", "resize requested but not supported", { cols: newCols, rows: newRows });
      }
    },
    kill: () => {
      if (isCleanedUp) return;
      try {
        proc.kill();
      } catch (error) {
        log("pty", "kill error", { error: String(error) });
      }
    },
    onData: (callback) => {
      dataCallbacks.push(callback);
    },
    onExit: (callback) => {
      exitCallbacks.push(callback);
    },
    pid: proc.pid,
    cleanup: () => {
      if (isCleanedUp) return;
      isCleanedUp = true;
      try {
        proc.kill();
      } catch {
        // Process may already be dead
      }
    },
  };
}
