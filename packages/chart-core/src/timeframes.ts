import type { Timeframe } from '@tvk/shared-types';
import { TIMEFRAME_SECONDS, TIMEFRAMES } from '@tvk/shared-types';

export const TIMEFRAME_LABELS: Record<Timeframe, string> = {
  '1m': '1 minute', '3m': '3 minutes', '5m': '5 minutes', '15m': '15 minutes', '30m': '30 minutes',
  '1h': '1 hour', '2h': '2 hours', '4h': '4 hours', '6h': '6 hours', '12h': '12 hours',
  '1D': '1 day', '1W': '1 week', '1M': '1 month',
};

export const TIMEFRAME_GROUPS: Array<{ label: string; items: Timeframe[] }> = [
  { label: 'Minutes', items: ['1m', '3m', '5m', '15m', '30m'] },
  { label: 'Hours', items: ['1h', '2h', '4h', '6h', '12h'] },
  { label: 'Days', items: ['1D', '1W', '1M'] },
];

export const QUICK_TIMEFRAMES: Timeframe[] = ['1m', '5m', '15m', '1h', '4h', '1D', '1W'];

export function isTimeframe(x: string): x is Timeframe {
  return (TIMEFRAMES as readonly string[]).includes(x);
}

export function timeframeSeconds(tf: Timeframe): number {
  return TIMEFRAME_SECONDS[tf];
}

/** Map chart time to a logical bar index given a sorted candle time array, extrapolating beyond both ends. */
export function timeToLogical(times: readonly number[], time: number, tf: Timeframe): number {
  if (times.length === 0) return 0;
  const step = TIMEFRAME_SECONDS[tf];
  const first = times[0]!;
  const last = times[times.length - 1]!;
  if (time <= first) return (time - first) / step;
  if (time >= last) return times.length - 1 + (time - last) / step;
  let lo = 0;
  let hi = times.length - 1;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (times[mid]! < time) lo = mid + 1;
    else hi = mid;
  }
  const idx = lo;
  const t1 = times[idx]!;
  if (t1 === time) return idx;
  const t0 = times[idx - 1]!;
  return idx - 1 + (time - t0) / (t1 - t0);
}

export function logicalToTime(times: readonly number[], logical: number, tf: Timeframe): number {
  if (times.length === 0) return logical * TIMEFRAME_SECONDS[tf];
  const step = TIMEFRAME_SECONDS[tf];
  const n = times.length;
  if (logical <= 0) return times[0]! + logical * step;
  if (logical >= n - 1) return times[n - 1]! + (logical - (n - 1)) * step;
  const i = Math.floor(logical);
  const frac = logical - i;
  return times[i]! + (times[i + 1]! - times[i]!) * frac;
}
