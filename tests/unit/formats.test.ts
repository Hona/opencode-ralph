import { describe, it, expect } from "bun:test";
import { createJsonFormatter } from "../../src/formats/json";
import { createJsonlFormatter } from "../../src/formats/jsonl";
import { createTextFormatter } from "../../src/formats/text";

describe("formatters", () => {
  it("text formatter writes expected lines", () => {
    const writes: string[] = [];
    const formatter = createTextFormatter({
      timestamps: false,
      write: (text) => writes.push(text),
    });

    formatter.emit({ type: "start" });
    formatter.emit({ type: "progress", done: 1, total: 3 });
    formatter.emit({ type: "output", data: "hello" });

    expect(writes.join("")).toBe("start\nprogress 1/3\nhello");
  });

  it("jsonl formatter emits one JSON object per line", () => {
    const writes: string[] = [];
    const formatter = createJsonlFormatter({
      timestamps: false,
      write: (text) => writes.push(text),
    });

    formatter.emit({ type: "start", timestamp: 123 });
    expect(writes[0]).toBe('{"type":"start"}\n');
  });

  it("json formatter emits only summary", () => {
    const writes: string[] = [];
    const formatter = createJsonFormatter({
      write: (text) => writes.push(text),
    });

    formatter.emit({ type: "start" } as any);
    formatter.finalize({
      exitCode: 0,
      durationMs: 10,
      tasksComplete: 2,
      totalTasks: 3,
      commits: 1,
      linesAdded: 4,
      linesRemoved: 1,
    });

    expect(writes).toEqual([
      '{"exitCode":0,"durationMs":10,"tasksComplete":2,"totalTasks":3,"commits":1,"linesAdded":4,"linesRemoved":1}\n',
    ]);
  });
});
