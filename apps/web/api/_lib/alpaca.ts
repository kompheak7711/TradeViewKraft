import { fetchJson, UpstreamError } from './http';

export const ALPACA_DATA = 'https://data.alpaca.markets';
export const ALPACA_API = 'https://api.alpaca.markets';
export const ALPACA_STREAM = 'wss://stream.data.alpaca.markets/v2';

export function alpacaKeys(): { key: string; secret: string; feed: string } | null {
  const key = process.env.ALPACA_KEY_ID;
  const secret = process.env.ALPACA_SECRET_KEY;
  if (!key || !secret) return null;
  return { key, secret, feed: process.env.ALPACA_FEED || 'iex' };
}

export function alpacaHeaders(): Record<string, string> {
  const k = alpacaKeys();
  if (!k) throw new UpstreamError(503, 'Stock relay is not configured: set ALPACA_KEY_ID and ALPACA_SECRET_KEY', 'no_key');
  return { 'APCA-API-KEY-ID': k.key, 'APCA-API-SECRET-KEY': k.secret, Accept: 'application/json' };
}

export interface AlpacaBar { t: string; o: number; h: number; l: number; c: number; v: number; n: number; vw: number }

export async function getBars(symbol: string, timeframe: string, opts: { start?: string; end?: string; limit?: number }): Promise<AlpacaBar[]> {
  const k = alpacaKeys();
  const params = new URLSearchParams({ timeframe, limit: String(Math.min(opts.limit ?? 1000, 10000)), feed: k?.feed ?? 'iex', adjustment: 'split', sort: 'desc' });
  if (opts.start) params.set('start', opts.start);
  if (opts.end) params.set('end', opts.end);
  const out: AlpacaBar[] = [];
  let pageToken: string | undefined;
  do {
    if (pageToken) params.set('page_token', pageToken);
    const r = await fetchJson<{ bars: AlpacaBar[] | null; next_page_token: string | null }>(`${ALPACA_DATA}/v2/stocks/${encodeURIComponent(symbol)}/bars?${params}`, { headers: alpacaHeaders() });
    out.push(...(r.bars ?? []));
    pageToken = r.next_page_token ?? undefined;
  } while (pageToken && out.length < (opts.limit ?? 1000));
  return out;
}

export interface AlpacaSnapshot { latestTrade?: { p: number; t: string }; latestQuote?: { bp: number; ap: number; t: string }; dailyBar?: { c: number; o: number }; prevDailyBar?: { c: number } }

export async function getSnapshots(symbols: string[]): Promise<Record<string, AlpacaSnapshot>> {
  const k = alpacaKeys();
  const params = new URLSearchParams({ symbols: symbols.join(','), feed: k?.feed ?? 'iex' });
  return fetchJson<Record<string, AlpacaSnapshot>>(`${ALPACA_DATA}/v2/stocks/snapshots?${params}`, { headers: alpacaHeaders() });
}

export interface AlpacaAsset { symbol: string; name: string; exchange: string; status: string; tradable: boolean; class: string }

export async function listAssets(): Promise<AlpacaAsset[]> {
  return fetchJson<AlpacaAsset[]>(`${ALPACA_API}/v2/assets?status=active&asset_class=us_equity`, { headers: alpacaHeaders() }, 20000);
}
