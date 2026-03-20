export interface CompletedTicket {
  id: string;
  serviceStartedAt: Date;
  completedAt: Date;
  noShow: boolean;
}

export interface HourlyStats {
  hourSlot: number;
  date: string;
  count: number;
  avgServiceTime: number;
  medianServiceTime: number;
  p90ServiceTime: number;
}

export interface PredictionAccuracy {
  meanAbsoluteError: number;
  meanPercentageError: number;
  withinTwoMinutes: number;
}

export function calculateMedian(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 0) {
    return ((sorted[mid - 1] ?? 0) + (sorted[mid] ?? 0)) / 2;
  }
  return sorted[mid] ?? 0;
}

export function calculatePercentile(values: number[], p: number): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const index = (p / 100) * (sorted.length - 1);
  const lower = Math.floor(index);
  const upper = Math.ceil(index);
  if (lower === upper) return sorted[lower] ?? 0;
  const fraction = index - lower;
  return (sorted[lower] ?? 0) + fraction * ((sorted[upper] ?? 0) - (sorted[lower] ?? 0));
}

export function aggregateHourlyStats(
  completedTickets: CompletedTicket[],
  hourSlot: number,
  date: string,
): HourlyStats {
  const serviceTimes = completedTickets
    .filter((t) => !t.noShow)
    .map((t) => (t.completedAt.getTime() - t.serviceStartedAt.getTime()) / 1000);

  if (serviceTimes.length === 0) {
    return {
      hourSlot,
      date,
      count: 0,
      avgServiceTime: 0,
      medianServiceTime: 0,
      p90ServiceTime: 0,
    };
  }

  const avg = serviceTimes.reduce((sum, v) => sum + v, 0) / serviceTimes.length;

  return {
    hourSlot,
    date,
    count: serviceTimes.length,
    avgServiceTime: Math.round(avg * 100) / 100,
    medianServiceTime: calculateMedian(serviceTimes),
    p90ServiceTime: calculatePercentile(serviceTimes, 90),
  };
}

export function computeNoShowProbability(tickets: CompletedTicket[]): number {
  if (tickets.length === 0) return 0;
  const noShows = tickets.filter((t) => t.noShow).length;
  return noShows / tickets.length;
}

export function trackPredictionAccuracy(
  predicted: number[],
  actual: number[],
): PredictionAccuracy {
  if (predicted.length !== actual.length || predicted.length === 0) {
    return {
      meanAbsoluteError: 0,
      meanPercentageError: 0,
      withinTwoMinutes: 0,
    };
  }

  const n = predicted.length;
  let totalAbsError = 0;
  let totalPctError = 0;
  let withinTwo = 0;

  for (let i = 0; i < n; i++) {
    const p = predicted[i] ?? 0;
    const a = actual[i] ?? 0;
    const absError = Math.abs(p - a);
    totalAbsError += absError;
    if (a !== 0) {
      totalPctError += absError / Math.abs(a);
    }
    if (absError <= 120) {
      withinTwo++;
    }
  }

  return {
    meanAbsoluteError: Math.round((totalAbsError / n) * 100) / 100,
    meanPercentageError: Math.round((totalPctError / n) * 10000) / 100,
    withinTwoMinutes: Math.round((withinTwo / n) * 10000) / 100,
  };
}
