import type { VercelRequest, VercelResponse } from '@vercel/node';
import { cacheFor, cors, handleError, memoize, param } from '../_lib/http';
import { listAssets } from '../_lib/alpaca';

export default async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
  if (cors(req, res)) return;
  const q = (param(req, 'q') ?? '').trim().toUpperCase();
  const limit = Math.min(Number(param(req, 'limit') ?? 20), 50);
  if (!q) {
    res.status(200).json({ results: [] });
    return;
  }
  try {
    // The asset list (~10k rows) is cached per warm instance for an hour.
    const assets = await memoize('assets', 3600_000, listAssets);
    const results = assets
      .filter((a) => a.tradable && a.status === 'active')
      .map((a) => ({ a, score: a.symbol === q ? 100 : a.symbol.startsWith(q) ? 80 : a.name.toUpperCase().includes(q) ? 40 : 0 }))
      .filter((x) => x.score > 0)
      .sort((x, y) => y.score - x.score || x.a.symbol.length - y.a.symbol.length)
      .slice(0, limit)
      .map(({ a }) => ({ symbol: a.symbol, name: a.name, exchange: a.exchange }));
    cacheFor(res, 3600, 86400);
    res.status(200).json({ results });
  } catch (e) {
    handleError(res, e);
  }
}
