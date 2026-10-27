/**
 * US stocks via the Vercel relay (apps/web/api/stocks/*). The Alpaca key never reaches the client.
 * Live data: Server-Sent Events relay (Vercel Functions cannot accept WebSocket upgrades; SSE streams
 * close at the function's max duration, so the client reconnects transparently and backfills).
 * Fallback: when the relay reports the Alpaca free-plan connection limit, poll snapshots instead.
 */
import type { Candle, FeedState, HistoryRequest, MarketDataProvider, MarketSession, Quote, SymbolId, SymbolInfo, Tick, Timeframe, Unsubscribe } from '@tvk/shared-types';
import { getJson } from '../http';
import { POPULAR_SYMBOLS, searchCatalog, stockInfo, tickerOf } from '../symbols';
import { usEquitySession } from '../session';

export const ALPACA_TIMEFRAMES: Record<Timeframe, string> = {
  '1m': '1Min', '3m': '3Min', '5m': '5Min', '15m': '15Min', '30m': '30Min', '1h': '1Hour', '2h': '2Hour', '4h': '4Hour', '6h': '6Hour', '12h': '12Hour', '1D': '1Day', '1W': '1Week', '1M': '1Month',
};

export interface RelayBar { t: number; o: number; h: number; l: number; c: number; v: number }
export interface RelayTrade { S: string; p: number; s: number; t: number }
export interface RelaySnapshot { symbol: string; price: number; prevClose: number; time: number; source: string; delayed: boolean }

export interface EventSourceLike {
  onmessage: ((ev: { data: string }) => void) | null;
  onerror: ((ev: unknown) => void) | null;
  onopen: ((ev: unknown) => void) | null;
  addEventListener(type: string, cb: (ev: { data: string }) => void): void;
  close(): void;
}
export type EventSourceFactory = (url: string) => EventSourceLike;

export interface AlpacaProviderOptions {
  relayBase?: string;
  eventSourceFactory?: EventSourceFactory;
  pollIntervalMs?: number;
}

export class AlpacaProvider implements MarketDataProvider {
  readonly id = 'alpaca' as const;
  readonly exchanges = ['NASDAQ', 'NYSE', 'AMEX', 'ARCA', 'BATS'] as const;
  readonly assetClasses = ['stock'] as const;
  private readonly base: string;
  private readonly esFactory: EventSourceFactory;
  private readonly pollIntervalMs: number;
  private es: EventSourceLike | null = null;
  private readonly listeners = new Map<string, Set<(t: Tick) => void>>();
  private readonly stateListeners = new Set<(s: FeedState) => void>();
  private readonly symbolsByTicker = new Map<string, SymbolId>();
  private state: FeedState = { status: 'idle', provider: 'alpaca' };
  private mode: 'sse' | 'poll' = 'sse';
  private pollTimer: ReturnType<typeof setInterval> | null = null;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private attempt = 0;
  private disposed = false;
  private readonly resumeHandler = () => this.resume();

  constructor(opts: AlpacaProviderOptions = {}) {
    this.base = opts.relayBase ?? '';
    this.esFactory = opts.eventSourceFactory ?? ((url) => new EventSource(url) as unknown as EventSourceLike);
    this.pollIntervalMs = opts.pollIntervalMs ?? 5000;
  }

  async searchSymbols(query: string, limit = 20): Promise<SymbolInfo[]> {
    const local = searchCatalog(query, POPULAR_SYMBOLS.filter((s) => s.assetClass === 'stock'), limit);
    const q = query.replace(/^[A-Z]+:/i, '').trim();
    if (q.length < 1) return local;
    try {
      const r = await getJson<{ results: Array<{ symbol: string; name: string; exchange: string }> }>(`${this.base}/api/stocks/search?q=${encodeURIComponent(q)}&limit=${limit}`);
      const remote = r.results.map((a) => stockInfo(normalizeExchange(a.exchange), a.symbol, a.name));
      const seen = new Set<string>();
      return [...local, ...remote].filter((s) => (seen.has(s.id) ? false : (seen.add(s.id), true))).slice(0, limit);
    } catch {
      return local;
    }
  }

  private providerNote: Promise<string> | null = null;

  /** The relay reports which upstream it uses (Alpaca/IEX or Finnhub + Twelve Data); shown in the chart legend. */
  private dataNote(): Promise<string> {
    this.providerNote ??= getJson<{ stocks: boolean; stocksProvider?: string | null }>(`${this.base}/api/health`)
      .then((h) => (!h.stocks ? 'Stock relay not configured' : h.stocksProvider === 'finnhub' ? 'Finnhub trades, real-time · history via Twelve Data' : 'IEX via Alpaca, real-time (IEX volume only)'))
      .catch(() => 'US stocks via relay');
    return this.providerNote;
  }

