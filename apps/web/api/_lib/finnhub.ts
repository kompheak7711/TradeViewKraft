import { fetchJson, UpstreamError } from './http.js';

export const FINNHUB_REST = 'https://finnhub.io/api/v1';
export const FINNHUB_WS = 'wss://ws.finnhub.io';

/** Finnhub free plan: 60 REST calls/min, 50 symbols per websocket, 1 connection. Any country can sign up. */
export function finnhubKey(): string | null {
  return process.env.FINNHUB_API_KEY || null;
}

function key(): string {
  const k = finnhubKey();
  if (!k) throw new UpstreamError(503, 'Stock relay is not configured: set FINNHUB_API_KEY (or ALPACA_KEY_ID/ALPACA_SECRET_KEY)', 'no_key');
  return k;
}

export interface FinnhubQuote { c: number; d: number; dp: number; h: number; l: number; o: number; pc: number; t: number }

export async function quote(symbol: string): Promise<FinnhubQuote> {
  return fetchJson<FinnhubQuote>(`${FINNHUB_REST}/quote?symbol=${encodeURIComponent(symbol)}&token=${key()}`);
}

export interface FinnhubSearchResult { symbol: string; description: string; type: string; displaySymbol: string }

export async function search(q: string): Promise<FinnhubSearchResult[]> {
  const r = await fetchJson<{ result: FinnhubSearchResult[] }>(`${FINNHUB_REST}/search?q=${encodeURIComponent(q)}&exchange=US&token=${key()}`);
  return r.result ?? [];
}
