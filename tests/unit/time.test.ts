import { describe, it, expect } from "bun:test";
import { formatDuration, calculateEta, formatEta } from "../../src/util/time";

describe("time utilities", () => {
  describe("formatDuration", () => {
    describe("seconds only", () => {
      it("should format 5000ms as '5s'", () => {
        expect(formatDuration(5000)).toBe("5s");
      });

      it("should format 59000ms as '59s'", () => {
        expect(formatDuration(59000)).toBe("59s");
      });
    });

    describe("minutes and seconds", () => {
      it("should format 90000ms (1m 30s) as '1m 30s'", () => {
        expect(formatDuration(90000)).toBe("1m 30s");
      });

      it("should format 300000ms (5m 0s) as '5m 0s'", () => {
        expect(formatDuration(300000)).toBe("5m 0s");
      });
    });
  });
});
