import type { Candle, HistoryRequest, MarketDataProvider, MarketSession, Quote, SymbolId, SymbolInfo, Tick, Timeframe, Unsubscribe } from '@tvk/shared-types';
import { getJson } from '../http';
import { cryptoInfo, POPULAR_SYMBOLS, searchCatalog, tickerOf } from '../symbols';
import { TradeStream, type ProviderCtorOptions } from './base';

const REST = 'https://api.bybit.com';
const WS = 'wss://stream.bybit.com/v5/public/spot';
const INTERVALS: Record<Timeframe, string> = {
  '1m': '1', '3m': '3', '5m': '5', '15m': '15', '30m': '30', '1h': '60', '2h': '120', '4h': '240', '6h': '360', '12h': '720', '1D': 'D', '1W': 'W', '1M': 'M',
};

class BybitStream extends TradeStream {
  protected url(): string {
    return WS;
  }
  protected streamKey(symbol: SymbolId): string {
    return `publicTrade.${tickerOf(symbol)}`;
  }
  protected subscribePayload(keys: string[]): string | null {
    return keys.length ? JSON.stringify({ op: 'subscribe', args: keys }) : null;
  }
  protected unsubscribePayload(keys: string[]): string | null {
    return keys.length ? JSON.stringify({ op: 'unsubscribe', args: keys }) : null;
  }
  protected override ping() {
    return { intervalMs: 20000, payload: () => JSON.stringify({ op: 'ping' }) };
  }
  protected parse(raw: string) {
    const m = JSON.parse(raw) as { topic?: string; op?: string; data?: Array<{ T: number; p: string; v: string }> };
    if (m.op === 'pong' || m.op === 'ping') return 'pong';
    if (!m.topic || !Array.isArray(m.data)) return null;
    const key = m.topic;
    return m.data.map((d) => ({ key, tick: { time: d.T, price: Number(d.p), size: Number(d.v) } }));
  }
}

export class BybitProvider implements MarketDataProvider {
  readonly id = 'bybit' as const;
  readonly exchanges = ['BYBIT'] as const;
  readonly assetClasses = ['crypto'] as const;
  private stream: BybitStream;
  constructor(opts: ProviderCtorOptions = {}) {
    this.stream = new BybitStream('bybit', opts.wsFactory);
  }

  async searchSymbols(query: string, limit = 20): Promise<SymbolInfo[]> {
    const local = searchCatalog(query, POPULAR_SYMBOLS.filter((s) => s.exchange === 'BYBIT'), limit);
    if (local.length) return local;
    const t = query.toUpperCase().replace(/^BYBIT:/, '').replace(/[^A-Z0-9]/g, '');
    if (t.length < 5) return [];
    const info = await this.resolveSymbol(`BYBIT:${t}`).catch(() => null);
    return info ? [info] : [];
  }

  async resolveSymbol(symbol: SymbolId): Promise<SymbolInfo | null> {
    const ticker = tickerOf(symbol);
    try {
      const r = await getJson<{ result: { list: Array<{ symbol: string; baseCoin: string; quoteCoin: string; priceFilter: { tickSize: string } }> } }>(
        `${REST}/v5/market/instruments-info?category=spot&symbol=${ticker}`,
        { relayOnNetworkError: true },
      );
      const s = r.result.list[0];
      if (!s) return null;
      const step = Number(s.priceFilter.tickSize);
      const info = cryptoInfo('BYBIT', s.symbol, `${s.baseCoin} / ${s.quoteCoin}`);
      return { ...info, base: s.baseCoin, quote: s.quoteCoin, priceStep: step, pricePrecision: Math.max(0, Math.round(-Math.log10(step))) };
    } catch {
      return null;
    }
  }

  async getHistory(req: HistoryRequest): Promise<Candle[]> {
    const limit = Math.min(req.limit ?? 500, 1000);
    const params = new URLSearchParams({ category: 'spot', symbol: tickerOf(req.symbol), interval: INTERVALS[req.timeframe], limit: String(limit) });
    if (req.before) params.set('end', String(req.before * 1000 - 1));
    if (req.from) params.set('start', String(req.from * 1000));
    const r = await getJson<{ result: { list: Array<[string, string, string, string, string, string, string]> } }>(`${REST}/v5/market/kline?${params}`, { relayOnNetworkError: true });
    return r.result.list
      .map((k) => ({ time: Math.floor(+k[0] / 1000), open: +k[1], high: +k[2], low: +k[3], close: +k[4], volume: +k[5] }))
      .sort((a, b) => a.time - b.time);
  }

  subscribeTicks(symbol: SymbolId, onTick: (t: Tick) => void, onState?: Parameters<MarketDataProvider['subscribeTicks']>[2]): Unsubscribe {
    return this.stream.subscribe(symbol, onTick, onState);
  }

  async getQuote(symbol: SymbolId): Promise<Quote | null> {
    const r = await getJson<{ result: { list: Array<{ lastPrice: string; prevPrice24h: string; price24hPcnt: string }> } }>(
      `${REST}/v5/market/tickers?category=spot&symbol=${tickerOf(symbol)}`,
      { relayOnNetworkError: true },
    );
    const t = r.result.list[0];
    if (!t) return null;
    const last = +t.lastPrice;
    const prev = +t.prevPrice24h;
    return { symbol, price: last, prevClose: prev, change: last - prev, changePct: +t.price24hPcnt * 100, time: Date.now(), source: 'BYBIT' };
  }

  getSession(): MarketSession {
    return { state: 'always', label: '24/7' };
  }

  dispose(): void {
    this.stream.dispose();
  }
}
