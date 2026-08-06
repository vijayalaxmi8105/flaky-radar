import type { TestExecution } from "./types.js";

export interface FailureRateResult {
  failureRate: number;
  countedExecutions: number;
  totalExecutions: number;
  failures: number;
  skipped: number;
}

/**
 * Computes the failure rate for a test's execution history.
 *
 * Skipped executions are excluded from both numerator and denominator —
 * a skip carries no pass/fail signal. "error" is treated as a failure
 * for the rate calculation, since both represent a non-passing outcome,
 * but the raw counts are preserved separately for later use (e.g. dashboards
 * distinguishing timeouts/errors from assertion failures).
 *
 * Returns 0 for failureRate when there are no counted (non-skipped)
 * executions, since a rate is undefined with zero evidence.
 */
export function failureRate(executions: TestExecution[]): FailureRateResult {
  const totalExecutions = executions.length;
  const counted = executions.filter((e) => e.status !== "skip");
  const failures = counted.filter(
    (e) => e.status === "fail" || e.status === "error"
  );
  const skipped = totalExecutions - counted.length;

  const rate = counted.length > 0 ? failures.length / counted.length : 0;

  return {
    failureRate: rate,
    countedExecutions: counted.length,
    totalExecutions,
    failures: failures.length,
    skipped,
  };
}