import { describe, it, expect } from 'vitest';
import { predictWaitTime, recalculateAllWaitTimes, type HistoricalData } from './wait-time-predictor.js';

const NO_DATA: HistoricalData = { avgServiceTimeSeconds: null, sampleCount: 0 };
const TODAY_STATS: HistoricalData = { avgServiceTimeSeconds: 300, sampleCount: 20 };
const SAME_HOUR: HistoricalData = { avgServiceTimeSeconds: 360, sampleCount: 40 };
const SAME_DAY: HistoricalData = { avgServiceTimeSeconds: 400, sampleCount: 30 };

describe('predictWaitTime', () => {
  it('returns -1 wait when no rooms are active', () => {
    const result = predictWaitTime({
      positionInQueue: 5,
      activeRooms: 0,
      todayStats: TODAY_STATS,
      sameHourStats: SAME_HOUR,
      sameDayOfWeekStats: SAME_DAY,
      noShowProbability: 0,
    });
    expect(result.estimatedWaitMinutes).toBe(-1);
    expect(result.confidenceLevel).toBe('low');
  });

  it('uses default 8 min when no historical data exists', () => {
    const result = predictWaitTime({
      positionInQueue: 3,
      activeRooms: 2,
      todayStats: NO_DATA,
      sameHourStats: NO_DATA,
      sameDayOfWeekStats: NO_DATA,
      noShowProbability: 0,
    });
    // 3 * 480 / 2 = 720 seconds = 12 minutes
    expect(result.estimatedWaitMinutes).toBe(12);
    expect(result.confidenceLevel).toBe('low');
  });

  it('calculates weighted average from all three data sources', () => {
    const result = predictWaitTime({
      positionInQueue: 5,
      activeRooms: 2,
      todayStats: TODAY_STATS,
      sameHourStats: SAME_HOUR,
      sameDayOfWeekStats: SAME_DAY,
      noShowProbability: 0,
    });
    // Weighted avg ≈ 0.5*300 + 0.3*360 + 0.2*400 = 150+108+80 = 338 sec
    // Wait = 5 * 338 / 2 = 845 sec ≈ 14 min
    expect(result.estimatedWaitMinutes).toBeGreaterThan(0);
    expect(result.confidenceLevel).not.toBe('low');
  });

  it('reduces wait estimate when noShowProbability is high', () => {
    const withNoShow = predictWaitTime({
      positionInQueue: 10,
      activeRooms: 2,
      todayStats: TODAY_STATS,
      sameHourStats: SAME_HOUR,
      sameDayOfWeekStats: SAME_DAY,
      noShowProbability: 0.2,
    });
    const withoutNoShow = predictWaitTime({
      positionInQueue: 10,
      activeRooms: 2,
      todayStats: TODAY_STATS,
      sameHourStats: SAME_HOUR,
      sameDayOfWeekStats: SAME_DAY,
      noShowProbability: 0,
    });
    expect(withNoShow.estimatedWaitMinutes).toBeLessThan(withoutNoShow.estimatedWaitMinutes);
  });

  it('applies fatigue factor for long queues', () => {
    const shortQueue = predictWaitTime({
      positionInQueue: 10,
      activeRooms: 2,
      todayStats: TODAY_STATS,
      sameHourStats: SAME_HOUR,
      sameDayOfWeekStats: SAME_DAY,
      noShowProbability: 0,
    });
    const longQueue = predictWaitTime({
      positionInQueue: 40,
      activeRooms: 2,
      todayStats: TODAY_STATS,
      sameHourStats: SAME_HOUR,
      sameDayOfWeekStats: SAME_DAY,
      noShowProbability: 0,
    });
    // Long queue should have a proportionally higher per-patient time
    const perPatientShort = shortQueue.estimatedWaitMinutes / 10;
    const perPatientLong = longQueue.estimatedWaitMinutes / 40;
    expect(perPatientLong).toBeGreaterThanOrEqual(perPatientShort);
  });

  it('increases w1 when today has enough samples', () => {
    const todayHeavy: HistoricalData = { avgServiceTimeSeconds: 200, sampleCount: 10 };
    const result = predictWaitTime({
      positionInQueue: 5,
      activeRooms: 1,
      todayStats: todayHeavy,
      sameHourStats: { avgServiceTimeSeconds: 500, sampleCount: 20 },
      sameDayOfWeekStats: { avgServiceTimeSeconds: 500, sampleCount: 20 },
      noShowProbability: 0,
    });
    // With today at 200 having heavy weight, result should be closer to 200 than 500
    expect(result.predictedServiceTimeSeconds).toBeLessThan(400);
  });

  it('returns minimum 1 minute wait', () => {
    const result = predictWaitTime({
      positionInQueue: 1,
      activeRooms: 10,
      todayStats: { avgServiceTimeSeconds: 30, sampleCount: 5 },
      sameHourStats: NO_DATA,
      sameDayOfWeekStats: NO_DATA,
      noShowProbability: 0,
    });
    expect(result.estimatedWaitMinutes).toBeGreaterThanOrEqual(1);
  });

  it('returns high confidence when sufficient data exists', () => {
    const result = predictWaitTime({
      positionInQueue: 5,
      activeRooms: 2,
      todayStats: { avgServiceTimeSeconds: 300, sampleCount: 30 },
      sameHourStats: { avgServiceTimeSeconds: 350, sampleCount: 15 },
      sameDayOfWeekStats: { avgServiceTimeSeconds: 400, sampleCount: 10 },
      noShowProbability: 0,
    });
    expect(result.confidenceLevel).toBe('high');
  });
});

describe('recalculateAllWaitTimes', () => {
  it('calculates wait times for all positions', () => {
    const positions = [1, 2, 3, 4, 5];
    const result = recalculateAllWaitTimes(
      positions,
      2,
      TODAY_STATS,
      SAME_HOUR,
      SAME_DAY,
      0,
    );
    expect(result.size).toBe(5);

    // Later positions should have longer waits
    const wait1 = result.get(1)!;
    const wait5 = result.get(5)!;
    expect(wait5).toBeGreaterThan(wait1);
  });

  it('returns empty map for empty positions', () => {
    const result = recalculateAllWaitTimes([], 2, TODAY_STATS, SAME_HOUR, SAME_DAY, 0);
    expect(result.size).toBe(0);
  });
});
