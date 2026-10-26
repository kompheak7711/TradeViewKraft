import type { Candle, FeedState, MarketDataProvider, ProviderId, SymbolId, Tick, Timeframe, Unsubscribe } from '@tvk/shared-types';
import { TIMEFRAME_SECONDS } from '@tvk/shared-types';
import { ReconnectingWebSocket, type WsFactory } from '../reconnecting-ws';
import { aggregateCandles } from '../candles';

export type TickListener = (t: Tick) => void;
export type StateListener = (s: FeedState) => void;

/** Pick the largest natively-supported timeframe that divides the requested one. */
export function pickBaseTimeframe(requested: Timeframe, supported: readonly Timeframe[]): Timeframe {
  if (supported.includes(requested)) return requested;
  const target = TIMEFRAME_SECONDS[requested];
  let best: Timeframe | null = null;
  for (const tf of supported) {
    if (tf === '1M' || tf === '1W') continue;
    const s = TIMEFRAME_SECONDS[tf];
    if (target % s === 0 && (!best || s > TIMEFRAME_SECONDS[best])) best = tf;
  }
  return best ?? '1m';
}

/** Fetch base candles and aggregate when the exchange lacks the timeframe. */
export async function fetchWithAggregation(
  requested: Timeframe,
  supported: readonly Timeframe[],
  limit: number,
  fetchBase: (tf: Timeframe, limit: number) => Promise<Candle[]>,
): Promise<Candle[]> {
  const base = pickBaseTimeframe(requested, supported);
  if (base === requested) return fetchBase(base, limit);
  const ratio = Math.ceil(TIMEFRAME_SECONDS[requested] / TIMEFRAME_SECONDS[base]);
  const raw = await fetchBase(base, Math.min(limit * ratio, 1000));
  return aggregateCandles(raw, requested);
}

/**
 * Shared multiplexed trade-stream connection: one socket per exchange, many symbol subscriptions.
 * Subclasses implement message parsing and subscribe/unsubscribe payloads.
 */
export abstract class TradeStream {
  protected ws: ReconnectingWebSocket | null = null;
  protected readonly listeners = new Map<string, Set<TickListener>>();
  protected readonly stateListeners = new Map<string, Set<StateListener>>();
  protected state: FeedState;
  constructor(public readonly providerId: ProviderId, protected readonly wsFactory?: WsFactory) {
    this.state = { status: 'idle', provider: providerId };
  }

  protected abstract url(): string;
  /** Native stream key for a symbol (e.g. "btcusdt@trade"). */
  protected abstract streamKey(symbol: SymbolId): string;
  protected abstract subscribePayload(keys: string[]): string | null;
  protected abstract unsubscribePayload(keys: string[]): string | null;
  /** Parse one raw message into zero or more ticks. Return the native key with each tick so it can be routed. */
  protected abstract parse(raw: string): Array<{ key: string; tick: Omit<Tick, 'symbol'> }> | 'pong' | null;
  protected ping(): { intervalMs: number; payload: () => string } | undefined {
    return undefined;
  }
  protected staleMs(): number {
    return 45000;
  }
  protected readonly keyToSymbol = new Map<string, SymbolId>();

  subscribe(symbol: SymbolId, onTick: TickListener, onState?: StateListener): Unsubscribe {
    const key = this.streamKey(symbol);
    this.keyToSymbol.set(key, symbol);
    let set = this.listeners.get(key);
    const isNew = !set;
    if (!set) {
      set = new Set();
      this.listeners.set(key, set);
    }
    set.add(onTick);
    if (onState) {
      let s = this.stateListeners.get(key);
      if (!s) {
        s = new Set();
        this.stateListeners.set(key, s);
      }
      s.add(onState);
      onState(this.state);
    }
    this.ensureOpen();
    if (isNew && this.ws?.state === 'open') {
      const p = this.subscribePayload([key]);
      if (p) this.ws.send(p);
    }
    return () => {
      set!.delete(onTick);
      if (onState) this.stateListeners.get(key)?.delete(onState);
      if (set!.size === 0) {
        this.listeners.delete(key);
        this.stateListeners.delete(key);
        this.keyToSymbol.delete(key);
        const p = this.unsubscribePayload([key]);
        if (p && this.ws?.state === 'open') this.ws.send(p);
        if (this.listeners.size === 0) this.dispose();
      }
    };
  }

  dispose(): void {
    this.ws?.close();
    this.ws = null;
    this.setState({ status: 'closed', provider: this.providerId });
  }

  protected ensureOpen(): void {
    if (this.ws) return;
    this.ws = new ReconnectingWebSocket({
      url: () => this.url(),
      factory: this.wsFactory,
      ping: this.ping(),
      staleMs: this.staleMs(),
      onOpen: (ws) => {
        const keys = [...this.listeners.keys()];
        const p = this.subscribePayload(keys);
        if (p) ws.send(p);
        this.setState({ status: 'live', provider: this.providerId, lastTickAt: this.state.lastTickAt });
      },
      onStateChange: (s, detail) => {
        if (s === 'open') return;
        const status = s === 'stale' ? 'stale' : s === 'closed' ? 'closed' : s === 'connecting' ? 'connecting' : 'disconnected';
        this.setState({ status, provider: this.providerId, message: detail, lastTickAt: this.state.lastTickAt });
      },
      onMessage: (raw) => {
        let parsed: ReturnType<TradeStream['parse']>;
        try {
          parsed = this.parse(raw);
        } catch {
          return;
        }
        if (!parsed || parsed === 'pong') return;
        for (const { key, tick } of parsed) {
          const symbol = this.keyToSymbol.get(key);
          const set = this.listeners.get(key);
          if (!symbol || !set) continue;
          const full: Tick = { ...tick, symbol };
          this.state.lastTickAt = tick.time;
          if (this.state.status !== 'live') this.setState({ ...this.state, status: 'live' });
          for (const l of set) l(full);
        }
      },
    });
    this.ws.open();
  }

  protected setState(s: FeedState): void {
    this.state = s;
    for (const set of this.stateListeners.values()) for (const l of set) l(s);
  }
}

export function notSupported(provider: ProviderId, what: string): never {
  throw new Error(`${provider}: ${what} is not supported`);
}

export type ProviderCtorOptions = {
  wsFactory?: WsFactory;
};

export type AnyProvider = MarketDataProvider;
