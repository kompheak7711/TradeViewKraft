import type { VercelRequest, VercelResponse } from '@vercel/node';
import { cacheFor, cors, handleError, memoize, param, sendError } from '../_lib/http.js';
import { getBars } from '../_lib/alpaca.js';

const TIMEFRAMES = new Set(['1Min', '3Min', '5Min', '15Min', '30Min', '1Hour', '2Hour', '4Hour', '6Hour', '12Hour', '1Day', '1Week', '1Month']);

export default async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
  if (cors(req, res)) return;
  const symbol = (param(req, 'symbol') ?? '').toUpperCase();
  const timeframe = param(req, 'timeframe') ?? '1Hour';
  const limit = Math.min(Number(param(req, 'limit') ?? 1000), 10000);
  const end = param(req, 'end');
  const start = param(req, 'start');
  if (!/^[A-Z.]{1,10}$/.test(symbol)) return sendError(res, 400, 'bad_request', 'Invalid symbol');
  if (!TIMEFRAMES.has(timeframe)) return sendError(res, 400, 'bad_request', 'Invalid timeframe');
  try {
    const key = `bars:${symbol}:${timeframe}:${limit}:${end ?? ''}:${start ?? ''}`;
    const bars = await memoize(key, 15000, () =>
      getBars(symbol, timeframe, {
        limit,
        end: end ? new Date(Number(end) * 1000).toISOString() : undefined,
        start: start ? new Date(Number(start) * 1000).toISOString() : undefined,
      }),
    );
    // Intraday bars for the current day change constantly; cache briefly. Older pages can be cached longer.
    cacheFor(res, end ? 300 : 10, end ? 600 : 30);
    res.status(200).json({
      symbol,
      timeframe,
      source: 'IEX',
      bars: bars.map((b) => ({ t: Math.floor(Date.parse(b.t) / 1000), o: b.o, h: b.h, l: b.l, c: b.c, v: b.v })).sort((a, b) => a.t - b.t),
    });
  } catch (e) {
    handleError(res, e);
  }
}
