import { describe, it, expect } from "bun:test";
import { createSessionStats } from "../../src/hooks/useSessionStats";

describe("createSessionStats", () => {
  describe("initial state", () => {
    it("should initialize all counters to zero", () => {
      const stats = createSessionStats();
      expect(stats.input()).toBe(0);
      expect(stats.output()).toBe(0);
      expect(stats.reasoning()).toBe(0);
      expect(stats.cacheRead()).toBe(0);
      expect(stats.cacheWrite()).toBe(0);
    });

    it("should return zero totals initially", () => {
      const stats = createSessionStats();
      const totals = stats.totals();
      expect(totals).toEqual({
        input: 0,
        output: 0,
        reasoning: 0,
        cacheRead: 0,
        cacheWrite: 0,
      });
    });
  });

  describe("addTokens", () => {
    it("should accumulate input tokens", () => {
      const stats = createSessionStats();
      stats.addTokens({ input: 100 });
      expect(stats.input()).toBe(100);
      stats.addTokens({ input: 50 });
      expect(stats.input()).toBe(150);
    });

    it("should accumulate output tokens", () => {
      const stats = createSessionStats();
      stats.addTokens({ output: 200 });
      expect(stats.output()).toBe(200);
      stats.addTokens({ output: 100 });
      expect(stats.output()).toBe(300);
    });

    it("should accumulate reasoning tokens", () => {
      const stats = createSessionStats();
      stats.addTokens({ reasoning: 50 });
      expect(stats.reasoning()).toBe(50);
      stats.addTokens({ reasoning: 25 });
      expect(stats.reasoning()).toBe(75);
    });

    it("should accumulate cache tokens", () => {
      const stats = createSessionStats();
      stats.addTokens({ cacheRead: 1000, cacheWrite: 500 });
      expect(stats.cacheRead()).toBe(1000);
      expect(stats.cacheWrite()).toBe(500);
      stats.addTokens({ cacheRead: 200, cacheWrite: 100 });
      expect(stats.cacheRead()).toBe(1200);
      expect(stats.cacheWrite()).toBe(600);
    });

    it("should handle partial updates", () => {
      const stats = createSessionStats();
      stats.addTokens({ input: 100 });
      stats.addTokens({ output: 50 });
      stats.addTokens({ reasoning: 25 });
      expect(stats.input()).toBe(100);
      expect(stats.output()).toBe(50);
      expect(stats.reasoning()).toBe(25);
      expect(stats.cacheRead()).toBe(0);
      expect(stats.cacheWrite()).toBe(0);
    });

    it("should ignore zero values", () => {
      const stats = createSessionStats();
      stats.addTokens({ input: 100 });
      stats.addTokens({ input: 0 }); // Should not change
      expect(stats.input()).toBe(100);
    });

    it("should ignore undefined values", () => {
      const stats = createSessionStats();
      stats.addTokens({ input: 100 });
      stats.addTokens({ output: undefined }); // Should not affect input
      expect(stats.input()).toBe(100);
      expect(stats.output()).toBe(0);
    });

    it("should accumulate multiple step finishes correctly", () => {
      const stats = createSessionStats();
      // Simulating multiple step-finish events as they would come from SSE
      stats.addTokens({ input: 1500, output: 500, reasoning: 100, cacheRead: 2000, cacheWrite: 0 });
      stats.addTokens({ input: 800, output: 300, reasoning: 50, cacheRead: 1500, cacheWrite: 0 });
      stats.addTokens({ input: 1200, output: 400, reasoning: 75, cacheRead: 1800, cacheWrite: 0 });

      const totals = stats.totals();
      expect(totals.input).toBe(3500); // 1500 + 800 + 1200
      expect(totals.output).toBe(1200); // 500 + 300 + 400
      expect(totals.reasoning).toBe(225); // 100 + 50 + 75
      expect(totals.cacheRead).toBe(5300); // 2000 + 1500 + 1800
      expect(totals.cacheWrite).toBe(0);
    });
  });

  describe("reset", () => {
    it("should reset all counters to zero", () => {
      const stats = createSessionStats();
      stats.addTokens({ input: 100, output: 50, reasoning: 25, cacheRead: 200, cacheWrite: 100 });
      
      stats.reset();
      
      expect(stats.input()).toBe(0);
      expect(stats.output()).toBe(0);
      expect(stats.reasoning()).toBe(0);
      expect(stats.cacheRead()).toBe(0);
      expect(stats.cacheWrite()).toBe(0);
    });

    it("should allow accumulation after reset", () => {
      const stats = createSessionStats();
      stats.addTokens({ input: 100 });
      stats.reset();
      stats.addTokens({ input: 50 });
      expect(stats.input()).toBe(50);
    });
  });

  describe("totals accessor", () => {
    it("should reflect current state", () => {
      const stats = createSessionStats();
      stats.addTokens({ input: 100, output: 50 });
      
      const totals1 = stats.totals();
      expect(totals1.input).toBe(100);
      expect(totals1.output).toBe(50);
      
      stats.addTokens({ input: 25 });
      const totals2 = stats.totals();
      expect(totals2.input).toBe(125);
    });

    it("should return a new object each time", () => {
      const stats = createSessionStats();
      stats.addTokens({ input: 100 });
      
      const totals1 = stats.totals();
      const totals2 = stats.totals();
      
      // Should be equal in value but different objects
      expect(totals1).toEqual(totals2);
      expect(totals1).not.toBe(totals2);
    });
  });
});
