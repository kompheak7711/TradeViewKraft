import { describe, expect, it } from 'vitest';
import type { PriceAlert } from '@tvk/shared-types';
import { evaluateAlert } from '../src/data/alert-engine';

const base: PriceAlert = { id: 'a', symbol: 'BINANCE:BTCUSDT', condition: 'crossing', price: 100, enabled: true, frequency: 'once', createdAt: 0, updatedAt: 0 };

describe('evaluateAlert', () => {
  it('crossing fires in both directions only when the level is crossed', () => {
    expect(evaluateAlert(base, 99, 101)).toBe(true);
    expect(evaluateAlert(base, 101, 99)).toBe(true);
    expect(evaluateAlert(base, 99, 99.5)).toBe(false);
    expect(evaluateAlert(base, undefined, 101)).toBe(false);
    expect(evaluateAlert(base, 100, 100)).toBe(false);
  });
  it('crossing up / down are directional', () => {
    expect(evaluateAlert({ ...base, condition: 'crossing_up' }, 99, 100)).toBe(true);
    expect(evaluateAlert({ ...base, condition: 'crossing_up' }, 101, 99)).toBe(false);
    expect(evaluateAlert({ ...base, condition: 'crossing_down' }, 101, 100)).toBe(true);
    expect(evaluateAlert({ ...base, condition: 'crossing_down' }, 99, 101)).toBe(false);
  });
  it('greater / less fire on the first tick beyond the level and not again while beyond', () => {
    expect(evaluateAlert({ ...base, condition: 'greater' }, undefined, 101)).toBe(true);
    expect(evaluateAlert({ ...base, condition: 'greater' }, 101, 102)).toBe(false);
    expect(evaluateAlert({ ...base, condition: 'greater' }, 100, 101)).toBe(true);
    expect(evaluateAlert({ ...base, condition: 'less' }, undefined, 99)).toBe(true);
    expect(evaluateAlert({ ...base, condition: 'less' }, 99, 98)).toBe(false);
  });
  it('disabled alerts never fire', () => {
    expect(evaluateAlert({ ...base, enabled: false }, 99, 101)).toBe(false);
  });
});
