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

    it("should return correct count for ancestor commit", async () => {
      // Get the hash of HEAD~5 (5 commits before HEAD)
      const proc = Bun.spawn(["git", "rev-parse", "HEAD~5"], {
        stdout: "pipe",
      });
      const ancestorHash = (await new Response(proc.stdout).text()).trim();
      await proc.exited;

      const count = await getCommitsSince(ancestorHash);

      const countProc = Bun.spawn(
        ["git", "rev-list", "--count", `${ancestorHash}..HEAD`],
        { stdout: "pipe" },
      );
      const expectedCount = parseInt(
        (await new Response(countProc.stdout).text()).trim(),
        10,
      );
      await countProc.exited;

      // Match git's own count to account for merge history.
      expect(count).toBe(expectedCount);
    });

    it("should return 0 for invalid hash", async () => {
      // Pass a completely invalid hash that doesn't exist in the repo
      const count = await getCommitsSince("invalidhash123456789");

      // Should gracefully handle the error and return 0
      expect(count).toBe(0);
    });

    it("should return 0 for malformed hash", async () => {
      // Pass a malformed hash (not proper hex format)
      const count = await getCommitsSince("not-a-valid-git-hash!");

      // Should gracefully handle the error and return 0
      expect(count).toBe(0);
    });
  });
});
