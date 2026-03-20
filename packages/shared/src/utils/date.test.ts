import { describe, it, expect } from 'vitest';
import { getCurrentDateInTimezone, getHourSlot, getDayOfWeek } from './date.js';

describe('getCurrentDateInTimezone', () => {
  it('returns a date string in YYYY-MM-DD format', () => {
    const result = getCurrentDateInTimezone('Europe/Stockholm');
    expect(result).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it('works with different timezones', () => {
    const stockholm = getCurrentDateInTimezone('Europe/Stockholm');
    expect(stockholm).toBeTruthy();
    const tokyo = getCurrentDateInTimezone('Asia/Tokyo');
    expect(tokyo).toBeTruthy();
  });
});

describe('getHourSlot', () => {
  it('returns hour between 0 and 23', () => {
    const hour = getHourSlot(new Date(), 'Europe/Stockholm');
    expect(hour).toBeGreaterThanOrEqual(0);
    expect(hour).toBeLessThanOrEqual(23);
  });
});

describe('getDayOfWeek', () => {
  it('returns day between 0 and 6', () => {
    const day = getDayOfWeek(new Date(), 'Europe/Stockholm');
    expect(day).toBeGreaterThanOrEqual(0);
    expect(day).toBeLessThanOrEqual(6);
  });
});
