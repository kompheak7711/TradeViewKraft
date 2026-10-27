import type { VercelRequest, VercelResponse } from '@vercel/node';
import { cacheFor, cors, handleError, memoize, param, sendError } from '../_lib/http.js';
import { timeSeries, toTwelveSymbol } from '../_lib/twelvedata.js';
import { aggregate, TD_INTERVALS as INTERVALS, tdSeconds } from '../_lib/bars.js';

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

