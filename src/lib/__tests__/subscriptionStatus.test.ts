import { describe, it, expect } from 'vitest';
import { subscriptionDisplayStatus, pickCurrent } from '../subscriptionStatus';
import type { Subscription } from '../database.types';

function sub(over: Partial<Subscription>): Subscription {
  return {
    id: 'x', member_id: 'm', plan_id: 'p', branch_id: 'b', status: 'active',
    start_date: '2026-01-01', end_date: null, frozen_days_used: 0,
    sessions_remaining: null, price_paid: 0, created_at: '2026-01-01T00:00:00Z',
    ...over,
  };
}

const iso = (daysFromNow: number) => {
  const d = new Date();
  d.setDate(d.getDate() + daysFromNow);
  return d.toISOString().slice(0, 10);
};

describe('subscriptionDisplayStatus', () => {
  it('none for missing sub', () => {
    expect(subscriptionDisplayStatus(null)).toBe('none');
  });
  it('maps DB terminal states', () => {
    expect(subscriptionDisplayStatus(sub({ status: 'pending' }))).toBe('pending');
    expect(subscriptionDisplayStatus(sub({ status: 'frozen' }))).toBe('frozen');
    expect(subscriptionDisplayStatus(sub({ status: 'expired' }))).toBe('expired');
    expect(subscriptionDisplayStatus(sub({ status: 'cancelled' }))).toBe('expired');
  });
  it('refines active by date: past → expired, ≤7d → expiring, else active', () => {
    expect(subscriptionDisplayStatus(sub({ status: 'active', end_date: iso(-1) }))).toBe('expired');
    expect(subscriptionDisplayStatus(sub({ status: 'active', end_date: iso(3) }))).toBe('expiring');
    expect(subscriptionDisplayStatus(sub({ status: 'active', end_date: iso(30) }))).toBe('active');
  });
  it('active with no end date stays active', () => {
    expect(subscriptionDisplayStatus(sub({ status: 'active', end_date: null }))).toBe('active');
  });
});

describe('pickCurrent', () => {
  it('returns null for empty', () => {
    expect(pickCurrent([])).toBeNull();
  });
  it('prefers active over expired', () => {
    const chosen = pickCurrent([
      sub({ id: 'old', status: 'expired', end_date: '2025-01-01' }),
      sub({ id: 'live', status: 'active', end_date: '2026-12-01' }),
    ]);
    expect(chosen?.id).toBe('live');
  });
  it('among same status, picks the latest end date', () => {
    const chosen = pickCurrent([
      sub({ id: 'a', status: 'expired', end_date: '2025-06-01' }),
      sub({ id: 'b', status: 'expired', end_date: '2025-09-01' }),
    ]);
    expect(chosen?.id).toBe('b');
  });
});
