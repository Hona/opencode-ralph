import { describe, it, expect } from "bun:test";
import { getHeadHash, getCommitsSince } from "../../src/git";

describe("git utilities", () => {
  describe("getHeadHash()", () => {
    it("should return a 40-character hex string", async () => {
      const hash = await getHeadHash();

      // Should be exactly 40 characters
      expect(hash).toHaveLength(40);

      // Should be a valid hex string (only 0-9 and a-f)
      expect(hash).toMatch(/^[0-9a-f]{40}$/);
    });

    it("should match git rev-parse HEAD output", async () => {
      const hash = await getHeadHash();

      // Get the hash directly via Bun.spawn to verify
      const proc = Bun.spawn(["git", "rev-parse", "HEAD"], {
        stdout: "pipe",
      });
      const expectedHash = (await new Response(proc.stdout).text()).trim();
      await proc.exited;

      expect(hash).toBe(expectedHash);
    });
  });

  describe("getCommitsSince()", () => {
    it("should return 0 when given current HEAD", async () => {
      const currentHead = await getHeadHash();
      const count = await getCommitsSince(currentHead);

      // There are no commits since HEAD, so count should be 0
      expect(count).toBe(0);
    });
  });
});
