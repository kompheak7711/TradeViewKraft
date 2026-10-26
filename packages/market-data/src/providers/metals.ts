/**
 * Gold & silver spot via the Vercel relay (apps/web/api/metals/*), backed by Twelve Data's free plan.
 * There is no free real-time WebSocket for spot metals, so the client polls the latest bar at a cadence
 * that stays inside the free quota (the relay caches responses at the CDN edge so all clients share calls).
 * Tokenized gold (BINANCE:PAXGUSDT, KRAKEN:PAXGUSD, BYBIT/OKX:XAUTUSDT) is offered for tick-level charts.
 */
import type { Candle, FeedState, HistoryRequest, MarketDataProvider, MarketSession, Quote, SymbolId, SymbolInfo, Tick, Timeframe, Unsubscribe } from '@tvk/shared-types';
import { getJson } from '../http';
import { metalInfo, POPULAR_SYMBOLS, searchCatalog, tickerOf } from '../symbols';
import { metalsSession } from '../session';

export const TWELVE_INTERVALS: Record<Timeframe, string> = {
  '1m': '1min', '3m': '1min', '5m': '5min', '15m': '15min', '30m': '30min', '1h': '1h', '2h': '2h', '4h': '4h', '6h': '4h', '12h': '8h', '1D': '1day', '1W': '1week', '1M': '1month',
};

export interface MetalsProviderOptions {
  relayBase?: string;
  /** Poll cadence for live updates. 60 s keeps two symbols under 800 credits/day with edge caching. */
  pollIntervalMs?: number;
}

export class MetalsProvider implements MarketDataProvider {
  readonly id = 'metals' as const;
  readonly exchanges = ['METALS'] as const;
  readonly assetClasses = ['metal'] as const;
  private readonly base: string;
  private readonly pollIntervalMs: number;
  private readonly listeners = new Map<string, Set<(t: Tick) => void>>();
  private readonly stateListeners = new Set<(s: FeedState) => void>();
  private state: FeedState = { status: 'idle', provider: 'metals' };
  private timer: ReturnType<typeof setInterval> | null = null;

  constructor(opts: MetalsProviderOptions = {}) {
    this.base = opts.relayBase ?? '';
    this.pollIntervalMs = opts.pollIntervalMs ?? 60000;
  }

  async searchSymbols(query: string, limit = 20): Promise<SymbolInfo[]> {
    return searchCatalog(query, POPULAR_SYMBOLS.filter((s) => s.assetClass === 'metal'), limit);
  }

  async resolveSymbol(symbol: SymbolId): Promise<SymbolInfo | null> {
    const t = tickerOf(symbol);
    return POPULAR_SYMBOLS.find((s) => s.assetClass === 'metal' && s.ticker === t) ?? (t === 'XAUUSD' || t === 'XAGUSD' ? metalInfo(t, t) : null);
  }

  async getHistory(req: HistoryRequest): Promise<Candle[]> {
    const params = new URLSearchParams({ symbol: tickerOf(req.symbol), timeframe: req.timeframe, limit: String(Math.min(req.limit ?? 500, 5000)) });
    if (req.before) params.set('end', String(req.before));
    const r = await getJson<{ bars: Array<{ t: number; o: number; h: number; l: number; c: number; v: number }> }>(`${this.base}/api/metals/bars?${params}`);
    return r.bars.map((b) => ({ time: b.t, open: b.o, high: b.h, low: b.l, close: b.c, volume: b.v }));
  }

  subscribeTicks(symbol: SymbolId, onTick: (t: Tick) => void, onState?: (s: FeedState) => void): Unsubscribe {
    const t = tickerOf(symbol);
    let set = this.listeners.get(t);
    if (!set) {
      set = new Set();
      this.listeners.set(t, set);
    }
    set.add(onTick);
    if (onState) {
      this.stateListeners.add(onState);
      onState(this.state);
    }
    this.ensurePolling();
    void this.pollOnce();
    return () => {
      set!.delete(onTick);
      if (onState) this.stateListeners.delete(onState);
      if (set!.size === 0) this.listeners.delete(t);
      if (this.listeners.size === 0) this.stopPolling();
    };
  }

  async getQuote(symbol: SymbolId): Promise<Quote | null> {
    const q = await this.getQuotes([tickerOf(symbol)]);
    return q[0] ?? null;
  }

  async getQuotes(tickers: string[]): Promise<Quote[]> {
    const r = await getJson<{ quotes: Array<{ symbol: string; price: number; prevClose: number; time: number; source: string }> }>(
      `${this.base}/api/metals/quote?symbols=${encodeURIComponent(tickers.join(','))}`,
    );
    return r.quotes.map((q) => {
      const change = q.price - q.prevClose;
      return { symbol: `METALS:${q.symbol}` as SymbolId, price: q.price, prevClose: q.prevClose, change, changePct: q.prevClose ? (change / q.prevClose) * 100 : 0, time: q.time, source: q.source };
    });
  }

  getSession(): MarketSession {
    return metalsSession();
  }

  dispose(): void {
    this.stopPolling();
    this.listeners.clear();
    this.stateListeners.clear();
  }

  private ensurePolling(): void {
    if (this.timer) return;
    this.timer = setInterval(() => void this.pollOnce(), this.pollIntervalMs);
    if (typeof window !== 'undefined') {
      document.addEventListener('visibilitychange', this.onVisible);
      window.addEventListener('pageshow', this.onVisible);
    }
  }

  private readonly onVisible = () => {
    if (typeof document !== 'undefined' && document.visibilityState === 'hidden') return;
    void this.pollOnce();
  };

  private stopPolling(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    if (typeof window !== 'undefined') {
      document.removeEventListener('visibilitychange', this.onVisible);
      window.removeEventListener('pageshow', this.onVisible);
    }
  }

  private async pollOnce(): Promise<void> {
    const tickers = [...this.listeners.keys()];
    if (!tickers.length) return;
    try {
      const quotes = await this.getQuotes(tickers);
      for (const q of quotes) {
        const set = this.listeners.get(tickerOf(q.symbol));
        if (!set) continue;
        const tick: Tick = { symbol: q.symbol, time: q.time, price: q.price, size: 0, source: q.source };
        for (const l of set) l(tick);
      }
      this.setState({ status: 'live', provider: 'metals', lastTickAt: Date.now(), message: 'Spot updates every minute (free plan)' });
    } catch (e) {
      const msg = (e as Error).message;
      const limited = /429|quota|credits/i.test(msg);
      this.setState({ status: limited ? 'limited' : 'error', provider: 'metals', message: limited ? 'Metals free quota exhausted for today; showing last known prices' : `Metals relay error: ${msg}` });
    }
  }

  private setState(s: FeedState): void {
    this.state = s;
    for (const l of this.stateListeners) l(s);
  }
}
