import { confidence_score } from "./confidence_score.js";

export type Classification = 'INSUFFICIENT_DATA' | 'STABLE' | 'FLAKY' | 'BROKEN';

const MIN_SAMPLE = 10;
const BROKEN_FAILURE_RATE = 0.95;
const STABLE_FAILURE_RATE_CEILING = 0.02;
const STABLE_ALTERNATION_CEILING = 0.02;
const FLAKY_FAILURE_RATE_FLOOR = 0.03;
const FLAKY_FAILURE_RATE_CEILING = 0.90;
const FLAKY_ALTERNATION_THRESHOLD = 0.08; // strict >

export interface ClassificationInput {
  failure_rate: number;
  alternation_rate: number;
  total_executions: number;
}

export interface ClassificationResult {
  classification: Classification;
  confidence_score: number;
}

export function classify(input: ClassificationInput): ClassificationResult {
  const { failure_rate, alternation_rate, total_executions } = input;
  const classification = decideClassification(failure_rate, alternation_rate, total_executions);
  const score = confidence_score(classification, total_executions, alternation_rate, failure_rate);
  return { classification, confidence_score: score };
}

function decideClassification(
  failure_rate: number,
  alternation_rate: number,
  total_executions: number
): Classification {
  if (total_executions < MIN_SAMPLE) {
    return 'INSUFFICIENT_DATA';
  }
  if (failure_rate >= BROKEN_FAILURE_RATE) {
    return 'BROKEN';
  }
  if (failure_rate <= STABLE_FAILURE_RATE_CEILING && alternation_rate <= STABLE_ALTERNATION_CEILING) {
    return 'STABLE';
  }
  if (
    failure_rate >= FLAKY_FAILURE_RATE_FLOOR &&
    failure_rate <= FLAKY_FAILURE_RATE_CEILING &&
    alternation_rate > FLAKY_ALTERNATION_THRESHOLD
  ) {
    return 'FLAKY';
  }
  // TODO: gap case - tests with failure_rate above the stable ceiling but
  // alternation_rate at or below FLAKY_ALTERNATION_THRESHOLD (e.g.
  // failure_rate=0.05, alternation_rate=0.05) fall through both branches
  // above and land here as STABLE. This mislabels tests that fail somewhat
  // consistently but not in an alternating pattern - not truly stable, but
  // not clearly flaky either. Needs its own bucket or an explicit decision
  // on which way to default before relying on this fallback for anything
  // safety- or ranking-critical.
  return 'STABLE';
}