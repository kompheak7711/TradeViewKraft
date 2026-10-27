export interface Bar { t: number; o: number; h: number; l: number; c: number; v: number }

/** Aggregate bars into fixed-size buckets (seconds). Input must be sorted ascending. */
export function aggregate(bars: Bar[], size: number): Bar[] {
  const out: Bar[] = [];
  let cur: Bar | null = null;
  for (const b of bars) {
    const bucket = Math.floor(b.t / size) * size;
    if (!cur || cur.t !== bucket) {
      if (cur) out.push(cur);
      cur = { t: bucket, o: b.o, h: b.h, l: b.l, c: b.c, v: b.v };
    } else {
      cur.h = Math.max(cur.h, b.h);
      cur.l = Math.min(cur.l, b.l);
      cur.c = b.c;
      cur.v += b.v;
    }
  }
  if (cur) out.push(cur);
  return out;
}

/** Twelve Data interval per app timeframe, plus the bucket size in seconds for aggregation. */
export const TD_INTERVALS: Record<string, { td: string; seconds: number }> = {
  '1m': { td: '1min', seconds: 60 }, '3m': { td: '1min', seconds: 180 }, '5m': { td: '5min', seconds: 300 }, '15m': { td: '15min', seconds: 900 }, '30m': { td: '30min', seconds: 1800 },
  '1h': { td: '1h', seconds: 3600 }, '2h': { td: '2h', seconds: 7200 }, '4h': { td: '4h', seconds: 14400 }, '6h': { td: '2h', seconds: 21600 }, '12h': { td: '4h', seconds: 43200 },
  '1D': { td: '1day', seconds: 86400 }, '1W': { td: '1week', seconds: 604800 }, '1M': { td: '1month', seconds: 2592000 },
};

export function tdSeconds(td: string): number {
  return { '1min': 60, '5min': 300, '15min': 900, '30min': 1800, '1h': 3600, '2h': 7200, '4h': 14400, '1day': 86400, '1week': 604800, '1month': 2592000 }[td] ?? 60;
}

/** Alpaca-style timeframe names (sent by the client) → app timeframe keys. */
export const ALPACA_TO_APP: Record<string, string> = {
  '1Min': '1m', '3Min': '3m', '5Min': '5m', '15Min': '15m', '30Min': '30m', '1Hour': '1h', '2Hour': '2h', '4Hour': '4h', '6Hour': '6h', '12Hour': '12h', '1Day': '1D', '1Week': '1W', '1Month': '1M',
};
