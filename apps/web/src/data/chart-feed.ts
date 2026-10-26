import type { Candle, FeedState, HistoryRequest, MarketDataProvider, MarketSession, SymbolId, SymbolInfo, Timeframe, Unsubscribe } from '@tvk/shared-types';
import { CandleBuilder, findGaps, nextBucket } from '@tvk/market-data';
import { getRegistry } from './registry';

export interface ChartFeedSnapshot {
  /** Identity of the feed that produced this snapshot (symbol|timeframe); '' for the placeholder. */
  key: string;
  candles: readonly Candle[];
  feed: FeedState;
  loading: boolean;
  loadingMore: boolean;
  error: string | null;
  info: SymbolInfo | null;
  session: MarketSession | null;
  /** True when the provider has no more history before the first candle. */
  exhausted: boolean;
  /** Increments whenever history (not just the last candle) changed, so the chart does a full setData. */
  historyVersion: number;
  /** The most recently updated candle (for cheap live updates). */
  lastUpdate: Candle | null;
}

type Listener = (s: ChartFeedSnapshot) => void;

const PAGE = 500;

/**
 * One live chart data pipeline: history + ticks → candles, with backfill on reconnect and paging back.
 */
export class ChartFeed {
  private builder: CandleBuilder;
  private snapshot: ChartFeedSnapshot;
  private listeners = new Set<Listener>();
  private unsub: Unsubscribe | null = null;
  private provider: MarketDataProvider | null = null;
  private disposed = false;
  private wasDisconnected = false;
  private sessionTimer: ReturnType<typeof setInterval> | null = null;
  private lastTickAt = 0;

  constructor(public readonly symbol: SymbolId, public readonly timeframe: Timeframe) {
    this.builder = new CandleBuilder(symbol, timeframe);
    this.snapshot = { key: `${symbol}|${timeframe}`, candles: [], feed: { status: 'idle', provider: 'mock' }, loading: true, loadingMore: false, error: null, info: null, session: null, exhausted: false, historyVersion: 0, lastUpdate: null };
    void this.start();
  }

  subscribe(l: Listener): Unsubscribe {
    this.listeners.add(l);
    l(this.snapshot);
    return () => this.listeners.delete(l);
  }

  get current(): ChartFeedSnapshot {
    return this.snapshot;
  }

  private emit(patch: Partial<ChartFeedSnapshot>): void {
    this.snapshot = { ...this.snapshot, ...patch };
    for (const l of this.listeners) l(this.snapshot);
  }

  private async start(): Promise<void> {
    try {
      const registry = await getRegistry();
      const provider = registry.providerFor(this.symbol);
      this.provider = provider;
      if (this.disposed) return;
      const [info, history] = await Promise.all([
        provider.resolveSymbol(this.symbol).catch(() => null),
        provider.getHistory({ symbol: this.symbol, timeframe: this.timeframe, limit: PAGE }),
      ]);
      if (this.disposed) return;
      this.builder.seed(history);
      this.emit({ candles: this.builder.all, info, loading: false, error: history.length ? null : 'No data for this symbol and timeframe', exhausted: history.length < PAGE, historyVersion: 1, session: provider.getSession?.(this.symbol) ?? null });
      this.sessionTimer = setInterval(() => this.emit({ session: provider.getSession?.(this.symbol) ?? null }), 30000);
      this.unsub = provider.subscribeTicks(
        this.symbol,
        (tick) => {
          this.lastTickAt = Date.now();
          const updates = this.builder.applyTick(tick);
          const last = updates[updates.length - 1];
          if (!last) return;
          // A new bucket opened: candles array length changed, so expose the full list; otherwise a cheap last-candle update.
          this.emit({ candles: this.builder.all, lastUpdate: last.candle, feed: { ...this.snapshot.feed, status: 'live', lastTickAt: tick.time } });
        },
        (feed) => this.onFeedState(feed),
      );
    } catch (e) {
      if (this.disposed) return;
      this.emit({ loading: false, error: describeError(e), candles: this.builder.all });
    }
  }

  private onFeedState(feed: FeedState): void {
    const prev = this.snapshot.feed.status;
    if (feed.status === 'live' && (this.wasDisconnected || prev === 'stale' || prev === 'disconnected')) {
      this.wasDisconnected = false;
      void this.backfill();
    }
    if (feed.status === 'disconnected' || feed.status === 'stale') this.wasDisconnected = true;
    this.emit({ feed });
  }

  /** Reload candles from the last known bucket to now (after a reconnect or resume). */
  async backfill(): Promise<void> {
    if (!this.provider || this.disposed) return;
    const last = this.builder.last;
    try {
      const from = last ? last.time : undefined;
      const req: HistoryRequest = { symbol: this.symbol, timeframe: this.timeframe, from, limit: 200 };
      const fresh = await this.provider.getHistory(req);
      if (this.disposed || !fresh.length) return;
      this.builder.merge(fresh);
      // Fill any interior gaps (e.g. long sleep) with one more page if needed.
      const gaps = findGaps(this.builder.all, this.timeframe);
      if (gaps.length && from) {
        const g = gaps[0]!;
        const more = await this.provider.getHistory({ symbol: this.symbol, timeframe: this.timeframe, from: g.from, before: nextBucket(g.to, this.timeframe), limit: 1000 });
        this.builder.merge(more);
      }
      this.emit({ candles: this.builder.all, historyVersion: this.snapshot.historyVersion + 1, error: null });
    } catch (e) {
      console.warn('backfill failed', e);
    }
  }

  /** Page older history when the user scrolls to the left edge. */
  async loadMore(): Promise<void> {
    if (!this.provider || this.disposed || this.snapshot.loadingMore || this.snapshot.exhausted) return;
    const first = this.builder.all[0];
    if (!first) return;
    this.emit({ loadingMore: true });
    try {
      const older = await this.provider.getHistory({ symbol: this.symbol, timeframe: this.timeframe, before: first.time, limit: PAGE });
      if (this.disposed) return;
      const fresh = older.filter((c) => c.time < first.time);
      this.builder.merge(fresh);
      this.emit({ candles: this.builder.all, loadingMore: false, exhausted: fresh.length === 0, historyVersion: this.snapshot.historyVersion + 1 });
    } catch (e) {
      this.emit({ loadingMore: false, exhausted: true });
      console.warn('loadMore failed', e);
    }
  }

  async retry(): Promise<void> {
    this.emit({ loading: true, error: null });
    this.unsub?.();
    this.unsub = null;
    await this.start();
  }

  dispose(): void {
    this.disposed = true;
    this.unsub?.();
    if (this.sessionTimer) clearInterval(this.sessionTimer);
    this.listeners.clear();
  }
}

export function describeError(e: unknown): string {
  if (e instanceof Error) {
    if (/HTTP 451/.test(e.message)) return 'This exchange blocks requests from your region or network (HTTP 451).';
    if (/HTTP 429/.test(e.message)) return 'Rate limit reached for this data source. Try again in a minute.';
    if (/HTTP 5\d\d/.test(e.message)) return 'The data source is temporarily unavailable.';
    if (/Failed to fetch|NetworkError|Load failed|network/i.test(e.message)) return 'Network error: the data source could not be reached (offline, blocked, or CORS).';
    return e.message;
  }
  return String(e);
}
