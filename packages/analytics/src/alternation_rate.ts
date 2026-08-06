import type { TestExecution } from "./types.js";

export interface AlternationRateResult {
  alternationRate: number;
  comparablePairs: number;
  flips: number;
  countedExecutions: number;
  totalExecutions: number;
  skipped: number;
}

/**
 * Computes the alternation rate for a test's execution history on a single
 * branch. Alternation rate is the fraction of consecutive execution pairs
 * whose pass/fail outcome flips — this is the signal that distinguishes a
 * FLAKY test (frequent flips) from a BROKEN test (consistently failing,
 * near-zero flips), even when both have similar failure rates.
 *
 * Preconditions (caller's responsibility, not enforced here):
 *   - `executions` is scoped to a single branch.
 *   - `executions` is sorted in chronological order.
 *
 * Skipped executions are removed from the sequence entirely (not just
 * excluded from counts) before pairing, so that the executions on either
 * side of a skip become adjacent for comparison purposes — consistent with
 * failureRate() treating skips as carrying no reliability signal.
 *
 * "error" is collapsed into "fail" (i.e. compared as boolean pass/not-pass)
 * before checking for flips, since an error->fail transition is not a
 * meaningful alternation — both represent "broken", not "flipped".
 *
 * Returns 0 for alternationRate when there are fewer than 2 counted
 * executions, since a rate is undefined with zero or one data point.
 */
export function alternationRate(
  executions: TestExecution[]
): AlternationRateResult {
  const totalExecutions = executions.length;
  const counted = executions.filter((e) => e.status !== "skip");
  const skipped = totalExecutions - counted.length;

  const passFlags = counted.map((e) => e.status === "pass");

  let flips = 0;
  for (let i = 0; i < passFlags.length - 1; i++) {
    if (passFlags[i] !== passFlags[i + 1]) {
      flips++;
    }
  }

  const comparablePairs = Math.max(counted.length - 1, 0);
  const rate = comparablePairs > 0 ? flips / comparablePairs : 0;

  return {
    alternationRate: rate,
    comparablePairs,
    flips,
    countedExecutions: counted.length,
    totalExecutions,
    skipped,
  };
}