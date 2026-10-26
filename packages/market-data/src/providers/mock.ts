/**
 * Deterministic offline provider used for tests, demos and sandboxed environments without exchange access.
 * Generates a seeded random-walk history and emits ticks on a timer.
 */
import type { Candle, FeedState, HistoryRequest, MarketDataProvider, MarketSession, Quote, SymbolId, SymbolInfo, Tick, Unsubscribe } from '@tvk/shared-types';
import { TIMEFRAME_SECONDS } from '@tvk/shared-types';
import { bucketStart, nextBucket } from '../candles';
import { cryptoInfo, POPULAR_SYMBOLS, searchCatalog, splitBaseQuote, tickerOf } from '../symbols';

function mulberry32(seed: number): () => number {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function hash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
}

const BASE_PRICES: Record<string, number> = { BTC: 68000, ETH: 3500, SOL: 160, XAU: 2650, XAG: 31, AAPL: 230, MSFT: 420, NVDA: 130, TSLA: 250 };

export interface MockProviderOptions {
  tickIntervalMs?: number;
  /** Fixed "now" for deterministic tests (UNIX seconds). */
  now?: () => number;
}

export class MockProvider implements MarketDataProvider {
  readonly id = 'mock' as const;
  readonly exchanges = ['MOCK', 'BINANCE', 'COINBASE', 'KRAKEN', 'BYBIT', 'OKX', 'NASDAQ', 'NYSE', 'AMEX', 'ARCA', 'BATS', 'METALS'] as const;
  readonly assetClasses = ['crypto', 'stock', 'metal'] as const;
  private readonly tickIntervalMs: number;
  private readonly now: () => number;
  private readonly lastPrice = new Map<string, number>();
  private readonly timers = new Map<string, ReturnType<typeof setInterval>>();

  constructor(opts: MockProviderOptions = {}) {
    this.tickIntervalMs = opts.tickIntervalMs ?? 500;
    this.now = opts.now ?? (() => Math.floor(Date.now() / 1000));
  }

  async searchSymbols(query: string, limit = 20): Promise<SymbolInfo[]> {
    const hits = searchCatalog(query, POPULAR_SYMBOLS, limit);
    if (hits.length) return hits;
    const t = query.toUpperCase().replace(/^[A-Z]+:/, '').replace(/[^A-Z0-9]/g, '');
    return t ? [cryptoInfo('MOCK', t)] : [];
  }

  async resolveSymbol(symbol: SymbolId): Promise<SymbolInfo | null> {
    return POPULAR_SYMBOLS.find((s) => s.id === symbol) ?? cryptoInfo('MOCK', tickerOf(symbol));
  }

  async getHistory(req: HistoryRequest): Promise<Candle[]> {
    const limit = Math.min(req.limit ?? 500, 1500);
    const tf = req.timeframe;
    const end = bucketStart(req.before ? req.before - 1 : this.now(), tf);
    const rng = mulberry32(hash(`${req.symbol}:${tf}`));
    const base = this.basePrice(req.symbol);
    // Walk forward from a fixed origin so that any window is reproducible.
    const origin = bucketStart(end, tf) - (limit - 1) * TIMEFRAME_SECONDS[tf];
    const out: Candle[] = [];
    let price = base * (0.9 + rng() * 0.2);
    let t = origin;
    for (let i = 0; i < limit; i++) {
      const vol = 0.004;
      const open = price;
      let high = open;
      let low = open;
      let close = open;
      for (let k = 0; k < 8; k++) {
        close = close * (1 + (rng() - 0.5) * vol);
        high = Math.max(high, close);
        low = Math.min(low, close);
      }
      out.push({ time: t, open, high, low, close, volume: Math.round(10 + rng() * 100) });
      price = close;
      t = nextBucket(t, tf);
    }
    this.lastPrice.set(req.symbol, price);
    return out;
  }

  subscribeTicks(symbol: SymbolId, onTick: (t: Tick) => void, onState?: (s: FeedState) => void): Unsubscribe {
    onState?.({ status: 'live', provider: 'mock', message: 'Simulated data' });
    const rng = mulberry32(hash(`${symbol}:ticks`) ^ Date.now());
    const timer = setInterval(() => {
      const prev = this.lastPrice.get(symbol) ?? this.basePrice(symbol);
      const price = prev * (1 + (rng() - 0.5) * 0.001);
      this.lastPrice.set(symbol, price);
      onTick({ symbol, time: this.now() * 1000 + (Date.now() % 1000), price, size: Math.round(rng() * 100) / 100, source: 'MOCK' });
    }, this.tickIntervalMs);
    this.timers.set(symbol + Math.random(), timer);
    return () => clearInterval(timer);
  }

  async getQuote(symbol: SymbolId): Promise<Quote | null> {
    const price = this.lastPrice.get(symbol) ?? this.basePrice(symbol);
    const prevClose = price * 0.99;
    return { symbol, price, prevClose, change: price - prevClose, changePct: 1.01, time: Date.now(), source: 'MOCK' };
  }

  getSession(): MarketSession {
    return { state: 'always', label: 'Simulated' };
  }

  dispose(): void {
    for (const t of this.timers.values()) clearInterval(t);
    this.timers.clear();
  }

  private basePrice(symbol: SymbolId): number {
    const ticker = tickerOf(symbol);
    const base = splitBaseQuote(ticker)?.base ?? ticker;
    return BASE_PRICES[base] ?? BASE_PRICES[ticker] ?? 10 + (hash(ticker) % 900);
  }
}
