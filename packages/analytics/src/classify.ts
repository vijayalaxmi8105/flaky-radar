

export type Classification = 'INSUFFICIENT_DATA' | 'STABLE' | 'FLAKY' | 'BROKEN';

const MIN_SAMPLE = 10;

const BROKEN_FAILURE_RATE = 0.95;

const STABLE_FAILURE_RATE_CEILING = 0.02;
const STABLE_ALTERNATION_CEILING = 0.02;

const FLAKY_FAILURE_RATE_FLOOR = 0.03;
const FLAKY_FAILURE_RATE_CEILING = 0.90;
const FLAKY_ALTERNATION_THRESHOLD = 0.08; // strict >

const TARGET_SAMPLE_SIZE = 30;
const NORMALIZING_RANGE = 0.3;

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

  const confidence_score =
    classification === 'INSUFFICIENT_DATA'
      ? 0
      : computeConfidence(alternation_rate, total_executions);

  return { classification, confidence_score };
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

  return 'STABLE';
}

function computeConfidence(alternation_rate: number, total_executions: number): number {
  const sample_factor = Math.min(1.0, total_executions / TARGET_SAMPLE_SIZE);

  const distance = Math.abs(alternation_rate - FLAKY_ALTERNATION_THRESHOLD);
  const distance_from_threshold_factor = Math.min(1.0, distance / NORMALIZING_RANGE);

  return sample_factor * distance_from_threshold_factor;
}