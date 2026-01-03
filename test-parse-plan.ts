/**
 * Test script for parsePlan() function
 * Run with: bun run test-parse-plan.ts
 */

import { parsePlan } from "./src/plan";

async function testParsePlan() {
  console.log("Testing parsePlan() function...\n");

  // Test 1: Parse test-plan.md
  console.log("Test 1: Parsing test-plan.md");
  const result = await parsePlan("test-plan.md");
  console.log(`  Result: done=${result.done}, total=${result.total}`);
  
  // The test-plan.md has 2 checked items (with X and x) and 3 unchecked items
  const expectedDone = 2;
  const expectedTotal = 5;
  
  if (result.done === expectedDone && result.total === expectedTotal) {
    console.log(`  PASS: Expected done=${expectedDone}, total=${expectedTotal}\n`);
  } else {
    console.log(`  FAIL: Expected done=${expectedDone}, total=${expectedTotal}\n`);
    process.exit(1);
  }

  // Test 2: Parse non-existent file
  console.log("Test 2: Parsing non-existent file");
  const result2 = await parsePlan("non-existent-file.md");
  console.log(`  Result: done=${result2.done}, total=${result2.total}`);
  
  if (result2.done === 0 && result2.total === 0) {
    console.log(`  PASS: Returns { done: 0, total: 0 } for non-existent file\n`);
  } else {
    console.log(`  FAIL: Expected done=0, total=0 for non-existent file\n`);
    process.exit(1);
  }

  // Test 3: Parse the main plan.md
  console.log("Test 3: Parsing plan.md (main project plan)");
  const result3 = await parsePlan("plan.md");
  console.log(`  Result: done=${result3.done}, total=${result3.total}`);
  console.log(`  INFO: Main plan has ${result3.done}/${result3.total} tasks completed\n`);

  console.log("All tests passed!");
}

testParsePlan().catch((err) => {
  console.error("Test failed with error:", err);
  process.exit(1);
});
