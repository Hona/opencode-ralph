import { describe, it, expect } from "bun:test";
import { formatDuration, calculateEta, formatEta, formatNumber } from "../../src/util/time";

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

    describe("hours", () => {
      it("should format 3700000ms (1h 1m 40s) as '1h 1m'", () => {
        expect(formatDuration(3700000)).toBe("1h 1m");
      });

      it("should format 7200000ms (2h 0m) as '2h 0m'", () => {
        expect(formatDuration(7200000)).toBe("2h 0m");
      });
    });

    describe("edge cases", () => {
      it("should format 0ms as '0s'", () => {
        expect(formatDuration(0)).toBe("0s");
      });

      it("should format 999ms as '0s' (rounds down)", () => {
        expect(formatDuration(999)).toBe("0s");
      });
    });
  });

  describe("calculateEta", () => {
    describe("empty array", () => {
      it("should return null when given an empty array", () => {
        expect(calculateEta([], 10)).toBeNull();
      });
    });

    describe("single iteration", () => {
      it("should multiply single iteration time by remaining tasks", () => {
        // 60000ms per iteration * 5 remaining tasks = 300000ms
        expect(calculateEta([60000], 5)).toBe(300000);
      });
    });

    describe("multiple iterations", () => {
      it("should calculate average and multiply by remaining tasks", () => {
        // Average of [60000, 120000, 90000] = 90000ms
        // 90000ms * 4 remaining tasks = 360000ms
        expect(calculateEta([60000, 120000, 90000], 4)).toBe(360000);
      });
    });

    describe("zero remaining tasks", () => {
      it("should return 0 when remaining tasks is 0", () => {
        // Any average * 0 remaining tasks = 0
        expect(calculateEta([60000], 0)).toBe(0);
      });
    });
  });

  describe("formatEta", () => {
    describe("null input", () => {
      it("should return '--:--' when given null", () => {
        expect(formatEta(null)).toBe("--:--");
      });
    });

    describe("valid duration", () => {
      it("should format 300000ms as '~5m 0s remaining'", () => {
        expect(formatEta(300000)).toBe("~5m 0s remaining");
      });
    });
  });

  describe("formatNumber", () => {
    describe("small numbers", () => {
      it("should format 0 as '0'", () => {
        expect(formatNumber(0)).toBe("0");
      });

      it("should format 123 as '123'", () => {
        expect(formatNumber(123)).toBe("123");
      });

      it("should format 999 as '999'", () => {
        expect(formatNumber(999)).toBe("999");
      });
    });

    describe("thousands (K suffix)", () => {
      it("should format 1000 as '1.0K'", () => {
        expect(formatNumber(1000)).toBe("1.0K");
      });

      it("should format 1234 as '1.2K'", () => {
        expect(formatNumber(1234)).toBe("1.2K");
      });

      it("should format 12500 as '12.5K'", () => {
        expect(formatNumber(12500)).toBe("12.5K");
      });

      it("should format 999999 as '1000.0K'", () => {
        expect(formatNumber(999999)).toBe("1000.0K");
      });
    });

    describe("millions (M suffix)", () => {
      it("should format 1000000 as '1.0M'", () => {
        expect(formatNumber(1000000)).toBe("1.0M");
      });

      it("should format 2500000 as '2.5M'", () => {
        expect(formatNumber(2500000)).toBe("2.5M");
      });

      it("should format 10000000 as '10.0M'", () => {
        expect(formatNumber(10000000)).toBe("10.0M");
      });
    });
  });
});
