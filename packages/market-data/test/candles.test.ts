import { describe, expect, it } from 'vitest';
import { bucketStart, nextBucket, CandleBuilder, mergeCandles, aggregateCandles, findGaps, toHeikinAshi } from '../src/candles';
import { pickBaseTimeframe } from '../src/providers/base';
import type { Candle } from '@tvk/shared-types';

describe('bucketStart', () => {
  it('floors intraday timeframes', () => {
    expect(bucketStart(125, '1m')).toBe(120);
    expect(bucketStart(3600 + 1805, '30m')).toBe(5400);
    expect(bucketStart(5399, '30m')).toBe(3600);
    expect(bucketStart(86400 * 3 + 5, '4h')).toBe(86400 * 3);
  });
  it('starts weeks on Monday 00:00 UTC', () => {
    // 2024-01-03 (Wednesday) 12:00 UTC -> Monday 2024-01-01 00:00 UTC
    const wed = Date.UTC(2024, 0, 3, 12) / 1000;
    expect(bucketStart(wed, '1W')).toBe(Date.UTC(2024, 0, 1) / 1000);
    const mon = Date.UTC(2024, 0, 1) / 1000;
    expect(bucketStart(mon, '1W')).toBe(mon);
    expect(bucketStart(mon - 1, '1W')).toBe(Date.UTC(2023, 11, 25) / 1000);
  });
  it('handles calendar months', () => {
    const t = Date.UTC(2024, 1, 29, 23) / 1000;
    expect(bucketStart(t, '1M')).toBe(Date.UTC(2024, 1, 1) / 1000);
    expect(nextBucket(Date.UTC(2024, 11, 1) / 1000, '1M')).toBe(Date.UTC(2025, 0, 1) / 1000);
  });
});

describe('CandleBuilder', () => {
  const sym = 'BINANCE:BTCUSDT' as const;
  it('builds candles from ticks and flags closes', () => {
    const b = new CandleBuilder(sym, '1m');
    let u = b.applyTick({ symbol: sym, time: 60_000, price: 100, size: 1 });
    expect(u).toHaveLength(1);
    expect(u[0]!.candle).toEqual({ time: 60, open: 100, high: 100, low: 100, close: 100, volume: 1 });
    u = b.applyTick({ symbol: sym, time: 90_000, price: 105, size: 2 });
    expect(u[0]!.candle).toEqual({ time: 60, open: 100, high: 105, low: 100, close: 105, volume: 3 });
    u = b.applyTick({ symbol: sym, time: 95_000, price: 95, size: 1 });
    expect(u[0]!.candle.low).toBe(95);
    expect(u[0]!.candle.close).toBe(95);
    u = b.applyTick({ symbol: sym, time: 120_000, price: 96, size: 1 });
    expect(u).toHaveLength(2);
    expect(u[0]!.closed).toBe(true);
    expect(u[0]!.candle.time).toBe(60);
    expect(u[1]!.closed).toBe(false);
    expect(u[1]!.candle).toEqual({ time: 120, open: 96, high: 96, low: 96, close: 96, volume: 1 });
    expect(b.all).toHaveLength(2);
  });
  it('continues from seeded history and ignores rewinds of the open candle', () => {
    const b = new CandleBuilder(sym, '5m');
    b.seed([{ time: 0, open: 1, high: 2, low: 0.5, close: 1.5, volume: 10 }, { time: 300, open: 1.5, high: 1.6, low: 1.4, close: 1.55, volume: 5 }]);
    const u = b.applyTick({ symbol: sym, time: 400_000, price: 1.7, size: 1 });
    expect(u[0]!.candle).toEqual({ time: 300, open: 1.5, high: 1.7, low: 1.4, close: 1.7, volume: 6 });
    const late = b.applyTick({ symbol: sym, time: 100_000, price: 3, size: 1 });
    expect(late[0]!.candle.time).toBe(0);
    expect(late[0]!.candle.high).toBe(3);
    expect(late[0]!.closed).toBe(true);
    expect(b.last!.close).toBe(1.7);
  });
  it('applies exchange klines in place', () => {
    const b = new CandleBuilder(sym, '1m');
    b.seed([{ time: 60, open: 1, high: 1, low: 1, close: 1, volume: 1 }]);
    b.applyCandle({ time: 60, open: 1, high: 2, low: 1, close: 2, volume: 3 });
    b.applyCandle({ time: 120, open: 2, high: 2, low: 2, close: 2, volume: 1 });
    expect(b.all.map((c) => c.close)).toEqual([2, 2]);
    expect(b.all).toHaveLength(2);
  });
  it('merges backfill without duplicates', () => {
    const b = new CandleBuilder(sym, '1m');
    b.seed([{ time: 60, open: 1, high: 1, low: 1, close: 1, volume: 1 }, { time: 240, open: 4, high: 4, low: 4, close: 4, volume: 1 }]);
    expect(findGaps(b.all, '1m')).toEqual([{ from: 120, to: 240 }]);
    b.merge([{ time: 120, open: 2, high: 2, low: 2, close: 2, volume: 1 }, { time: 180, open: 3, high: 3, low: 3, close: 3, volume: 1 }, { time: 240, open: 4, high: 4.5, low: 4, close: 4.2, volume: 2 }]);
    expect(b.all.map((c) => c.time)).toEqual([60, 120, 180, 240]);
    expect(b.last!.high).toBe(4.5);
    expect(findGaps(b.all, '1m')).toEqual([]);
  });
});

describe('aggregation', () => {
  const mk = (time: number, o: number, h: number, l: number, c: number, v = 1): Candle => ({ time, open: o, high: h, low: l, close: c, volume: v });
  it('aggregates 1m into 3m', () => {
    const out = aggregateCandles([mk(0, 1, 2, 0.5, 1.5), mk(60, 1.5, 3, 1, 2), mk(120, 2, 2.5, 1.8, 2.2), mk(180, 2.2, 2.3, 2, 2.1)], '3m');
    expect(out).toEqual([mk(0, 1, 3, 0.5, 2.2, 3), mk(180, 2.2, 2.3, 2, 2.1, 1)]);
  });
  it('picks the largest dividing base timeframe', () => {
    expect(pickBaseTimeframe('3m', ['1m', '5m', '15m', '1h', '6h', '1D'])).toBe('1m');
    expect(pickBaseTimeframe('4h', ['1m', '5m', '15m', '1h', '6h', '1D'])).toBe('1h');
    expect(pickBaseTimeframe('12h', ['1m', '5m', '15m', '1h', '6h', '1D'])).toBe('6h');
    expect(pickBaseTimeframe('1W', ['1m', '5m', '15m', '1h', '6h', '1D'])).toBe('1D');
    expect(pickBaseTimeframe('1h', ['1m', '1h'])).toBe('1h');
  });
  it('merges and sorts', () => {
    expect(mergeCandles([mk(60, 1, 1, 1, 1)], [mk(0, 0, 0, 0, 0), mk(60, 2, 2, 2, 2)]).map((c) => [c.time, c.close])).toEqual([[0, 0], [60, 2]]);
  });
  it('computes Heikin-Ashi', () => {
    const ha = toHeikinAshi([mk(0, 10, 12, 8, 11), mk(60, 11, 13, 10, 12)]);
    expect(ha[0]).toEqual({ time: 0, open: 10.5, high: 12, low: 8, close: 10.25, volume: 1 });
    expect(ha[1]!.open).toBeCloseTo((10.5 + 10.25) / 2);
    expect(ha[1]!.close).toBeCloseTo((11 + 13 + 10 + 12) / 4);
  });
});
