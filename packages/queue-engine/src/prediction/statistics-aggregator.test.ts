import { describe, it, expect } from 'vitest';
import {
  aggregateHourlyStats,
  calculateMedian,
  calculatePercentile,
  computeNoShowProbability,
  trackPredictionAccuracy,
  CompletedTicket,
} from './statistics-aggregator';

function makeTicket(
  startSec: number,
  durationSec: number,
  noShow = false,
): CompletedTicket {
  const serviceStartedAt = new Date(startSec * 1000);
  const completedAt = new Date((startSec + durationSec) * 1000);
  return {
    id: crypto.randomUUID(),
    serviceStartedAt,
    completedAt,
    noShow,
  };
}

describe('calculateMedian', () => {
  it('returns 0 for empty array', () => {
    expect(calculateMedian([])).toBe(0);
  });

  it('returns middle value for odd-length array', () => {
    expect(calculateMedian([3, 1, 2])).toBe(2);
  });

  it('returns average of two middle values for even-length array', () => {
    expect(calculateMedian([1, 2, 3, 4])).toBe(2.5);
  });

  it('handles single element', () => {
    expect(calculateMedian([42])).toBe(42);
  });
});

describe('calculatePercentile', () => {
  it('returns 0 for empty array', () => {
    expect(calculatePercentile([], 90)).toBe(0);
  });

  it('returns correct p50 (median)', () => {
    expect(calculatePercentile([1, 2, 3, 4, 5], 50)).toBe(3);
  });

  it('returns max value for p100', () => {
    expect(calculatePercentile([10, 20, 30], 100)).toBe(30);
  });

  it('returns min value for p0', () => {
    expect(calculatePercentile([10, 20, 30], 0)).toBe(10);
  });

  it('interpolates for p90', () => {
    const values = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
    const result = calculatePercentile(values, 90);
    expect(result).toBeCloseTo(9.1, 1);
  });
});

describe('aggregateHourlyStats', () => {
  it('computes stats for known data', () => {
    const tickets = [
      makeTicket(1000, 60),
      makeTicket(2000, 120),
      makeTicket(3000, 180),
    ];

    const stats = aggregateHourlyStats(tickets, 10, '2026-03-20');

    expect(stats.hourSlot).toBe(10);
    expect(stats.date).toBe('2026-03-20');
    expect(stats.count).toBe(3);
    expect(stats.avgServiceTime).toBe(120);
    expect(stats.medianServiceTime).toBe(120);
    expect(stats.p90ServiceTime).toBeGreaterThan(150);
  });

  it('returns zeros for empty ticket list', () => {
    const stats = aggregateHourlyStats([], 8, '2026-03-20');
    expect(stats.count).toBe(0);
    expect(stats.avgServiceTime).toBe(0);
  });

  it('excludes no-show tickets from service time calculation', () => {
    const tickets = [
      makeTicket(1000, 60),
      makeTicket(2000, 120, true), // no-show
    ];

    const stats = aggregateHourlyStats(tickets, 9, '2026-03-20');
    expect(stats.count).toBe(1);
    expect(stats.avgServiceTime).toBe(60);
  });
});

describe('computeNoShowProbability', () => {
  it('returns 0 for empty array', () => {
    expect(computeNoShowProbability([])).toBe(0);
  });

  it('computes correct no-show rate', () => {
    const tickets = [
      makeTicket(1000, 60, false),
      makeTicket(2000, 0, true),
      makeTicket(3000, 60, false),
      makeTicket(4000, 0, true),
    ];
    expect(computeNoShowProbability(tickets)).toBe(0.5);
  });

  it('returns 0 when no no-shows', () => {
    const tickets = [makeTicket(1000, 60), makeTicket(2000, 120)];
    expect(computeNoShowProbability(tickets)).toBe(0);
  });
});

describe('trackPredictionAccuracy', () => {
  it('returns zeros for empty arrays', () => {
    const result = trackPredictionAccuracy([], []);
    expect(result.meanAbsoluteError).toBe(0);
  });

  it('returns zeros for mismatched lengths', () => {
    const result = trackPredictionAccuracy([1, 2], [1]);
    expect(result.meanAbsoluteError).toBe(0);
  });

  it('computes accuracy for perfect predictions', () => {
    const result = trackPredictionAccuracy([100, 200], [100, 200]);
    expect(result.meanAbsoluteError).toBe(0);
    expect(result.meanPercentageError).toBe(0);
    expect(result.withinTwoMinutes).toBe(100);
  });

  it('computes accuracy for imperfect predictions', () => {
    const predicted = [100, 250, 400];
    const actual = [120, 200, 300];
    const result = trackPredictionAccuracy(predicted, actual);

    expect(result.meanAbsoluteError).toBeGreaterThan(0);
    expect(result.meanPercentageError).toBeGreaterThan(0);
  });
});