  async resolveSymbol(symbol: SymbolId): Promise<SymbolInfo | null> {
    const ticker = tickerOf(symbol);
    const note = await this.dataNote();
    const local = POPULAR_SYMBOLS.find((s) => s.assetClass === 'stock' && s.ticker === ticker);
    if (local) return { ...local, dataNote: note };
    try {
      const r = await getJson<{ results: Array<{ symbol: string; name: string; exchange: string }> }>(`${this.base}/api/stocks/search?q=${encodeURIComponent(ticker)}&limit=5`);
      const hit = r.results.find((a) => a.symbol === ticker);
      return { ...(hit ? stockInfo(normalizeExchange(hit.exchange), hit.symbol, hit.name) : stockInfo('NASDAQ', ticker, ticker)), dataNote: note };
    } catch {
      return { ...stockInfo('NASDAQ', ticker, ticker), dataNote: note };
    }
  }

  async getHistory(req: HistoryRequest): Promise<Candle[]> {
    const params = new URLSearchParams({ symbol: tickerOf(req.symbol), timeframe: ALPACA_TIMEFRAMES[req.timeframe], limit: String(Math.min(req.limit ?? 1000, 10000)) });
    if (req.before) params.set('end', String(req.before));
    if (req.from) params.set('start', String(req.from));
    const r = await getJson<{ bars: RelayBar[] }>(`${this.base}/api/stocks/bars?${params}`);
    return r.bars.map((b) => ({ time: b.t, open: b.o, high: b.h, low: b.l, close: b.c, volume: b.v }));
  }

  subscribeTicks(symbol: SymbolId, onTick: (t: Tick) => void, onState?: (s: FeedState) => void): Unsubscribe {
    const ticker = tickerOf(symbol);
    this.symbolsByTicker.set(ticker, symbol);
    let set = this.listeners.get(ticker);
    if (!set) {
      set = new Set();
      this.listeners.set(ticker, set);
      this.restartStream();
    }
    set.add(onTick);
    if (onState) {
      this.stateListeners.add(onState);
      onState(this.state);
    }
    return () => {
      set!.delete(onTick);
      if (onState) this.stateListeners.delete(onState);
      if (set!.size === 0) {
        this.listeners.delete(ticker);
        this.symbolsByTicker.delete(ticker);
        this.restartStream();
      }
    };
  }

  async getQuote(symbol: SymbolId): Promise<Quote | null> {
    const snaps = await this.getSnapshots([tickerOf(symbol)]);
    return snaps[0] ?? null;
  }

  async getSnapshots(tickers: string[]): Promise<Quote[]> {
    if (!tickers.length) return [];
    const r = await getJson<{ snapshots: RelaySnapshot[] }>(`${this.base}/api/stocks/snapshot?symbols=${encodeURIComponent(tickers.join(','))}`);
    return r.snapshots.map((s) => {
      const symbol = this.symbolsByTicker.get(s.symbol) ?? (`NASDAQ:${s.symbol}` as SymbolId);
      const change = s.price - s.prevClose;
      return { symbol, price: s.price, prevClose: s.prevClose, change, changePct: s.prevClose ? (change / s.prevClose) * 100 : 0, time: s.time, source: s.source, delayed: s.delayed };
    });
  }

  getSession(): MarketSession {
    return usEquitySession();
  }

  dispose(): void {
    this.disposed = true;
    this.stopStream();
    this.listeners.clear();
    this.stateListeners.clear();
  }

  // ---- streaming internals ----
  private restartStream(): void {
    this.stopStream();
    if (this.disposed || this.listeners.size === 0) return;
    if (this.mode === 'poll') this.startPolling();
    else this.openSse(false);
  }

  private stopStream(): void {
    if (this.es) {
      this.es.close();
      this.es = null;
    }
    if (this.pollTimer) clearInterval(this.pollTimer);
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    this.pollTimer = this.reconnectTimer = null;
    if (typeof window !== 'undefined') {
      document.removeEventListener('visibilitychange', this.resumeHandler);
      window.removeEventListener('pageshow', this.resumeHandler);
    }
  }

