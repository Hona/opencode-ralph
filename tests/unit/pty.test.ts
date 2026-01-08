import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { spawnPty } from "../../src/pty/spawn";

describe("spawnPty", () => {
  let originalSpawn: typeof Bun.spawn;

  beforeEach(() => {
    originalSpawn = Bun.spawn;
  });

  afterEach(() => {
    Bun.spawn = originalSpawn;
  });

  it("spawns with PTY settings and drains output", async () => {
    let capturedOptions: any;
    const outputChunks: string[] = [];

    const stdoutStream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new TextEncoder().encode("out"));
        controller.close();
      },
    });

    const stderrStream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new TextEncoder().encode("err"));
        controller.close();
      },
    });

    Bun.spawn = ((command: string[], options: any) => {
      capturedOptions = options;
      return {
        stdout: stdoutStream,
        stderr: stderrStream,
        stdin: { write: (_data: string) => {} },
        pid: 123,
        kill: () => {},
        exited: Promise.resolve(0),
      } as any;
    }) as any;

    const pty = spawnPty(["echo", "hi"], {
      cols: 100,
      rows: 40,
      cwd: "/tmp",
      env: { FOO: "bar" },
    });

    pty.onData((data) => outputChunks.push(data));

    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(capturedOptions.stdin).toBe("pty");
    expect(capturedOptions.env.TERM).toBe("xterm-256color");
    expect(capturedOptions.env.COLUMNS).toBe("100");
    expect(capturedOptions.env.LINES).toBe("40");
    expect(outputChunks.join("")).toBe("outerr");
  });
});
