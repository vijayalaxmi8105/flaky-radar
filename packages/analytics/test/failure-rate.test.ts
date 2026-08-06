import { describe, it, expect } from "vitest";
import { failureRate } from "../src/failure-rate.js";
import type { TestExecution } from "../src/types.js";

function execs(...statuses: TestExecution["status"][]): TestExecution[] {
  return statuses.map((status) => ({ status }));
}

describe("failureRate", () => {
  it("computes 0.3 for 10 executions with 3 failures", () => {
    const executions = execs(
      "pass", "pass", "fail", "pass", "fail",
      "pass", "pass", "fail", "pass", "pass"
    );

    const result = failureRate(executions);

    expect(result.failureRate).toBeCloseTo(0.3);
    expect(result.totalExecutions).toBe(10);
    expect(result.countedExecutions).toBe(10);
    expect(result.failures).toBe(3);
    expect(result.skipped).toBe(0);
  });

  it("excludes skipped executions from the denominator", () => {
    // 4 pass, 2 fail, 4 skip => rate should be 2/6, not 2/10
    const executions = execs(
      "pass", "pass", "pass", "pass",
      "fail", "fail",
      "skip", "skip", "skip", "skip"
    );

    const result = failureRate(executions);

    expect(result.totalExecutions).toBe(10);
    expect(result.countedExecutions).toBe(6);
    expect(result.skipped).toBe(4);
    expect(result.failureRate).toBeCloseTo(2 / 6);
  });

  it("treats error status as a failure", () => {
    const executions = execs("pass", "pass", "error", "pass");

    const result = failureRate(executions);

    expect(result.failures).toBe(1);
    expect(result.failureRate).toBeCloseTo(0.25);
  });

  it("returns 0 when there are no counted executions", () => {
    const executions = execs("skip", "skip", "skip");

    const result = failureRate(executions);

    expect(result.countedExecutions).toBe(0);
    expect(result.failureRate).toBe(0);
  });

  it("returns 0 for an empty execution history", () => {
    const result = failureRate([]);

    expect(result.totalExecutions).toBe(0);
    expect(result.failureRate).toBe(0);
  });
});