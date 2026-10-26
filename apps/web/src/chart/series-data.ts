import type { Candle, ChartType } from '@tvk/shared-types';
import { toHeikinAshi } from '@tvk/market-data';
import type { Time, UTCTimestamp } from 'lightweight-charts';

export type OhlcPoint = { time: UTCTimestamp; open: number; high: number; low: number; close: number };
export type ValuePoint = { time: UTCTimestamp; value: number };

export const asTime = (t: number): UTCTimestamp => t as UTCTimestamp;

/** Transform candles into the data shape required by the active chart type. */
export function toSeriesData(candles: readonly Candle[], type: ChartType): Array<OhlcPoint | ValuePoint> {
  switch (type) {
    case 'heikinashi':
      return toHeikinAshi(candles).map((c) => ({ time: asTime(c.time), open: c.open, high: c.high, low: c.low, close: c.close }));
    case 'line':
    case 'area':
      return candles.map((c) => ({ time: asTime(c.time), value: c.close }));
    default:
      return candles.map((c) => ({ time: asTime(c.time), open: c.open, high: c.high, low: c.low, close: c.close }));
  }
}

/** Last point only (for cheap live updates). Heikin-Ashi needs the previous HA candle so we recompute the tail. */
export function lastSeriesPoint(candles: readonly Candle[], type: ChartType): OhlcPoint | ValuePoint | null {
  const last = candles[candles.length - 1];
  if (!last) return null;
  if (type === 'heikinashi') {
    // The first HA candle of a slice is seeded from itself, so use a long window for accuracy.
    const ha = toHeikinAshi(candles.slice(-200));
    const x = ha[ha.length - 1]!;
    return { time: asTime(x.time), open: x.open, high: x.high, low: x.low, close: x.close };
  }
  if (type === 'line' || type === 'area') return { time: asTime(last.time), value: last.close };
  return { time: asTime(last.time), open: last.open, high: last.high, low: last.low, close: last.close };
}

export function isWhitespace(v: number): boolean {
  return !Number.isFinite(v);
}

export function timeOf(p: { time: Time }): number {
  return p.time as number;
}
