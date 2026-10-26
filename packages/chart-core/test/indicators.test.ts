import { describe, expect, it } from 'vitest';
import { sma, ema, rsi, macd, bollinger, vwap, stddev, computeIndicator, createIndicatorConfig } from '../src/indicators';
import type { Candle } from '@tvk/shared-types';

const near = (a: number, b: number, eps = 1e-6) => Math.abs(a - b) < eps;

describe('indicator math', () => {
  it('SMA', () => {
    expect(sma([1, 2, 3, 4, 5], 3).map((v) => (Number.isNaN(v) ? null : v))).toEqual([null, null, 2, 3, 4]);
  });
  it('EMA seeds with SMA then smooths', () => {
    const e = ema([1, 2, 3, 4, 5, 6], 3);
    expect(Number.isNaN(e[1]!)).toBe(true);
    expect(e[2]).toBe(2);
    expect(near(e[3]!, 2 + (4 - 2) * 0.5)).toBe(true); // k = 2/(3+1) = 0.5
    expect(near(e[4]!, 3 + (5 - 3) * 0.5)).toBe(true);
  });
  it('stddev and Bollinger', () => {
    const sd = stddev([2, 4, 4, 4, 5, 5, 7, 9], 8);
    expect(near(sd[7]!, 2)).toBe(true);
    const b = bollinger([2, 4, 4, 4, 5, 5, 7, 9], 8, 2);
    expect(near(b.middle[7]!, 5)).toBe(true);
    expect(near(b.upper[7]!, 9)).toBe(true);
    expect(near(b.lower[7]!, 1)).toBe(true);
  });
  it('RSI matches the textbook example', () => {
    // Classic 14-period example from Wilder; first RSI value ~70.53 with these closes.
    const closes = [44.34, 44.09, 44.15, 43.61, 44.33, 44.83, 45.10, 45.42, 45.84, 46.08, 45.89, 46.03, 45.61, 46.28, 46.28, 46.00, 46.03, 46.41, 46.22, 45.64];
    const r = rsi(closes, 14);
    expect(Number.isNaN(r[13]!)).toBe(true);
    expect(r[14]!).toBeCloseTo(70.46, 1);
    expect(r[15]!).toBeCloseTo(66.25, 0);
    expect(r.slice(14).every((v) => v >= 0 && v <= 100)).toBe(true);
  });
  it('RSI is 100 when there are no losses', () => {
    const r = rsi([1, 2, 3, 4, 5, 6], 3);
    expect(r[3]).toBe(100);
  });
  it('MACD = EMA12 - EMA26 with EMA9 signal', () => {
    const closes = Array.from({ length: 60 }, (_, i) => 100 + Math.sin(i / 5) * 10 + i * 0.1);
    const m = macd(closes);
    const f = ema(closes, 12);
    const s = ema(closes, 26);
    expect(near(m.macd[40]!, f[40]! - s[40]!)).toBe(true);
    expect(Number.isNaN(m.signal[25 + 7]!)).toBe(true);
    expect(Number.isNaN(m.signal[25 + 8]!)).toBe(false);
    expect(near(m.histogram[50]!, m.macd[50]! - m.signal[50]!)).toBe(true);
  });
  it('VWAP resets each session', () => {
    const mk = (time: number, p: number, v: number): Candle => ({ time, open: p, high: p, low: p, close: p, volume: v });
    const c = [mk(0, 10, 1), mk(60, 20, 1), mk(86400, 30, 2), mk(86460, 10, 2)];
    const v = vwap(c);
    expect(v[0]).toBe(10);
    expect(v[1]).toBe(15);
    expect(v[2]).toBe(30);
    expect(v[3]).toBe(20);
  });
  it('computeIndicator dispatches and aligns', () => {
    const candles: Candle[] = Array.from({ length: 30 }, (_, i) => ({ time: i * 60, open: i, high: i + 1, low: i - 1, close: i + 0.5, volume: 10 }));
    const out = computeIndicator(createIndicatorConfig('bb', 'x'), candles);
    expect(out.lines).toHaveLength(3);
    expect(out.lines[0]!.values).toHaveLength(30);
    const vol = computeIndicator(createIndicatorConfig('volume', 'v'), candles);
    expect(vol.colors).toHaveLength(30);
    const r = computeIndicator(createIndicatorConfig('rsi', 'r'), candles);
    expect(r.pane).toBe('separate');
  });
});
