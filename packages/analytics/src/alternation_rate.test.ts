import { describe, it, expect } from "vitest";
import { alternationRate } from "./alternation_rate.js";
import type { TestExecution } from "./types.js";

/**
 * Minimal synthetic execution builder. Only `status` matters for
 * alternationRate() — fill in other required TestExecution fields here
 * if your real type needs more (branch, startedAt, etc).
 */
function makeExecution(status: TestExecution["status"]): TestExecution {
  return { status } as TestExecution;
}

describe("alternationRate", () => {
  describe("BROKEN-shaped history (always failing)", () => {
    it("returns alternation rate of 0 for consistently failing executions", () => {
      const executions = [
        "fail",
        "fail",
        "fail",
        "fail",
        "fail",
        "fail",
      ].map((s) => makeExecution(s as TestExecution["status"]));

      const result = alternationRate(executions);

      expect(result.alternationRate).toBe(0);
      expect(result.flips).toBe(0);
      expect(result.comparablePairs).toBe(5);
      expect(result.countedExecutions).toBe(6);
      expect(result.skipped).toBe(0);
    });

    it("treats error as fail, so error/fail sequences still show 0 alternation", () => {
      const executions = [
        "fail",
        "fail",
        "error",
        "fail",
        "fail",
        "fail",
      ].map((s) => makeExecution(s as TestExecution["status"]));

      const result = alternationRate(executions);

      expect(result.alternationRate).toBe(0);
      expect(result.flips).toBe(0);
      expect(result.comparablePairs).toBe(5);
    });
  });

  describe("FLAKY-shaped history (flip-flopping)", () => {
    it("returns alternation rate of 1 for a perfectly alternating sequence", () => {
      const executions = [
        "pass",
        "fail",
        "pass",
        "fail",
        "pass",
        "fail",
      ].map((s) => makeExecution(s as TestExecution["status"]));

      const result = alternationRate(executions);

      expect(result.alternationRate).toBe(1);
      expect(result.flips).toBe(5);
      expect(result.comparablePairs).toBe(5);
      expect(result.countedExecutions).toBe(6);
      expect(result.skipped).toBe(0);
    });

    it("removes skips before pairing, re-joining neighbors correctly", () => {
      const executions = ["pass", "fail", "skip", "pass", "fail"].map((s) =>
        makeExecution(s as TestExecution["status"])
      );

      const result = alternationRate(executions);

      // after filtering skip: pass, fail, pass, fail -> 3 flips / 3 pairs
      expect(result.alternationRate).toBe(1);
      expect(result.flips).toBe(3);
      expect(result.comparablePairs).toBe(3);
      expect(result.countedExecutions).toBe(4);
      expect(result.skipped).toBe(1);
      expect(result.totalExecutions).toBe(5);
    });
  });

  describe("edge cases", () => {
    it("returns 0 when there are fewer than 2 counted executions", () => {
      const executions = [makeExecution("pass")];

      const result = alternationRate(executions);

      expect(result.alternationRate).toBe(0);
      expect(result.comparablePairs).toBe(0);
      expect(result.flips).toBe(0);
    });

    it("returns 0 for an empty execution history", () => {
      const result = alternationRate([]);

      expect(result.alternationRate).toBe(0);
      expect(result.comparablePairs).toBe(0);
      expect(result.countedExecutions).toBe(0);
      expect(result.totalExecutions).toBe(0);
    });
  });
});