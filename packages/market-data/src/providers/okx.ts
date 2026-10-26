import type { Candle, HistoryRequest, MarketDataProvider, MarketSession, Quote, SymbolId, SymbolInfo, Tick, Timeframe, Unsubscribe } from '@tvk/shared-types';
import { getJson } from '../http';
import { cryptoInfo, POPULAR_SYMBOLS, searchCatalog, splitBaseQuote, tickerOf } from '../symbols';
import { TradeStream, type ProviderCtorOptions } from './base';

const REST = 'https://www.okx.com';
const WS = 'wss://ws.okx.com:8443/ws/v5/public';
const BARS: Record<Timeframe, string> = {
  '1m': '1m', '3m': '3m', '5m': '5m', '15m': '15m', '30m': '30m', '1h': '1H', '2h': '2H', '4h': '4H', '6h': '6Hutc', '12h': '12Hutc', '1D': '1Dutc', '1W': '1Wutc', '1M': '1Mutc',
};

export function toOkxInstId(ticker: string): string {
  const s = splitBaseQuote(ticker);
  return s ? `${s.base}-${s.quote}` : ticker;
}

class OkxStream extends TradeStream {
  protected url(): string {
    return WS;
  }
  protected streamKey(symbol: SymbolId): string {
    return toOkxInstId(tickerOf(symbol));
  }
  protected subscribePayload(keys: string[]): string | null {
    return keys.length ? JSON.stringify({ op: 'subscribe', args: keys.map((instId) => ({ channel: 'trades', instId })) }) : null;
  }
  protected unsubscribePayload(keys: string[]): string | null {
    return keys.length ? JSON.stringify({ op: 'unsubscribe', args: keys.map((instId) => ({ channel: 'trades', instId })) }) : null;
  }
  protected override ping() {
    return { intervalMs: 25000, payload: () => 'ping' };
  }
  protected parse(raw: string) {
    if (raw === 'pong') return 'pong';
    const m = JSON.parse(raw) as { arg?: { channel: string; instId: string }; data?: Array<{ px: string; sz: string; ts: string }> };
    if (m.arg?.channel !== 'trades' || !Array.isArray(m.data)) return null;
    const key = m.arg.instId;
    return m.data.map((d) => ({ key, tick: { time: Number(d.ts), price: Number(d.px), size: Number(d.sz) } }));
  }
}

export class OkxProvider implements MarketDataProvider {
  readonly id = 'okx' as const;
  readonly exchanges = ['OKX'] as const;
  readonly assetClasses = ['crypto'] as const;
  private stream: OkxStream;
  constructor(opts: ProviderCtorOptions = {}) {
    this.stream = new OkxStream('okx', opts.wsFactory);
  }

  async searchSymbols(query: string, limit = 20): Promise<SymbolInfo[]> {
    const local = searchCatalog(query, POPULAR_SYMBOLS.filter((s) => s.exchange === 'OKX'), limit);
    if (local.length) return local;
    const t = query.toUpperCase().replace(/^OKX:/, '').replace(/[^A-Z0-9]/g, '');
    if (t.length < 5) return [];
    const info = await this.resolveSymbol(`OKX:${t}`).catch(() => null);
    return info ? [info] : [];
  }

  async resolveSymbol(symbol: SymbolId): Promise<SymbolInfo | null> {
    const instId = toOkxInstId(tickerOf(symbol));
    try {
      const r = await getJson<{ data: Array<{ instId: string; baseCcy: string; quoteCcy: string; tickSz: string }> }>(
        `${REST}/api/v5/public/instruments?instType=SPOT&instId=${instId}`,
        { relayOnNetworkError: true },
      );
      const s = r.data[0];
      if (!s) return null;
      const step = Number(s.tickSz);
      const info = cryptoInfo('OKX', `${s.baseCcy}${s.quoteCcy}`, `${s.baseCcy} / ${s.quoteCcy}`);
      return { ...info, priceStep: step, pricePrecision: Math.max(0, Math.round(-Math.log10(step))) };
    } catch {
      return null;
    }
  }

  async getHistory(req: HistoryRequest): Promise<Candle[]> {
    const instId = toOkxInstId(tickerOf(req.symbol));
    const limit = Math.min(req.limit ?? 300, 300);
    const params = new URLSearchParams({ instId, bar: BARS[req.timeframe], limit: String(limit) });
    if (req.before) params.set('after', String(req.before * 1000));
    const path = req.before ? '/api/v5/market/history-candles' : '/api/v5/market/candles';
    const r = await getJson<{ data: Array<[string, string, string, string, string, string]> }>(`${REST}${path}?${params}`, { relayOnNetworkError: true });
    return r.data
      .map((k) => ({ time: Math.floor(+k[0] / 1000), open: +k[1], high: +k[2], low: +k[3], close: +k[4], volume: +k[5] }))
      .sort((a, b) => a.time - b.time);
  }

  subscribeTicks(symbol: SymbolId, onTick: (t: Tick) => void, onState?: Parameters<MarketDataProvider['subscribeTicks']>[2]): Unsubscribe {
    return this.stream.subscribe(symbol, onTick, onState);
  }

  async getQuote(symbol: SymbolId): Promise<Quote | null> {
    const r = await getJson<{ data: Array<{ last: string; open24h: string; ts: string }> }>(`${REST}/api/v5/market/ticker?instId=${toOkxInstId(tickerOf(symbol))}`, { relayOnNetworkError: true });
    const t = r.data[0];
    if (!t) return null;
    const last = +t.last;
    const open = +t.open24h;
    return { symbol, price: last, prevClose: open, change: last - open, changePct: open ? ((last - open) / open) * 100 : 0, time: +t.ts, source: 'OKX' };
  }

  getSession(): MarketSession {
    return { state: 'always', label: '24/7' };
  }

  dispose(): void {
    this.stream.dispose();
  }
}
