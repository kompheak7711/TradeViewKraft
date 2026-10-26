import type { Candle, HistoryRequest, MarketDataProvider, MarketSession, Quote, SymbolId, SymbolInfo, Tick, Timeframe, Unsubscribe } from '@tvk/shared-types';
import { getJson } from '../http';
import { cryptoInfo, POPULAR_SYMBOLS, searchCatalog, tickerOf } from '../symbols';
import { TradeStream, type ProviderCtorOptions } from './base';

const REST = 'https://api.binance.com';
const WS = 'wss://stream.binance.com:9443/stream';

const INTERVALS: Record<Timeframe, string> = {
  '1m': '1m', '3m': '3m', '5m': '5m', '15m': '15m', '30m': '30m',
  '1h': '1h', '2h': '2h', '4h': '4h', '6h': '6h', '12h': '12h',
  '1D': '1d', '1W': '1w', '1M': '1M',
};

type Kline = [number, string, string, string, string, string, number, string, number, string, string, string];

class BinanceStream extends TradeStream {
  protected url(): string {
    return WS;
  }
  protected streamKey(symbol: SymbolId): string {
    return `${tickerOf(symbol).toLowerCase()}@trade`;
  }
  protected subscribePayload(keys: string[]): string | null {
    return keys.length ? JSON.stringify({ method: 'SUBSCRIBE', params: keys, id: Date.now() % 1_000_000 }) : null;
  }
  protected unsubscribePayload(keys: string[]): string | null {
    return keys.length ? JSON.stringify({ method: 'UNSUBSCRIBE', params: keys, id: Date.now() % 1_000_000 }) : null;
  }
  protected parse(raw: string) {
    const msg = JSON.parse(raw) as { stream?: string; data?: { e: string; p: string; q: string; T: number; s: string } };
    if (!msg.stream || !msg.data || msg.data.e !== 'trade') return null;
    return [{ key: msg.stream, tick: { time: msg.data.T, price: Number(msg.data.p), size: Number(msg.data.q) } }];
  }
  protected override staleMs(): number {
    // Binance sends protocol pings every 20s (browser answers automatically) but no data frames on quiet pairs.
    return 120000;
  }
}

export class BinanceProvider implements MarketDataProvider {
  readonly id = 'binance' as const;
  readonly exchanges = ['BINANCE'] as const;
  readonly assetClasses = ['crypto'] as const;
  private stream: BinanceStream;
  constructor(opts: ProviderCtorOptions = {}) {
    this.stream = new BinanceStream('binance', opts.wsFactory);
  }

  async searchSymbols(query: string, limit = 20): Promise<SymbolInfo[]> {
    const local = searchCatalog(query, POPULAR_SYMBOLS.filter((s) => s.exchange === 'BINANCE'), limit);
    if (local.length) return local;
    const t = query.toUpperCase().replace(/^BINANCE:/, '').replace(/[^A-Z0-9]/g, '');
    if (t.length < 5) return [];
    const info = await this.resolveSymbol(`BINANCE:${t}`).catch(() => null);
    return info ? [info] : [];
  }

  async resolveSymbol(symbol: SymbolId): Promise<SymbolInfo | null> {
    const ticker = tickerOf(symbol);
    try {
      const data = await getJson<{ symbols: Array<{ symbol: string; baseAsset: string; quoteAsset: string; filters: Array<{ filterType: string; tickSize?: string }> }> }>(
        `${REST}/api/v3/exchangeInfo?symbol=${ticker}`,
      );
      const s = data.symbols[0];
      if (!s) return null;
      const tick = Number(s.filters.find((f) => f.filterType === 'PRICE_FILTER')?.tickSize ?? '0.01');
      const precision = Math.max(0, Math.min(8, Math.round(-Math.log10(tick))));
      const info = cryptoInfo('BINANCE', s.symbol, `${s.baseAsset} / ${s.quoteAsset}`);
      return { ...info, base: s.baseAsset, quote: s.quoteAsset, priceStep: tick, pricePrecision: precision };
    } catch {
      return null;
    }
  }

  async getHistory(req: HistoryRequest): Promise<Candle[]> {
    const limit = Math.min(req.limit ?? 500, 1000);
    const params = new URLSearchParams({ symbol: tickerOf(req.symbol), interval: INTERVALS[req.timeframe], limit: String(limit) });
    if (req.before) params.set('endTime', String(req.before * 1000 - 1));
    if (req.from) params.set('startTime', String(req.from * 1000));
    const rows = await getJson<Kline[]>(`${REST}/api/v3/klines?${params}`);
    return rows.map((k) => ({ time: Math.floor(k[0] / 1000), open: +k[1], high: +k[2], low: +k[3], close: +k[4], volume: +k[5] }));
  }

  subscribeTicks(symbol: SymbolId, onTick: (t: Tick) => void, onState?: Parameters<MarketDataProvider['subscribeTicks']>[2]): Unsubscribe {
    return this.stream.subscribe(symbol, onTick, onState);
  }

  async getQuote(symbol: SymbolId): Promise<Quote | null> {
    const d = await getJson<{ lastPrice: string; prevClosePrice: string; priceChange: string; priceChangePercent: string; closeTime: number }>(
      `${REST}/api/v3/ticker/24hr?symbol=${tickerOf(symbol)}`,
    );
    return { symbol, price: +d.lastPrice, prevClose: +d.lastPrice - +d.priceChange, change: +d.priceChange, changePct: +d.priceChangePercent, time: d.closeTime, source: 'BINANCE' };
  }

  getSession(): MarketSession {
    return { state: 'always', label: '24/7' };
  }

  dispose(): void {
    this.stream.dispose();
  }
}
