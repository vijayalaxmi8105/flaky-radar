import type { Classification } from "./classify.js";

const TARGET_SAMPLE_SIZE = 20;

// FLAKY/STABLE: alternation_rate distance from the 0.08 FLAKY threshold.
// Max meaningful distance is treated as 0.65 — a test alternating at ~0.7-0.8+
// is already unambiguously flaky, so confidence saturates before hitting the
// theoretical max distance of 0.92 (alternation_rate = 1.0).
const ALTERNATION_THRESHOLD = 0.08;
const ALTERNATION_NORMALIZING_RANGE = 0.65;

// BROKEN: failure_rate distance from the 0.95 BROKEN threshold. The BROKEN
// band only spans [0.95, 1.0], a width of 0.05, so that's the full range.
const BROKEN_FAILURE_RATE_THRESHOLD = 0.95;
const BROKEN_NORMALIZING_RANGE = 0.05;

/**
 * Computes a confidence score in [0, 1] for a test's classification.
 *
 * Confidence is the average of two components:
 *   - sample_component: scales with total_executions, saturating at
 *     TARGET_SAMPLE_SIZE (more data increases confidence, with diminishing
 *     returns past the target).
 *   - distance_component: scales with how far the relevant metric sits
 *     from the classification's decision threshold (further from the
 *     boundary = more confidently correct classification).
 *
 * The distance metric depends on classification:
 *   - FLAKY / STABLE: distance of alternation_rate from the 0.08 FLAKY
 *     threshold. Both classifications hinge on this boundary (per
 *     classify.ts's decision logic), so the same factor applies to both.
 *   - BROKEN: distance of failure_rate from the 0.95 BROKEN threshold.
 *     alternation_rate is not meaningful for BROKEN (a consistently
 *     failing test has near-zero alternation by definition), so it is
 *     not used here.
 *   - INSUFFICIENT_DATA: always 0. There is no meaningful confidence in
 *     a classification that reflects "not enough data to classify."
 *
 * Preconditions (caller's responsibility, not enforced here):
 *   - `classification` is the result of classify() on this same data —
 *     this function does not re-derive or validate it.
 */
export function confidence_score(
  classification: Classification,
  total_executions: number,
  alternation_rate: number,
  failure_rate: number
): number {
  if (classification === "INSUFFICIENT_DATA") {
    return 0;
  }

  const sample_component = Math.min(total_executions / TARGET_SAMPLE_SIZE, 1.0);

  const distance_component =
    classification === "BROKEN"
      ? Math.min(
          Math.abs(failure_rate - BROKEN_FAILURE_RATE_THRESHOLD) / BROKEN_NORMALIZING_RANGE,
          1.0
        )
      : Math.min(
          Math.abs(alternation_rate - ALTERNATION_THRESHOLD) / ALTERNATION_NORMALIZING_RANGE,
          1.0
        );

  return (sample_component + distance_component) / 2;
}