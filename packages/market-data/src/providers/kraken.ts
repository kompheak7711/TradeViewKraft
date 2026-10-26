import type { Candle, HistoryRequest, MarketDataProvider, MarketSession, Quote, SymbolId, SymbolInfo, Tick, Timeframe, Unsubscribe } from '@tvk/shared-types';
import { getJson } from '../http';
import { cryptoInfo, POPULAR_SYMBOLS, searchCatalog, splitBaseQuote, tickerOf } from '../symbols';
import { fetchWithAggregation, TradeStream, type ProviderCtorOptions } from './base';

const REST = 'https://api.kraken.com/0/public';
const WS = 'wss://ws.kraken.com/v2';
const NATIVE: readonly Timeframe[] = ['1m', '5m', '15m', '30m', '1h', '4h', '1D', '1W'];
const MINUTES: Partial<Record<Timeframe, number>> = { '1m': 1, '5m': 5, '15m': 15, '30m': 30, '1h': 60, '4h': 240, '1D': 1440, '1W': 10080 };

/** Kraken WS v2 uses "BTC/USD"; REST accepts "XBTUSD"/"BTCUSD" alt names. */
export function toKrakenWsPair(ticker: string): string {
  const s = splitBaseQuote(ticker);
  return s ? `${s.base}/${s.quote}` : ticker;
}

class KrakenStream extends TradeStream {
  protected url(): string {
    return WS;
  }
  protected streamKey(symbol: SymbolId): string {
    return toKrakenWsPair(tickerOf(symbol));
  }
  protected subscribePayload(keys: string[]): string | null {
    return keys.length ? JSON.stringify({ method: 'subscribe', params: { channel: 'trade', symbol: keys, snapshot: false } }) : null;
  }
  protected unsubscribePayload(keys: string[]): string | null {
    return keys.length ? JSON.stringify({ method: 'unsubscribe', params: { channel: 'trade', symbol: keys } }) : null;
  }
  protected parse(raw: string) {
    const m = JSON.parse(raw) as { channel?: string; type?: string; data?: Array<{ symbol: string; price: number; qty: number; timestamp: string }> };
    if (m.channel !== 'trade' || !Array.isArray(m.data)) return null;
    return m.data.map((d) => ({ key: d.symbol, tick: { time: Date.parse(d.timestamp) || Date.now(), price: d.price, size: d.qty } }));
  }
  protected override staleMs(): number {
    return 30000; // Kraken v2 sends heartbeat every second
  }
}

export class KrakenProvider implements MarketDataProvider {
  readonly id = 'kraken' as const;
  readonly exchanges = ['KRAKEN'] as const;
  readonly assetClasses = ['crypto'] as const;
  private stream: KrakenStream;
  constructor(opts: ProviderCtorOptions = {}) {
    this.stream = new KrakenStream('kraken', opts.wsFactory);
  }

  async searchSymbols(query: string, limit = 20): Promise<SymbolInfo[]> {
    const local = searchCatalog(query, POPULAR_SYMBOLS.filter((s) => s.exchange === 'KRAKEN'), limit);
    if (local.length) return local;
    const t = query.toUpperCase().replace(/^KRAKEN:/, '').replace(/[^A-Z0-9]/g, '');
    if (t.length < 5) return [];
    const info = await this.resolveSymbol(`KRAKEN:${t}`).catch(() => null);
    return info ? [info] : [];
  }

  async resolveSymbol(symbol: SymbolId): Promise<SymbolInfo | null> {
    const ticker = tickerOf(symbol);
    try {
      const r = await getJson<{ error: string[]; result: Record<string, { wsname: string; pair_decimals: number; base: string; quote: string }> }>(
        `${REST}/AssetPairs?pair=${ticker}`,
        { relayOnNetworkError: true },
      );
      const entry = Object.values(r.result)[0];
      if (!entry) return null;
      const [base, quote] = entry.wsname.split('/');
      const info = cryptoInfo('KRAKEN', `${base}${quote}`, `${base} / ${quote}`);
      return { ...info, pricePrecision: entry.pair_decimals, priceStep: 10 ** -entry.pair_decimals, dataNote: 'KRAKEN spot, real-time (history limited to last 720 bars)' };
    } catch {
      return null;
    }
  }

  async getHistory(req: HistoryRequest): Promise<Candle[]> {
    const ticker = tickerOf(req.symbol);
    const limit = Math.min(req.limit ?? 720, 720);
    return fetchWithAggregation(req.timeframe, NATIVE, limit, async (tf) => {
      // Kraken only returns the most recent 720 candles per interval; `since` cannot page further back.
      const r = await getJson<{ error: string[]; result: Record<string, unknown> }>(`${REST}/OHLC?pair=${ticker}&interval=${MINUTES[tf]}`, { relayOnNetworkError: true });
      if (r.error?.length) throw new Error(r.error.join(', '));
      const key = Object.keys(r.result).find((k) => k !== 'last');
      const rows = (key ? (r.result[key] as Array<[number, string, string, string, string, string, string, number]>) : []) ?? [];
      const out = rows.map((k) => ({ time: k[0], open: +k[1], high: +k[2], low: +k[3], close: +k[4], volume: +k[6] }));
      return req.before ? out.filter((c) => c.time < req.before!) : out;
    });
  }

  subscribeTicks(symbol: SymbolId, onTick: (t: Tick) => void, onState?: Parameters<MarketDataProvider['subscribeTicks']>[2]): Unsubscribe {
    return this.stream.subscribe(symbol, onTick, onState);
  }

  async getQuote(symbol: SymbolId): Promise<Quote | null> {
    const r = await getJson<{ result: Record<string, { c: [string, string]; o: string }> }>(`${REST}/Ticker?pair=${tickerOf(symbol)}`, { relayOnNetworkError: true });
    const t = Object.values(r.result)[0];
    if (!t) return null;
    const last = +t.c[0];
    const open = +t.o;
    return { symbol, price: last, prevClose: open, change: last - open, changePct: open ? ((last - open) / open) * 100 : 0, time: Date.now(), source: 'KRAKEN' };
  }

  getSession(): MarketSession {
    return { state: 'always', label: '24/7' };
  }

  dispose(): void {
    this.stream.dispose();
  }
}
