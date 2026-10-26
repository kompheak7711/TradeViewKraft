import type { VercelRequest, VercelResponse } from '@vercel/node';
import { cacheFor, cors, handleError, memoize, param, sendError } from '../_lib/http';
import { quote, toTwelveSymbol } from '../_lib/twelvedata';

/** Spot quotes for gold/silver. Cached 55 s at the edge: 2 symbols × 60 req/h × 24 h ≈ 1440 credits/day worst case,
 *  but one /quote call with both symbols costs 1 credit per symbol, so the typical budget is ~1 call/min = well under 800/day
 *  when clients share the CDN cache. Memoized per instance as well. */
export default async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
  if (cors(req, res)) return;
  const tickers = (param(req, 'symbols') ?? 'XAUUSD,XAGUSD').toUpperCase().split(',').map((s) => s.trim()).filter(Boolean);
  try {
    const mapped = tickers.map(toTwelveSymbol);
    const data = await memoize(`mq:${mapped.join(',')}`, 55000, () => quote(mapped));
    cacheFor(res, 55, 120);
    res.status(200).json({
      quotes: tickers.map((t, i) => {
        const q = data[mapped[i]!];
        return { symbol: t, price: Number(q?.close ?? 0), prevClose: Number(q?.previous_close ?? 0), time: (q?.timestamp ?? Math.floor(Date.now() / 1000)) * 1000, source: 'Twelve Data (spot)', marketOpen: q?.is_market_open ?? null };
      }),
    });
  } catch (e) {
    if (e instanceof Error && /Unsupported metal/.test(e.message)) return sendError(res, 400, 'bad_symbol', e.message);
    handleError(res, e);
  }
}
