import type { AssetClass, ExchangeId, SymbolId, SymbolInfo } from '@tvk/shared-types';

export const CRYPTO_EXCHANGES: readonly ExchangeId[] = ['BINANCE', 'COINBASE', 'KRAKEN', 'BYBIT', 'OKX'];
export const STOCK_EXCHANGES: readonly ExchangeId[] = ['NASDAQ', 'NYSE', 'AMEX', 'ARCA', 'BATS'];
export const ALL_EXCHANGES: readonly ExchangeId[] = [...CRYPTO_EXCHANGES, ...STOCK_EXCHANGES, 'METALS', 'MOCK'];

/** Quote currencies, longest first so "BTCUSDT" splits as BTC/USDT and not BTC/USD + T. */
const QUOTE_CURRENCIES = [
  'FDUSD', 'USDT', 'USDC', 'TUSD', 'BUSD', 'USDE', 'DAI',
  'USD', 'EUR', 'GBP', 'JPY', 'AUD', 'CAD', 'CHF', 'BRL', 'TRY',
  'BTC', 'ETH', 'BNB', 'SOL',
];

export function assetClassForExchange(ex: ExchangeId): AssetClass {
  if (CRYPTO_EXCHANGES.includes(ex)) return 'crypto';
  if (ex === 'METALS') return 'metal';
  if (ex === 'MOCK') return 'crypto';
  return 'stock';
}

export function isExchangeId(s: string): s is ExchangeId {
  return (ALL_EXCHANGES as readonly string[]).includes(s);
}

/** Strip separators and upper-case: "btc/usdt" -> "BTCUSDT", "xbt-usd" -> "XBTUSD". */
export function normalizeTicker(raw: string): string {
  return raw.trim().toUpperCase().replace(/[\s/\-_.:]/g, '');
}

/**
 * Parse free text into a canonical SymbolId.
 *  "BINANCE:BTCUSDT" -> BINANCE:BTCUSDT
 *  "binance:btc/usdt" -> BINANCE:BTCUSDT
 *  "BTCUSDT" (no prefix) -> BINANCE:BTCUSDT (default crypto exchange)
 *  "AAPL" -> NASDAQ:AAPL  (default stock exchange, refined by the stock provider)
 *  "XAUUSD" / "GOLD" -> METALS:XAUUSD
 */
export function parseSymbol(input: string, defaults: { crypto?: ExchangeId; stock?: ExchangeId } = {}): SymbolId | null {
  const text = input.trim();
  if (!text) return null;
  const idx = text.indexOf(':');
  if (idx > 0) {
    const ex = text.slice(0, idx).toUpperCase();
    const ticker = normalizeTicker(text.slice(idx + 1));
    if (!isExchangeId(ex) || !ticker) return null;
    return `${ex}:${ticker}`;
  }
  const ticker = normalizeTicker(text);
  if (!ticker) return null;
  const metal = METAL_ALIASES[ticker];
  if (metal) return `METALS:${metal}`;
  const split = splitBaseQuote(ticker);
  if (split && split.base.length >= 2) {
    return `${defaults.crypto ?? 'BINANCE'}:${ticker}`;
  }
  if (/^[A-Z.]{1,6}$/.test(ticker)) return `${defaults.stock ?? 'NASDAQ'}:${ticker}`;
  return `${defaults.crypto ?? 'BINANCE'}:${ticker}`;
}

const METAL_ALIASES: Record<string, string> = {
  XAUUSD: 'XAUUSD', GOLD: 'XAUUSD', XAU: 'XAUUSD',
  XAGUSD: 'XAGUSD', SILVER: 'XAGUSD', XAG: 'XAGUSD',
};

export function splitSymbol(id: SymbolId): { exchange: ExchangeId; ticker: string } {
  const idx = id.indexOf(':');
  return { exchange: id.slice(0, idx) as ExchangeId, ticker: id.slice(idx + 1) };
}

export function exchangeOf(id: SymbolId): ExchangeId {
  return splitSymbol(id).exchange;
}

export function tickerOf(id: SymbolId): string {
  return splitSymbol(id).ticker;
}

/** Split a concatenated crypto/forex ticker into base and quote: BTCUSDT -> {BTC, USDT}. */
export function splitBaseQuote(ticker: string): { base: string; quote: string } | null {
  const t = normalizeTicker(ticker);
  for (const q of QUOTE_CURRENCIES) {
    if (t.length > q.length && t.endsWith(q)) {
      return { base: t.slice(0, t.length - q.length), quote: q };
    }
  }
  return null;
}

export function makeSymbolId(exchange: ExchangeId, ticker: string): SymbolId {
  return `${exchange}:${normalizeTicker(ticker)}`;
}

/** Format a price using the symbol's precision, with thousands separators. */
export function formatPrice(price: number, precision = 2): string {
  if (!Number.isFinite(price)) return '—';
  return price.toLocaleString('en-US', { minimumFractionDigits: precision, maximumFractionDigits: precision });
}

/** Pick a sensible display precision from the price magnitude when the exchange does not tell us. */
export function inferPrecision(price: number): number {
  const p = Math.abs(price);
  if (p >= 1000) return 2;
  if (p >= 10) return 2;
  if (p >= 1) return 3;
  if (p >= 0.01) return 5;
  return 8;
}

export function describeSymbol(info: Pick<SymbolInfo, 'base' | 'quote' | 'assetClass'>): string {
  if (info.assetClass === 'stock') return info.base;
  return `${info.base} / ${info.quote}`;
}

