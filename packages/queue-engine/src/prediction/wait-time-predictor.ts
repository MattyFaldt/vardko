import { DEFAULT_SERVICE_TIME_SECONDS } from '@vardko/shared';

export interface HistoricalData {
  avgServiceTimeSeconds: number | null;
  sampleCount: number;
}

export interface PredictionInput {
  positionInQueue: number;
  activeRooms: number;
  todayStats: HistoricalData;
  sameHourStats: HistoricalData;
  sameDayOfWeekStats: HistoricalData;
  noShowProbability: number;
}

export interface PredictionResult {
  estimatedWaitMinutes: number;
  confidenceLevel: 'high' | 'medium' | 'low';
  predictedServiceTimeSeconds: number;
}

const MIN_DATA_WEEKS = 2;
const MIN_SAMPLES_FOR_HIGH_CONFIDENCE = 50;
const MIN_SAMPLES_FOR_MEDIUM_CONFIDENCE = 10;

/**
 * Wait time prediction engine using weighted moving average.
 *
 * PredictedServiceTime = w1 × TodayAvg + w2 × SameHourHistorical + w3 × SameDayOfWeekHistorical
 * EstimatedWait = PositionInQueue × PredictedServiceTime / ActiveRooms
 */
export function predictWaitTime(input: PredictionInput): PredictionResult {
  const { positionInQueue, activeRooms, todayStats, sameHourStats, sameDayOfWeekStats, noShowProbability } = input;

  if (activeRooms <= 0) {
    return {
      estimatedWaitMinutes: -1,
      confidenceLevel: 'low',
      predictedServiceTimeSeconds: DEFAULT_SERVICE_TIME_SECONDS,
    };
  }

  const serviceTime = calculatePredictedServiceTime(todayStats, sameHourStats, sameDayOfWeekStats);
  const confidenceLevel = calculateConfidence(todayStats, sameHourStats, sameDayOfWeekStats);

  // Effective position accounts for no-shows (some patients ahead won't show up)
  const effectivePosition = positionInQueue * (1 - noShowProbability);

  // Queue depth fatigue factor: longer queues → slightly longer per-patient
  const fatigueFactor = positionInQueue > 20 ? 1 + (positionInQueue - 20) * 0.005 : 1;

  const totalWaitSeconds =
    (effectivePosition * serviceTime.weightedAvg * fatigueFactor) / activeRooms;

  const estimatedWaitMinutes = Math.max(1, Math.round(totalWaitSeconds / 60));

  return {
    estimatedWaitMinutes,
    confidenceLevel,
    predictedServiceTimeSeconds: Math.round(serviceTime.weightedAvg),
  };
}

interface WeightedResult {
  weightedAvg: number;
}

function calculatePredictedServiceTime(
  todayStats: HistoricalData,
  sameHourStats: HistoricalData,
  sameDayOfWeekStats: HistoricalData,
): WeightedResult {
  const hasToday = todayStats.avgServiceTimeSeconds !== null && todayStats.sampleCount > 0;
  const hasSameHour = sameHourStats.avgServiceTimeSeconds !== null && sameHourStats.sampleCount > 0;
  const hasSameDayOfWeek =
    sameDayOfWeekStats.avgServiceTimeSeconds !== null && sameDayOfWeekStats.sampleCount > 0;

  // If no historical data at all, use conservative default
  if (!hasToday && !hasSameHour && !hasSameDayOfWeek) {
    return { weightedAvg: DEFAULT_SERVICE_TIME_SECONDS };
  }

  // Base weights
  let w1 = hasToday ? 0.5 : 0;
  let w2 = hasSameHour ? 0.3 : 0;
  let w3 = hasSameDayOfWeek ? 0.2 : 0;

  // If today's data is available, increase its weight if queue is deviating
  if (hasToday && todayStats.sampleCount >= 5) {
    w1 = 0.6;
    w2 = hasSameHour ? 0.25 : 0;
    w3 = hasSameDayOfWeek ? 0.15 : 0;
  }

  // Normalize weights
  const totalWeight = w1 + w2 + w3;
  if (totalWeight === 0) {
    return { weightedAvg: DEFAULT_SERVICE_TIME_SECONDS };
  }

  w1 /= totalWeight;
  w2 /= totalWeight;
  w3 /= totalWeight;

  const weightedAvg =
    w1 * (todayStats.avgServiceTimeSeconds ?? DEFAULT_SERVICE_TIME_SECONDS) +
    w2 * (sameHourStats.avgServiceTimeSeconds ?? DEFAULT_SERVICE_TIME_SECONDS) +
    w3 * (sameDayOfWeekStats.avgServiceTimeSeconds ?? DEFAULT_SERVICE_TIME_SECONDS);

  return { weightedAvg };
}

function calculateConfidence(
  todayStats: HistoricalData,
  sameHourStats: HistoricalData,
  sameDayOfWeekStats: HistoricalData,
): 'high' | 'medium' | 'low' {
  const totalSamples =
    todayStats.sampleCount + sameHourStats.sampleCount + sameDayOfWeekStats.sampleCount;

  const hasHistorical =
    sameHourStats.sampleCount >= MIN_DATA_WEEKS &&
    sameDayOfWeekStats.sampleCount >= MIN_DATA_WEEKS;

  if (totalSamples >= MIN_SAMPLES_FOR_HIGH_CONFIDENCE && hasHistorical) {
    return 'high';
  }
  if (totalSamples >= MIN_SAMPLES_FOR_MEDIUM_CONFIDENCE) {
    return 'medium';
  }
  return 'low';
}

/**
 * Recalculate estimated wait times for all waiting patients.
 * Called when rooms change or patients are added/removed.
 */
export function recalculateAllWaitTimes(
  waitingPositions: number[],
  activeRooms: number,
  todayStats: HistoricalData,
  sameHourStats: HistoricalData,
  sameDayOfWeekStats: HistoricalData,
  noShowProbability: number,
): Map<number, number> {
  const result = new Map<number, number>();

  for (const position of waitingPositions) {
    const prediction = predictWaitTime({
      positionInQueue: position,
      activeRooms,
      todayStats,
      sameHourStats,
      sameDayOfWeekStats,
      noShowProbability,
    });
    result.set(position, prediction.estimatedWaitMinutes);
  }

  return result;
}
