import { describe, it, expect } from 'vitest';
import { classify } from './classify.js';

describe('classify()', () => {
  // ---------- INSUFFICIENT_DATA ----------
  describe('INSUFFICIENT_DATA', () => {
    it('classifies as INSUFFICIENT_DATA when total_executions is below MIN_SAMPLE (9)', () => {
      const result = classify({ failure_rate: 0.5, alternation_rate: 0.5, total_executions: 9 });
      expect(result.classification).toBe('INSUFFICIENT_DATA');
    });

    it('does NOT classify as INSUFFICIENT_DATA at exactly MIN_SAMPLE (10)', () => {
      const result = classify({ failure_rate: 0, alternation_rate: 0, total_executions: 10 });
      expect(result.classification).not.toBe('INSUFFICIENT_DATA');
    });

    it('forces confidence_score to 0 for INSUFFICIENT_DATA regardless of inputs', () => {
      const result = classify({ failure_rate: 0.9, alternation_rate: 0.9, total_executions: 1 });
      expect(result.confidence_score).toBe(0);
    });
  });

  // ---------- BROKEN ----------
  describe('BROKEN', () => {
    it('classifies as BROKEN at exactly failure_rate = 0.95', () => {
      const result = classify({ failure_rate: 0.95, alternation_rate: 0.0, total_executions: 30 });
      expect(result.classification).toBe('BROKEN');
    });

    it('classifies as BROKEN just above 0.95', () => {
      const result = classify({ failure_rate: 0.96, alternation_rate: 0.0, total_executions: 30 });
      expect(result.classification).toBe('BROKEN');
    });

    it('does NOT classify as BROKEN just below 0.95 (falls to STABLE catch-all)', () => {
      const result = classify({ failure_rate: 0.949, alternation_rate: 0.5, total_executions: 30 });
      expect(result.classification).toBe('STABLE');
    });
  });

  // ---------- STABLE (explicit branch) ----------
  describe('STABLE — explicit low failure_rate + low alternation_rate branch', () => {
    it('classifies as STABLE at exactly failure_rate = 0.02 and alternation_rate = 0.02', () => {
      const result = classify({ failure_rate: 0.02, alternation_rate: 0.02, total_executions: 30 });
      expect(result.classification).toBe('STABLE');
    });

    it('classifies as STABLE when both rates are 0', () => {
      const result = classify({ failure_rate: 0, alternation_rate: 0, total_executions: 30 });
      expect(result.classification).toBe('STABLE');
    });
  });

  // ---------- FLAKY ----------
  describe('FLAKY', () => {
    it('classifies as FLAKY at exactly failure_rate = 0.03 with alternation_rate above threshold', () => {
      const result = classify({ failure_rate: 0.03, alternation_rate: 0.09, total_executions: 30 });
      expect(result.classification).toBe('FLAKY');
    });

    it('classifies as FLAKY at exactly failure_rate = 0.90 with alternation_rate above threshold', () => {
      const result = classify({ failure_rate: 0.90, alternation_rate: 0.09, total_executions: 30 });
      expect(result.classification).toBe('FLAKY');
    });

    it('classifies as FLAKY just above the alternation threshold (0.081)', () => {
      const result = classify({ failure_rate: 0.5, alternation_rate: 0.081, total_executions: 30 });
      expect(result.classification).toBe('FLAKY');
    });

    it('does NOT classify as FLAKY at exactly alternation_rate = 0.08 (strict >)', () => {
      const result = classify({ failure_rate: 0.5, alternation_rate: 0.08, total_executions: 30 });
      expect(result.classification).toBe('STABLE'); // falls through to catch-all
    });
  });

  // ---------- Ambiguous gaps (explicitly documented, not accidental) ----------
  describe('ambiguous middle → lean STABLE', () => {
    it('falls to STABLE in the 0.02–0.03 failure_rate sliver (e.g. 0.025) even with high alternation_rate', () => {
      const result = classify({ failure_rate: 0.025, alternation_rate: 0.5, total_executions: 30 });
      expect(result.classification).toBe('STABLE');
    });

    it('falls to STABLE in the 0.90–0.95 failure_rate gap (e.g. 0.92) even with high alternation_rate', () => {
      const result = classify({ failure_rate: 0.92, alternation_rate: 0.5, total_executions: 30 });
      expect(result.classification).toBe('STABLE');
    });

    it('falls to STABLE for mid-range failure_rate with alternation_rate exactly at 0.08 (not >)', () => {
      const result = classify({ failure_rate: 0.4, alternation_rate: 0.08, total_executions: 30 });
      expect(result.classification).toBe('STABLE');
    });
  });
});