import { describe, it, expect } from "vitest";

describe("sample suite", () => {
  it("passes", () => {
    expect(1 + 1).toBe(2);
  });

  it("fails on purpose", () => {
    expect(1 + 1).toBe(3);
  });

  it.skip("skipped test", () => {
    expect(true).toBe(true);
  });
}); 
 
