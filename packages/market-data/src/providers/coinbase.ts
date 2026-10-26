import type { Candle, HistoryRequest, MarketDataProvider, MarketSession, Quote, SymbolId, SymbolInfo, Tick, Timeframe, Unsubscribe } from '@tvk/shared-types';
import { TIMEFRAME_SECONDS } from '@tvk/shared-types';
import { getJson } from '../http';
import { cryptoInfo, POPULAR_SYMBOLS, searchCatalog, splitBaseQuote, tickerOf } from '../symbols';
import { fetchWithAggregation, TradeStream, type ProviderCtorOptions } from './base';

const REST = 'https://api.exchange.coinbase.com';
const WS = 'wss://ws-feed.exchange.coinbase.com';
const NATIVE: readonly Timeframe[] = ['1m', '5m', '15m', '1h', '6h', '1D'];

export function toCoinbaseProduct(ticker: string): string {
  const s = splitBaseQuote(ticker);
  return s ? `${s.base}-${s.quote}` : ticker;
}

class CoinbaseStream extends TradeStream {
  protected url(): string {
    return WS;
  }
  protected streamKey(symbol: SymbolId): string {
    return toCoinbaseProduct(tickerOf(symbol));
  }
  protected subscribePayload(keys: string[]): string | null {
    return keys.length ? JSON.stringify({ type: 'subscribe', product_ids: keys, channels: ['matches', 'heartbeat'] }) : null;
  }
  protected unsubscribePayload(keys: string[]): string | null {
    return keys.length ? JSON.stringify({ type: 'unsubscribe', product_ids: keys, channels: ['matches', 'heartbeat'] }) : null;
  }
  protected parse(raw: string) {
    const m = JSON.parse(raw) as { type: string; product_id?: string; price?: string; size?: string; time?: string };
    if ((m.type === 'match' || m.type === 'last_match') && m.product_id && m.price) {
      return [{ key: m.product_id, tick: { time: Date.parse(m.time ?? '') || Date.now(), price: Number(m.price), size: Number(m.size ?? 0) } }];
    }
    return null;
  }
  protected override staleMs(): number {
    return 30000; // heartbeat channel sends every second
  }
}

export class CoinbaseProvider implements MarketDataProvider {
  readonly id = 'coinbase' as const;
  readonly exchanges = ['COINBASE'] as const;
  readonly assetClasses = ['crypto'] as const;
  private stream: CoinbaseStream;
  constructor(opts: ProviderCtorOptions = {}) {
    this.stream = new CoinbaseStream('coinbase', opts.wsFactory);
  }

  async searchSymbols(query: string, limit = 20): Promise<SymbolInfo[]> {
    const local = searchCatalog(query, POPULAR_SYMBOLS.filter((s) => s.exchange === 'COINBASE'), limit);
    if (local.length) return local;
    const t = query.toUpperCase().replace(/^COINBASE:/, '').replace(/[^A-Z0-9]/g, '');
    if (t.length < 5) return [];
    const info = await this.resolveSymbol(`COINBASE:${t}`).catch(() => null);
    return info ? [info] : [];
  }

  async resolveSymbol(symbol: SymbolId): Promise<SymbolInfo | null> {
    const product = toCoinbaseProduct(tickerOf(symbol));
    try {
      const p = await getJson<{ id: string; base_currency: string; quote_currency: string; quote_increment: string }>(`${REST}/products/${product}`, { relayOnNetworkError: true });
      const step = Number(p.quote_increment);
      const info = cryptoInfo('COINBASE', `${p.base_currency}${p.quote_currency}`, `${p.base_currency} / ${p.quote_currency}`);
      return { ...info, priceStep: step, pricePrecision: Math.max(0, Math.round(-Math.log10(step))) };
    } catch {
      return null;
    }
  }

  async getHistory(req: HistoryRequest): Promise<Candle[]> {
    const product = toCoinbaseProduct(tickerOf(req.symbol));
    const limit = Math.min(req.limit ?? 300, 300);
    return fetchWithAggregation(req.timeframe, NATIVE, limit, async (tf, n) => {
      const g = TIMEFRAME_SECONDS[tf];
      const end = req.before ?? Math.floor(Date.now() / 1000) + g;
      const start = Math.max(0, end - g * Math.min(n, 300));
      const params = new URLSearchParams({ granularity: String(g), start: new Date(start * 1000).toISOString(), end: new Date(end * 1000).toISOString() });
      const rows = await getJson<Array<[number, number, number, number, number, number]>>(`${REST}/products/${product}/candles?${params}`, { relayOnNetworkError: true });
      return rows
        .map((r) => ({ time: r[0], low: r[1], high: r[2], open: r[3], close: r[4], volume: r[5] }))
        .sort((a, b) => a.time - b.time);
    });
  }

  subscribeTicks(symbol: SymbolId, onTick: (t: Tick) => void, onState?: Parameters<MarketDataProvider['subscribeTicks']>[2]): Unsubscribe {
    return this.stream.subscribe(symbol, onTick, onState);
  }

  async getQuote(symbol: SymbolId): Promise<Quote | null> {
    const product = toCoinbaseProduct(tickerOf(symbol));
    const s = await getJson<{ open: string; last: string }>(`${REST}/products/${product}/stats`, { relayOnNetworkError: true });
    const last = +s.last;
    const open = +s.open;
    return { symbol, price: last, prevClose: open, change: last - open, changePct: open ? ((last - open) / open) * 100 : 0, time: Date.now(), source: 'COINBASE' };
  }

  getSession(): MarketSession {
    return { state: 'always', label: '24/7' };
  }

  dispose(): void {
    this.stream.dispose();
  }
}
