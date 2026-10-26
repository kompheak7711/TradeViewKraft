/**
 * Indicator math. All functions are pure and return arrays aligned with the input candles
 * (NaN where the indicator is not yet defined), so they can be mapped straight to series data.
 */
import type { Candle, IndicatorConfig, IndicatorId } from '@tvk/shared-types';

export type Series = number[];

export function sma(values: readonly number[], period: number): Series {
  const out = new Array<number>(values.length).fill(NaN);
  if (period <= 0) return out;
  let sum = 0;
  for (let i = 0; i < values.length; i++) {
    sum += values[i]!;
    if (i >= period) sum -= values[i - period]!;
    if (i >= period - 1) out[i] = sum / period;
  }
  return out;
}

export function ema(values: readonly number[], period: number): Series {
  const out = new Array<number>(values.length).fill(NaN);
  if (period <= 0 || values.length === 0) return out;
  const k = 2 / (period + 1);
  // Seed with the SMA of the first `period` values (standard TA convention).
  let seedSum = 0;
  for (let i = 0; i < values.length; i++) {
    const v = values[i]!;
    if (i < period - 1) {
      seedSum += v;
      continue;
    }
    if (i === period - 1) {
      seedSum += v;
      out[i] = seedSum / period;
      continue;
    }
    out[i] = v * k + out[i - 1]! * (1 - k);
  }
  return out;
}

/** Volume-weighted average price, reset at the start of each UTC day (session) by default. */
export function vwap(candles: readonly Candle[], sessionSeconds = 86400): Series {
  const out = new Array<number>(candles.length).fill(NaN);
  let pv = 0;
  let vol = 0;
  let session = -1;
  for (let i = 0; i < candles.length; i++) {
    const c = candles[i]!;
    const s = Math.floor(c.time / sessionSeconds);
    if (s !== session) {
      session = s;
      pv = 0;
      vol = 0;
    }
    const typical = (c.high + c.low + c.close) / 3;
    pv += typical * c.volume;
    vol += c.volume;
    out[i] = vol > 0 ? pv / vol : typical;
  }
  return out;
}

export function stddev(values: readonly number[], period: number): Series {
  const out = new Array<number>(values.length).fill(NaN);
  if (period <= 0) return out;
  let sum = 0;
  let sumSq = 0;
  for (let i = 0; i < values.length; i++) {
    const v = values[i]!;
    sum += v;
    sumSq += v * v;
    if (i >= period) {
      const old = values[i - period]!;
      sum -= old;
      sumSq -= old * old;
    }
    if (i >= period - 1) {
      const mean = sum / period;
      const variance = Math.max(0, sumSq / period - mean * mean);
      out[i] = Math.sqrt(variance);
    }
  }
  return out;
}

export interface Bands { upper: Series; middle: Series; lower: Series }

export function bollinger(values: readonly number[], period = 20, mult = 2): Bands {
  const middle = sma(values, period);
  const sd = stddev(values, period);
  const upper = middle.map((m, i) => m + mult * sd[i]!);
  const lower = middle.map((m, i) => m - mult * sd[i]!);
  return { upper, middle, lower };
}

/** Wilder's RSI. */
export function rsi(values: readonly number[], period = 14): Series {
  const out = new Array<number>(values.length).fill(NaN);
  if (values.length <= period) return out;
  let gain = 0;
  let loss = 0;
  for (let i = 1; i <= period; i++) {
    const d = values[i]! - values[i - 1]!;
    if (d > 0) gain += d;
    else loss -= d;
  }
  let avgGain = gain / period;
  let avgLoss = loss / period;
  out[period] = avgLoss === 0 ? 100 : 100 - 100 / (1 + avgGain / avgLoss);
  for (let i = period + 1; i < values.length; i++) {
    const d = values[i]! - values[i - 1]!;
    avgGain = (avgGain * (period - 1) + Math.max(d, 0)) / period;
    avgLoss = (avgLoss * (period - 1) + Math.max(-d, 0)) / period;
    out[i] = avgLoss === 0 ? 100 : 100 - 100 / (1 + avgGain / avgLoss);
  }
  return out;
}

export interface Macd { macd: Series; signal: Series; histogram: Series }

export function macd(values: readonly number[], fast = 12, slow = 26, signalPeriod = 9): Macd {
  const f = ema(values, fast);
  const s = ema(values, slow);
  const line = f.map((v, i) => v - s[i]!);
  // Signal EMA is computed only over defined MACD values.
  const firstDefined = line.findIndex((v) => !Number.isNaN(v));
  const signal = new Array<number>(values.length).fill(NaN);
  if (firstDefined >= 0) {
    const sig = ema(line.slice(firstDefined), signalPeriod);
    for (let i = 0; i < sig.length; i++) signal[firstDefined + i] = sig[i]!;
  }
  const histogram = line.map((v, i) => v - signal[i]!);
  return { macd: line, signal, histogram };
}

export const closes = (c: readonly Candle[]): number[] => c.map((x) => x.close);

export interface IndicatorDefinition {
  type: IndicatorId;
  name: string;
  /** Overlay on the price pane or in a separate pane. */
  pane: 'price' | 'separate';
  params: Array<{ key: string; label: string; default: number; min: number; max: number }>;
  defaultColor: string;
}

