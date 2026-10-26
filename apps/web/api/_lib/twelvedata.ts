import { fetchJson, UpstreamError } from './http';

const BASE = 'https://api.twelvedata.com';

/** METALS:XAUUSD → Twelve Data "XAU/USD". */
export function toTwelveSymbol(ticker: string): string {
  const t = ticker.toUpperCase();
  if (t === 'XAUUSD') return 'XAU/USD';
  if (t === 'XAGUSD') return 'XAG/USD';
  throw new UpstreamError(400, `Unsupported metal symbol ${ticker}`, 'bad_symbol');
}

export function twelveKey(): string {
  const k = process.env.TWELVEDATA_API_KEY;
  if (!k) throw new UpstreamError(503, 'Metals relay is not configured: set TWELVEDATA_API_KEY', 'no_key');
  return k;
}

interface TdError { status: 'error'; code: number; message: string }

function assertOk<T>(r: T | TdError): T {
  const e = r as TdError;
  if (e && e.status === 'error') throw new UpstreamError(e.code === 429 ? 429 : 502, e.message, e.code === 429 ? 'rate_limited' : 'upstream');
  return r as T;
}

export interface TdQuote { symbol: string; close: string; previous_close: string; timestamp: number; is_market_open: boolean }

export async function quote(symbols: string[]): Promise<Record<string, TdQuote>> {
  const params = new URLSearchParams({ symbol: symbols.join(','), apikey: twelveKey() });
  const r = assertOk(await fetchJson<Record<string, TdQuote> | TdQuote | TdError>(`${BASE}/quote?${params}`));
  // Single symbol returns the object directly; multiple returns a map.
  if ('symbol' in (r as TdQuote)) return { [(r as TdQuote).symbol]: r as TdQuote };
  return r as Record<string, TdQuote>;
}

export interface TdBar { datetime: string; open: string; high: string; low: string; close: string; volume?: string }

export async function timeSeries(symbol: string, interval: string, outputsize: number, endDate?: string): Promise<TdBar[]> {
  const params = new URLSearchParams({ symbol, interval, outputsize: String(Math.min(outputsize, 5000)), apikey: twelveKey(), timezone: 'UTC', order: 'desc' });
  if (endDate) params.set('end_date', endDate);
  const r = assertOk(await fetchJson<{ values: TdBar[] } | TdError>(`${BASE}/time_series?${params}`));
  return (r as { values: TdBar[] }).values ?? [];
}
