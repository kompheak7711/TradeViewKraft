/**
 * Shared domain types for TradingViewKraft.
 * One normalized symbol format (EXCHANGE:SYMBOL), one tick schema, one candle schema.
 */

export type AssetClass = 'crypto' | 'stock' | 'metal';

/** Exchange / provider identifiers used as symbol prefixes. */
export type ExchangeId =
  | 'BINANCE'
  | 'COINBASE'
  | 'KRAKEN'
  | 'BYBIT'
  | 'OKX'
  | 'NASDAQ'
  | 'NYSE'
  | 'AMEX'
  | 'ARCA'
  | 'BATS'
  | 'METALS'
  | 'MOCK';

/** Canonical symbol: "BINANCE:BTCUSDT", "NASDAQ:AAPL", "METALS:XAUUSD". */
export type SymbolId = `${ExchangeId}:${string}`;

export interface SymbolInfo {
  id: SymbolId;
  exchange: ExchangeId;
  /** Ticker as the exchange knows it, upper-case, no separators (BTCUSDT). */
  ticker: string;
  /** Human description, e.g. "Bitcoin / Tether". */
  description: string;
  assetClass: AssetClass;
  base: string;
  quote: string;
  /** Minimum price increment, used for formatting. */
  priceStep: number;
  /** Decimal places for display. */
  pricePrecision: number;
  /** Optional provider that serves this symbol (defaults to exchange). */
  provider?: ProviderId;
  /** Data notes shown in the legend, e.g. "IEX, real-time" or "Token proxy (PAXG)". */
  dataNote?: string;
}

export type ProviderId =
  | 'binance'
  | 'coinbase'
  | 'kraken'
  | 'bybit'
  | 'okx'
  | 'alpaca'
  | 'metals'
  | 'mock';

/** Supported chart timeframes. */
export type Timeframe =
  | '1m' | '3m' | '5m' | '15m' | '30m'
  | '1h' | '2h' | '4h' | '6h' | '12h'
  | '1D' | '1W' | '1M';

export const TIMEFRAMES: readonly Timeframe[] = [
  '1m', '3m', '5m', '15m', '30m', '1h', '2h', '4h', '6h', '12h', '1D', '1W', '1M',
] as const;

/** Seconds per timeframe. 1M is approximated as 30 days for bucketing helpers; see candle builder for calendar-aware logic. */
export const TIMEFRAME_SECONDS: Record<Timeframe, number> = {
  '1m': 60, '3m': 180, '5m': 300, '15m': 900, '30m': 1800,
  '1h': 3600, '2h': 7200, '4h': 14400, '6h': 21600, '12h': 43200,
  '1D': 86400, '1W': 604800, '1M': 2592000,
};

/** OHLCV candle. `time` is the bucket open time in UNIX seconds (UTC). */
export interface Candle {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

/** A single trade/quote tick. `time` is UNIX milliseconds. */
export interface Tick {
  symbol: SymbolId;
  time: number;
  price: number;
  size: number;
  /** Optional provider hint, e.g. "IEX". */
  source?: string;
}

/** Live update for a candle stream: either an updated (still open) candle or a newly closed one. */
export interface CandleUpdate {
  symbol: SymbolId;
  timeframe: Timeframe;
  candle: Candle;
  /** True when this candle bucket just closed. */
  closed: boolean;
}

export type FeedStatus = 'idle' | 'connecting' | 'live' | 'stale' | 'disconnected' | 'error' | 'limited' | 'closed';

export interface FeedState {
  status: FeedStatus;
  /** Human message for the UI (e.g. "Alpaca free plan connection limit reached"). */
  message?: string;
  lastTickAt?: number;
  provider: ProviderId;
}

export interface Quote {
  symbol: SymbolId;
  price: number;
  /** Previous session close (for change / % change). */
  prevClose?: number;
  change?: number;
  changePct?: number;
  time: number;
  source?: string;
  delayed?: boolean;
}

export interface MarketSession {
  /** 'open' | 'closed' | 'pre' | 'post' | 'always' (crypto) */
  state: 'open' | 'closed' | 'pre' | 'post' | 'always';
  nextOpen?: number;
  nextClose?: number;
  label: string;
}

export interface HistoryRequest {
  symbol: SymbolId;
  timeframe: Timeframe;
  /** Exclusive upper bound in UNIX seconds (fetch candles before this). */
  before?: number;
  /** Inclusive lower bound in UNIX seconds. */
  from?: number;
  limit?: number;
}

export type Unsubscribe = () => void;

/** The one interface every provider implements. */
export interface MarketDataProvider {
  readonly id: ProviderId;
  readonly exchanges: readonly ExchangeId[];
  readonly assetClasses: readonly AssetClass[];
  /** Search symbols by free text; implementations may call network or a static list. */
  searchSymbols(query: string, limit?: number): Promise<SymbolInfo[]>;
  resolveSymbol(symbol: SymbolId): Promise<SymbolInfo | null>;
  getHistory(req: HistoryRequest): Promise<Candle[]>;
  /** Subscribe to raw ticks. The candle builder turns ticks into live candles. */
  subscribeTicks(symbol: SymbolId, onTick: (t: Tick) => void, onState?: (s: FeedState) => void): Unsubscribe;
  /** Optional: snapshot quote for watchlists. */
  getQuote?(symbol: SymbolId): Promise<Quote | null>;
  getSession?(symbol: SymbolId): MarketSession;
  /** Release all connections. */
  dispose(): void;
}

// ---------- Persisted user data (synced via Supabase) ----------

export type ChartType = 'candles' | 'bars' | 'line' | 'area' | 'heikinashi';

export type IndicatorId = 'sma' | 'ema' | 'vwap' | 'bb' | 'rsi' | 'macd' | 'volume';

export interface IndicatorConfig {
  id: string;
  type: IndicatorId;
  params: Record<string, number>;
  color?: string;
  visible: boolean;
}

export type DrawingType = 'trendline' | 'hline' | 'ray' | 'rect' | 'fib' | 'text';

export interface DrawingPoint { time: number; price: number }

export interface Drawing {
  id: string;
  type: DrawingType;
  points: DrawingPoint[];
  color: string;
  width?: number;
  text?: string;
  locked?: boolean;
}

export interface ChartState {
  id: string;
  symbol: SymbolId;
  timeframe: Timeframe;
  chartType: ChartType;
  logScale: boolean;
  indicators: IndicatorConfig[];
  drawings: Drawing[];
}

export type LayoutGrid = '1' | '2h' | '2v' | '4';

export interface Layout {
  id: string;
  name: string;
  grid: LayoutGrid;
  charts: ChartState[];
  activeChartId: string;
  updatedAt: number;
}

export interface WatchlistItem { symbol: SymbolId }

export interface Watchlist {
  id: string;
  name: string;
  items: WatchlistItem[];
  updatedAt: number;
}

export type AlertCondition = 'crossing' | 'crossing_up' | 'crossing_down' | 'greater' | 'less';

export interface PriceAlert {
  id: string;
  symbol: SymbolId;
  condition: AlertCondition;
  price: number;
  message?: string;
  enabled: boolean;
  /** 'once' fires then disables; 'every' fires each time. */
  frequency: 'once' | 'every';
  createdAt: number;
  triggeredAt?: number;
  updatedAt: number;
}

export interface UserSettings {
  theme: 'dark' | 'light' | 'system';
  defaultTimeframe: Timeframe;
  defaultChartType: ChartType;
  notificationsEnabled: boolean;
  soundEnabled: boolean;
  updatedAt: number;
}
