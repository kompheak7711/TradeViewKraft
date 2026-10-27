/**
 * Generic read-only relay for exchanges whose public REST endpoints block browser CORS.
 * Binance is NOT allowed here: it returns HTTP 451 to datacenter IPs including Vercel, so Binance
 * traffic always goes direct from the client (browser or Tauri).
 */
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { cacheFor, cors, handleError, param, sendError } from './_lib/http.js';

const ALLOWED_HOSTS = new Set(['api.bybit.com', 'www.okx.com', 'api.kraken.com', 'api.exchange.coinbase.com']);
const ALLOWED_PATH = /^\/(v5\/market\/|api\/v5\/(market|public)\/|0\/public\/|products\/?)/;

export default async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
  if (cors(req, res)) return;
  const target = param(req, 'url');
  if (!target) return sendError(res, 400, 'bad_request', 'Missing url');
  let u: URL;
  try {
    u = new URL(target);
  } catch {
    return sendError(res, 400, 'bad_request', 'Invalid url');
  }
  if (u.protocol !== 'https:' || !ALLOWED_HOSTS.has(u.host) || !ALLOWED_PATH.test(u.pathname)) return sendError(res, 403, 'forbidden', 'Host or path not allowed');
  try {
    const r = await fetch(u.toString(), { headers: { Accept: 'application/json', 'User-Agent': 'TradingViewKraft/0.1 (+relay)' }, signal: AbortSignal.timeout(10000) });
    const body = await r.text();
    cacheFor(res, 5, 30);
    res.status(r.status).setHeader('Content-Type', r.headers.get('content-type') ?? 'application/json').send(body);
  } catch (e) {
    handleError(res, e);
  }
}