/** Static catalog of popular symbols used for instant search results and defaults. */
export const POPULAR_SYMBOLS: SymbolInfo[] = [
  ...(['BTCUSDT', 'ETHUSDT', 'SOLUSDT', 'BNBUSDT', 'XRPUSDT', 'DOGEUSDT', 'ADAUSDT', 'AVAXUSDT', 'LINKUSDT', 'PAXGUSDT'] as const)
    .map((t) => cryptoInfo('BINANCE', t, t === 'PAXGUSDT' ? 'Pax Gold (token gold) / Tether' : undefined)),
  ...(['BTCUSD', 'ETHUSD', 'SOLUSD', 'LTCUSD', 'LINKUSD'] as const).map((t) => cryptoInfo('COINBASE', t)),
  ...(['BTCUSD', 'ETHUSD', 'SOLUSD', 'PAXGUSD', 'XRPUSD'] as const).map((t) => cryptoInfo('KRAKEN', t, t === 'PAXGUSD' ? 'Pax Gold (token gold) / US Dollar' : undefined)),
  ...(['BTCUSDT', 'ETHUSDT', 'SOLUSDT', 'XAUTUSDT'] as const).map((t) => cryptoInfo('BYBIT', t, t === 'XAUTUSDT' ? 'Tether Gold (token gold) / Tether' : undefined)),
  ...(['BTCUSDT', 'ETHUSDT', 'SOLUSDT', 'XAUTUSDT'] as const).map((t) => cryptoInfo('OKX', t, t === 'XAUTUSDT' ? 'Tether Gold (token gold) / Tether' : undefined)),
  stockInfo('NASDAQ', 'AAPL', 'Apple Inc.'),
  stockInfo('NASDAQ', 'MSFT', 'Microsoft Corp.'),
  stockInfo('NASDAQ', 'NVDA', 'NVIDIA Corp.'),
  stockInfo('NASDAQ', 'TSLA', 'Tesla Inc.'),
  stockInfo('NASDAQ', 'AMZN', 'Amazon.com Inc.'),
  stockInfo('NASDAQ', 'GOOGL', 'Alphabet Inc. Class A'),
  stockInfo('NASDAQ', 'META', 'Meta Platforms Inc.'),
  stockInfo('NYSE', 'BRK.B', 'Berkshire Hathaway Class B'),
  stockInfo('NYSE', 'JPM', 'JPMorgan Chase & Co.'),
  stockInfo('AMEX', 'SPY', 'SPDR S&P 500 ETF'),
  stockInfo('AMEX', 'GLD', 'SPDR Gold Shares ETF'),
  stockInfo('AMEX', 'SLV', 'iShares Silver Trust ETF'),
  metalInfo('XAUUSD', 'Gold Spot / US Dollar'),
  metalInfo('XAGUSD', 'Silver Spot / US Dollar'),
];

export function cryptoInfo(exchange: ExchangeId, ticker: string, description?: string): SymbolInfo {
  const t = normalizeTicker(ticker);
  const split = splitBaseQuote(t) ?? { base: t, quote: '' };
  return {
    id: makeSymbolId(exchange, t),
    exchange,
    ticker: t,
    description: description ?? `${split.base} / ${split.quote}`,
    assetClass: 'crypto',
    base: split.base,
    quote: split.quote,
    priceStep: 0.01,
    pricePrecision: 2,
    provider: exchange.toLowerCase() as SymbolInfo['provider'],
    dataNote: `${exchange} spot, real-time`,
  };
}

export function stockInfo(exchange: ExchangeId, ticker: string, description: string): SymbolInfo {
  const t = ticker.toUpperCase();
  return {
    id: `${exchange}:${t}`,
    exchange,
    ticker: t,
    description,
    assetClass: 'stock',
    base: t,
    quote: 'USD',
    priceStep: 0.01,
    pricePrecision: 2,
    provider: 'alpaca',
    dataNote: 'IEX via Alpaca, real-time (IEX volume only)',
  };
}

export function metalInfo(ticker: string, description: string): SymbolInfo {
  const t = normalizeTicker(ticker);
  return {
    id: `METALS:${t}`,
    exchange: 'METALS',
    ticker: t,
    description,
    assetClass: 'metal',
    base: t.slice(0, 3),
    quote: t.slice(3),
    priceStep: t.startsWith('XAG') ? 0.001 : 0.01,
    pricePrecision: t.startsWith('XAG') ? 3 : 2,
    provider: 'metals',
    dataNote: 'Spot via Twelve Data (free plan), ~1 min updates',
  };
}

/** Search the static catalog (case-insensitive, matches ticker, description or exchange prefix). */
export function searchCatalog(query: string, catalog: SymbolInfo[] = POPULAR_SYMBOLS, limit = 20): SymbolInfo[] {
  const q = query.trim().toUpperCase();
  if (!q) return catalog.slice(0, limit);
  const [maybeEx, rest] = q.includes(':') ? q.split(':', 2) : [undefined, q];
  const needle = normalizeTicker(rest ?? '');
  const scored = catalog
    .filter((s) => !maybeEx || s.exchange.startsWith(maybeEx))
    .map((s) => {
      let score = 0;
      if (!needle) score = 1;
      else if (s.ticker === needle) score = 100;
      else if (s.ticker.startsWith(needle)) score = 80;
      else if (s.base === needle) score = 70;
      else if (s.ticker.includes(needle)) score = 50;
      else if (s.description.toUpperCase().startsWith(rest ?? '')) score = 40;
      else if (s.description.toUpperCase().includes(rest ?? '')) score = 30;
      return { s, score };
    })
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score);
  return scored.slice(0, limit).map((x) => x.s);
}
