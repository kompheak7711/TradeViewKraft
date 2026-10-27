import type { VercelRequest, VercelResponse } from '@vercel/node';
import { cacheFor, cors, handleError, memoize, param, sendError } from '../_lib/http.js';
import { alpacaKeys, getSnapshots } from '../_lib/alpaca.js';
import { quote as finnhubQuote } from '../_lib/finnhub.js';

export default async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
  if (cors(req, res)) return;
  const symbols = (param(req, 'symbols') ?? '').toUpperCase().split(',').map((s) => s.trim()).filter((s) => /^[A-Z.]{1,10}$/.test(s)).slice(0, 50);
  if (!symbols.length) return sendError(res, 400, 'bad_request', 'Provide symbols=AAPL,MSFT');
  try {
    if (!alpacaKeys()) {
      // Finnhub /quote: one call per symbol (60/min free). Memoized 10 s so watchlist polling from several devices shares calls.
      const quotes = await Promise.all(symbols.map((s) => memoize(`fhq:${s}`, 10000, () => finnhubQuote(s))));
      cacheFor(res, 5, 15);
      res.status(200).json({
        snapshots: symbols.map((s, i) => {
          const q = quotes[i]!;
          return { symbol: s, price: q.c, prevClose: q.pc || q.c, time: (q.t || Math.floor(Date.now() / 1000)) * 1000, source: 'Finnhub', delayed: false };
        }),
      });
      return;
    }
    const snaps = await memoize(`snap:${symbols.sort().join(',')}`, 3000, () => getSnapshots(symbols));
    cacheFor(res, 3, 10);
    res.status(200).json({
      snapshots: symbols.map((s) => {
        const snap = snaps[s];
        const price = snap?.latestTrade?.p ?? snap?.dailyBar?.c ?? 0;
        const prevClose = snap?.prevDailyBar?.c ?? snap?.dailyBar?.o ?? price;
        return { symbol: s, price, prevClose, time: snap?.latestTrade ? Date.parse(snap.latestTrade.t) : Date.now(), source: 'IEX', delayed: false };
      }),
    });
  } catch (e) {
    handleError(res, e);
  }
}