export const INDICATOR_DEFINITIONS: Record<IndicatorId, IndicatorDefinition> = {
  sma: { type: 'sma', name: 'Moving Average (SMA)', pane: 'price', params: [{ key: 'length', label: 'Length', default: 20, min: 1, max: 500 }], defaultColor: '#f5a524' },
  ema: { type: 'ema', name: 'Exponential Moving Average', pane: 'price', params: [{ key: 'length', label: 'Length', default: 20, min: 1, max: 500 }], defaultColor: '#3b82f6' },
  vwap: { type: 'vwap', name: 'VWAP', pane: 'price', params: [], defaultColor: '#a855f7' },
  bb: { type: 'bb', name: 'Bollinger Bands', pane: 'price', params: [{ key: 'length', label: 'Length', default: 20, min: 1, max: 500 }, { key: 'mult', label: 'StdDev', default: 2, min: 0.1, max: 10 }], defaultColor: '#06b6d4' },
  rsi: { type: 'rsi', name: 'Relative Strength Index', pane: 'separate', params: [{ key: 'length', label: 'Length', default: 14, min: 2, max: 200 }], defaultColor: '#a855f7' },
  macd: { type: 'macd', name: 'MACD', pane: 'separate', params: [{ key: 'fast', label: 'Fast', default: 12, min: 1, max: 200 }, { key: 'slow', label: 'Slow', default: 26, min: 1, max: 400 }, { key: 'signal', label: 'Signal', default: 9, min: 1, max: 200 }], defaultColor: '#3b82f6' },
  volume: { type: 'volume', name: 'Volume', pane: 'separate', params: [], defaultColor: '#64748b' },
};

export interface IndicatorLine {
  key: string;
  label: string;
  values: Series;
  color: string;
  style?: 'line' | 'histogram';
}

export interface IndicatorOutput {
  id: string;
  type: IndicatorId;
  pane: 'price' | 'separate';
  lines: IndicatorLine[];
  /** For histogram lines: per-bar colors (e.g. volume up/down). */
  colors?: string[];
}

export function createIndicatorConfig(type: IndicatorId, id = `${type}-${Math.random().toString(36).slice(2, 8)}`): IndicatorConfig {
  const def = INDICATOR_DEFINITIONS[type];
  const params: Record<string, number> = {};
  for (const p of def.params) params[p.key] = p.default;
  return { id, type, params, color: def.defaultColor, visible: true };
}

/** Compute an indicator for a config. The result is aligned to `candles`. */
export function computeIndicator(cfg: IndicatorConfig, candles: readonly Candle[]): IndicatorOutput {
  const c = closes(candles);
  const color = cfg.color ?? INDICATOR_DEFINITIONS[cfg.type].defaultColor;
  const p = cfg.params;
  switch (cfg.type) {
    case 'sma':
      return { id: cfg.id, type: cfg.type, pane: 'price', lines: [{ key: 'sma', label: `SMA ${p.length ?? 20}`, values: sma(c, p.length ?? 20), color }] };
    case 'ema':
      return { id: cfg.id, type: cfg.type, pane: 'price', lines: [{ key: 'ema', label: `EMA ${p.length ?? 20}`, values: ema(c, p.length ?? 20), color }] };
    case 'vwap':
      return { id: cfg.id, type: cfg.type, pane: 'price', lines: [{ key: 'vwap', label: 'VWAP', values: vwap(candles), color }] };
    case 'bb': {
      const b = bollinger(c, p.length ?? 20, p.mult ?? 2);
      return {
        id: cfg.id, type: cfg.type, pane: 'price',
        lines: [
          { key: 'upper', label: 'Upper', values: b.upper, color },
          { key: 'middle', label: `Basis ${p.length ?? 20}`, values: b.middle, color: '#f5a524' },
          { key: 'lower', label: 'Lower', values: b.lower, color },
        ],
      };
    }
    case 'rsi':
      return { id: cfg.id, type: cfg.type, pane: 'separate', lines: [{ key: 'rsi', label: `RSI ${p.length ?? 14}`, values: rsi(c, p.length ?? 14), color }] };
    case 'macd': {
      const m = macd(c, p.fast ?? 12, p.slow ?? 26, p.signal ?? 9);
      return {
        id: cfg.id, type: cfg.type, pane: 'separate',
        lines: [
          { key: 'histogram', label: 'Histogram', values: m.histogram, color: '#64748b', style: 'histogram' },
          { key: 'macd', label: 'MACD', values: m.macd, color },
          { key: 'signal', label: 'Signal', values: m.signal, color: '#f5a524' },
        ],
        colors: m.histogram.map((h, i) => (h >= 0 ? (i > 0 && h >= (m.histogram[i - 1] ?? 0) ? '#22c55e' : '#86efac') : i > 0 && h <= (m.histogram[i - 1] ?? 0) ? '#ef4444' : '#fca5a5')),
      };
    }
    case 'volume':
      return {
        id: cfg.id, type: cfg.type, pane: 'separate',
        lines: [{ key: 'volume', label: 'Volume', values: candles.map((x) => x.volume), color, style: 'histogram' }],
        colors: candles.map((x) => (x.close >= x.open ? 'rgba(34,197,94,0.5)' : 'rgba(239,68,68,0.5)')),
      };
  }
}
