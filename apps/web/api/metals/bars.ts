import type { VercelRequest, VercelResponse } from '@vercel/node';
import { cacheFor, cors, handleError, memoize, param, sendError } from '../_lib/http.js';
import { timeSeries, toTwelveSymbol } from '../_lib/twelvedata.js';

const INTERVALS: Record<string, { td: string; seconds: number }> = {
  '1m': { td: '1min', seconds: 60 }, '3m': { td: '1min', seconds: 180 }, '5m': { td: '5min', seconds: 300 }, '15m': { td: '15min', seconds: 900 }, '30m': { td: '30min', seconds: 1800 },
  '1h': { td: '1h', seconds: 3600 }, '2h': { td: '2h', seconds: 7200 }, '4h': { td: '4h', seconds: 14400 }, '6h': { td: '2h', seconds: 21600 }, '12h': { td: '4h', seconds: 43200 },
  '1D': { td: '1day', seconds: 86400 }, '1W': { td: '1week', seconds: 604800 }, '1M': { td: '1month', seconds: 2592000 },
};

export default async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
  if (cors(req, res)) return;
  const ticker = (param(req, 'symbol') ?? 'XAUUSD').toUpperCase();
  const tf = param(req, 'timeframe') ?? '1h';
  const limit = Math.min(Number(param(req, 'limit') ?? 500), 5000);
  const end = param(req, 'end');
  const iv = INTERVALS[tf];
  if (!iv) return sendError(res, 400, 'bad_request', 'Invalid timeframe');
  try {
    const symbol = toTwelveSymbol(ticker);
    const ratio = Math.ceil(iv.seconds / tdSeconds(iv.td));
    const endDate = end ? new Date(Number(end) * 1000).toISOString().slice(0, 19).replace('T', ' ') : undefined;
    const rows = await memoize(`mb:${symbol}:${iv.td}:${limit}:${endDate ?? ''}`, 50000, () => timeSeries(symbol, iv.td, Math.min(limit * ratio, 5000), endDate));
    let bars = rows
      .map((r) => ({ t: Math.floor(Date.parse(r.datetime.replace(' ', 'T') + 'Z') / 1000), o: +r.open, h: +r.high, l: +r.low, c: +r.close, v: Number(r.volume ?? 0) }))
      .filter((b) => Number.isFinite(b.t))
      .sort((a, b) => a.t - b.t);
    if (ratio > 1) bars = aggregate(bars, iv.seconds);
    cacheFor(res, end ? 600 : 50, end ? 1200 : 120);
    res.status(200).json({ symbol: ticker, timeframe: tf, source: 'Twelve Data (spot)', bars: bars.slice(-limit) });
  } catch (e) {
    if (e instanceof Error && /Unsupported metal/.test(e.message)) return sendError(res, 400, 'bad_symbol', e.message);
    handleError(res, e);
  }
}

function tdSeconds(td: string): number {
  return { '1min': 60, '5min': 300, '15min': 900, '30min': 1800, '1h': 3600, '2h': 7200, '4h': 14400, '1day': 86400, '1week': 604800, '1month': 2592000 }[td] ?? 60;
}

function aggregate(bars: Array<{ t: number; o: number; h: number; l: number; c: number; v: number }>, size: number) {
  const out: typeof bars = [];
  let cur: (typeof bars)[number] | null = null;
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
