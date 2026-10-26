import type { Candle, CandleUpdate, SymbolId, Tick, Timeframe } from '@tvk/shared-types';
import { TIMEFRAME_SECONDS } from '@tvk/shared-types';

/** Start of the bucket (UNIX seconds, UTC) containing `timeSec` for the given timeframe. */
export function bucketStart(timeSec: number, tf: Timeframe): number {
  if (tf === '1W') {
    // ISO weeks start on Monday 00:00 UTC. Epoch (1970-01-01) was a Thursday; the first Monday is 4 days later.
    const day = 86400;
    const shifted = timeSec - 4 * day;
    return Math.floor(shifted / (7 * day)) * 7 * day + 4 * day;
  }
  if (tf === '1M') {
    const d = new Date(timeSec * 1000);
    return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1) / 1000;
  }
  const size = TIMEFRAME_SECONDS[tf];
  return Math.floor(timeSec / size) * size;
}

/** Start of the bucket that follows the one starting at `bucket`. */
export function nextBucket(bucket: number, tf: Timeframe): number {
  if (tf === '1M') {
    const d = new Date(bucket * 1000);
    return Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 1) / 1000;
  }
  return bucket + TIMEFRAME_SECONDS[tf];
}

/** Merge two candle arrays, de-duplicating by time. Candles in `incoming` win on conflict. */
export function mergeCandles(existing: readonly Candle[], incoming: readonly Candle[]): Candle[] {
  if (incoming.length === 0) return [...existing];
  if (existing.length === 0) return [...incoming].sort((a, b) => a.time - b.time);
  const map = new Map<number, Candle>();
  for (const c of existing) map.set(c.time, c);
  for (const c of incoming) map.set(c.time, c);
  return [...map.values()].sort((a, b) => a.time - b.time);
}

/** Aggregate candles of a smaller timeframe into a larger one (e.g. 1m -> 3m, 1h -> 4h). */
export function aggregateCandles(candles: readonly Candle[], toTf: Timeframe): Candle[] {
  const out: Candle[] = [];
  let cur: Candle | null = null;
  for (const c of candles) {
    const b = bucketStart(c.time, toTf);
    if (!cur || cur.time !== b) {
      if (cur) out.push(cur);
      cur = { time: b, open: c.open, high: c.high, low: c.low, close: c.close, volume: c.volume };
    } else {
      cur.high = Math.max(cur.high, c.high);
      cur.low = Math.min(cur.low, c.low);
      cur.close = c.close;
      cur.volume += c.volume;
    }
  }
  if (cur) out.push(cur);
  return out;
}

/** Returns the time gaps (in bucket units) larger than one timeframe between consecutive candles. */
export function findGaps(candles: readonly Candle[], tf: Timeframe): Array<{ from: number; to: number }> {
  const gaps: Array<{ from: number; to: number }> = [];
  for (let i = 1; i < candles.length; i++) {
    const prev = candles[i - 1]!;
    const cur = candles[i]!;
    const expected = nextBucket(prev.time, tf);
    if (cur.time > expected) gaps.push({ from: expected, to: cur.time });
  }
  return gaps;
}

/**
 * Builds live candles from trade ticks on top of a seeded history.
 * Emits an update for every tick, flagging `closed` on the previous bucket when a new one opens.
 */
export class CandleBuilder {
  private candles: Candle[] = [];
  constructor(public readonly symbol: SymbolId, public readonly timeframe: Timeframe) {}

  /** Replace history. The last candle is treated as the currently-open bucket if it is still live. */
  seed(history: readonly Candle[]): void {
    this.candles = [...history].sort((a, b) => a.time - b.time);
  }

  /** Merge a backfill (e.g. after reconnect) with the live data without losing the open candle. */
  merge(incoming: readonly Candle[]): void {
    this.candles = mergeCandles(this.candles, incoming);
  }

  get all(): readonly Candle[] {
    return this.candles;
  }

  get last(): Candle | undefined {
    return this.candles[this.candles.length - 1];
  }

  /** Apply a trade tick. Returns updates: possibly the closed previous candle, then the updated open one. */
  applyTick(tick: Tick): CandleUpdate[] {
    const bucket = bucketStart(Math.floor(tick.time / 1000), this.timeframe);
    const last = this.last;
    const updates: CandleUpdate[] = [];
    if (!last || bucket > last.time) {
      if (last) updates.push({ symbol: this.symbol, timeframe: this.timeframe, candle: { ...last }, closed: true });
      const candle: Candle = { time: bucket, open: tick.price, high: tick.price, low: tick.price, close: tick.price, volume: tick.size };
      this.candles.push(candle);
      updates.push({ symbol: this.symbol, timeframe: this.timeframe, candle: { ...candle }, closed: false });
      return updates;
    }
    if (bucket < last.time) {
      // Late tick for an older bucket (clock skew): fold into that bucket if we have it, never rewind the open candle.
      const idx = this.indexOf(bucket);
      if (idx >= 0) {
        const c = this.candles[idx]!;
        c.high = Math.max(c.high, tick.price);
        c.low = Math.min(c.low, tick.price);
        c.volume += tick.size;
        updates.push({ symbol: this.symbol, timeframe: this.timeframe, candle: { ...c }, closed: idx < this.candles.length - 1 });
      }
      return updates;
    }
    last.high = Math.max(last.high, tick.price);
    last.low = Math.min(last.low, tick.price);
    last.close = tick.price;
    last.volume += tick.size;
    updates.push({ symbol: this.symbol, timeframe: this.timeframe, candle: { ...last }, closed: false });
    return updates;
  }

  /** Apply an exchange-pushed candle (kline stream). Replaces the matching bucket or appends. */
  applyCandle(candle: Candle, closed = false): CandleUpdate[] {
    const idx = this.indexOf(candle.time);
    if (idx >= 0) {
      this.candles[idx] = { ...candle };
    } else if (!this.last || candle.time > this.last.time) {
      this.candles.push({ ...candle });
    } else {
      this.candles = mergeCandles(this.candles, [candle]);
    }
    return [{ symbol: this.symbol, timeframe: this.timeframe, candle: { ...candle }, closed }];
  }

  private indexOf(time: number): number {
    // Binary search; candles are sorted by time.
    let lo = 0;
    let hi = this.candles.length - 1;
    while (lo <= hi) {
      const mid = (lo + hi) >> 1;
      const t = this.candles[mid]!.time;
      if (t === time) return mid;
      if (t < time) lo = mid + 1;
      else hi = mid - 1;
    }
    return -1;
  }
}

/** Convert candles to Heikin-Ashi candles. */
export function toHeikinAshi(candles: readonly Candle[]): Candle[] {
  const out: Candle[] = [];
  let prev: Candle | null = null;
  for (const c of candles) {
    const close = (c.open + c.high + c.low + c.close) / 4;
    const open = prev ? (prev.open + prev.close) / 2 : (c.open + c.close) / 2;
    const high = Math.max(c.high, open, close);
    const low = Math.min(c.low, open, close);
    const ha: Candle = { time: c.time, open, high, low, close, volume: c.volume };
    out.push(ha);
    prev = ha;
  }
  return out;
}