  private openSse(reconnect: boolean): void {
    const tickers = [...this.listeners.keys()];
    if (!tickers.length) return;
    this.setState({ status: reconnect ? 'connecting' : 'connecting', provider: 'alpaca', message: reconnect ? 'Reconnecting to stock stream' : undefined });
    const url = `${this.base}/api/stocks/stream?symbols=${encodeURIComponent(tickers.join(','))}`;
    let es: EventSourceLike;
    try {
      es = this.esFactory(url);
    } catch (e) {
      this.scheduleReconnect(String(e));
      return;
    }
    this.es = es;
    if (typeof window !== 'undefined') {
      document.addEventListener('visibilitychange', this.resumeHandler);
      window.addEventListener('pageshow', this.resumeHandler);
    }
    es.onopen = () => {
      this.attempt = 0;
      this.setState({ status: 'live', provider: 'alpaca', lastTickAt: this.state.lastTickAt });
    };
    es.onmessage = (ev) => this.handleEvent(ev.data);
    es.addEventListener('trade', (ev) => this.handleEvent(ev.data));
    es.addEventListener('status', (ev) => this.handleStatus(ev.data));
    es.addEventListener('end', () => {
      // The function reached its max duration: reconnect immediately, no backoff.
      es.close();
      if (this.es === es) {
        this.es = null;
        this.attempt = 0;
        this.openSse(true);
      }
    });
    es.onerror = () => {
      if (this.es !== es) return;
      es.close();
      this.es = null;
      this.scheduleReconnect('stream error');
    };
  }

  private handleEvent(data: string): void {
    let msg: RelayTrade | { type?: string };
    try {
      msg = JSON.parse(data);
    } catch {
      return;
    }
    if ('S' in msg && typeof msg.p === 'number') {
      const symbol = this.symbolsByTicker.get(msg.S);
      const set = this.listeners.get(msg.S);
      if (!symbol || !set) return;
      const tick: Tick = { symbol, time: msg.t, price: msg.p, size: msg.s, source: 'relay' };
      this.state.lastTickAt = tick.time;
      if (this.state.status !== 'live') this.setState({ ...this.state, status: 'live', message: undefined });
      for (const l of set) l(tick);
    }
  }

  private handleStatus(data: string): void {
    let msg: { code?: string; message?: string };
    try {
      msg = JSON.parse(data);
    } catch {
      return;
    }
    if (msg.code === 'connection_limit' || msg.code === 'symbol_limit') {
      // Alpaca free plan: 1 websocket connection, 30 symbols. Switch to polling so the UI keeps updating.
      this.mode = 'poll';
      this.setState({ status: 'limited', provider: 'alpaca', message: msg.message ?? 'Alpaca free-plan limit reached; using 5 s snapshot polling' });
      this.restartStream();
    } else if (msg.code === 'no_key') {
      this.setState({ status: 'error', provider: 'alpaca', message: msg.message ?? 'Stock relay is not configured (missing ALPACA_KEY_ID)' });
      this.stopStream();
    } else if (msg.code === 'market_closed') {
      this.setState({ status: 'closed', provider: 'alpaca', message: msg.message ?? 'Market closed' });
    } else if (msg.message) {
      this.setState({ ...this.state, message: msg.message });
    }
  }

  private scheduleReconnect(detail: string): void {
    if (this.disposed) return;
    const delay = Math.min(30000, 1000 * 2 ** this.attempt) * (0.5 + Math.random());
    this.attempt = Math.min(this.attempt + 1, 6);
    this.setState({ status: 'disconnected', provider: 'alpaca', message: detail, lastTickAt: this.state.lastTickAt });
    this.reconnectTimer = setTimeout(() => this.openSse(true), delay);
  }

  private resume(): void {
    if (typeof document !== 'undefined' && document.visibilityState === 'hidden') return;
    if (!this.es && this.mode === 'sse' && this.listeners.size) {
      if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
      this.attempt = 0;
      this.openSse(true);
    }
  }

  private startPolling(): void {
    const poll = async () => {
      const tickers = [...this.listeners.keys()];
      if (!tickers.length) return;
      try {
        const quotes = await this.getSnapshots(tickers);
        for (const q of quotes) {
          const set = this.listeners.get(tickerOf(q.symbol));
          if (!set) continue;
          const tick: Tick = { symbol: q.symbol, time: q.time, price: q.price, size: 0, source: q.source };
          for (const l of set) l(tick);
        }
        if (this.state.status !== 'limited') this.setState({ ...this.state, status: 'limited' });
      } catch (e) {
        this.setState({ status: 'error', provider: 'alpaca', message: `Snapshot polling failed: ${(e as Error).message}` });
      }
    };
    void poll();
    this.pollTimer = setInterval(poll, this.pollIntervalMs);
  }

  private setState(s: FeedState): void {
    this.state = s;
    for (const l of this.stateListeners) l(s);
  }
}

function normalizeExchange(ex: string): SymbolInfo['exchange'] {
  const e = ex.toUpperCase();
  if (e === 'NASDAQ' || e === 'NYSE' || e === 'AMEX' || e === 'ARCA' || e === 'BATS') return e;
  if (e === 'NYSEARCA') return 'ARCA';
  return 'NASDAQ';
}
