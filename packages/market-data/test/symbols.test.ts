import { describe, expect, it } from 'vitest';
import { parseSymbol, splitBaseQuote, normalizeTicker, searchCatalog, formatPrice, splitSymbol, inferPrecision } from '../src/symbols';
import { toCoinbaseProduct } from '../src/providers/coinbase';
import { toKrakenWsPair } from '../src/providers/kraken';
import { toOkxInstId } from '../src/providers/okx';

describe('symbol normalization', () => {
  it('parses prefixed symbols with separators', () => {
    expect(parseSymbol('BINANCE:BTCUSDT')).toBe('BINANCE:BTCUSDT');
    expect(parseSymbol('binance:btc/usdt')).toBe('BINANCE:BTCUSDT');
    expect(parseSymbol(' coinbase:btc-usd ')).toBe('COINBASE:BTCUSD');
    expect(parseSymbol('NASDAQ:aapl')).toBe('NASDAQ:AAPL');
    expect(parseSymbol('METALS:xau/usd')).toBe('METALS:XAUUSD');
  });
  it('rejects unknown exchanges and empty input', () => {
    expect(parseSymbol('FOO:BTCUSDT')).toBeNull();
    expect(parseSymbol('')).toBeNull();
    expect(parseSymbol('BINANCE:')).toBeNull();
  });
  it('applies defaults for bare tickers', () => {
    expect(parseSymbol('BTCUSDT')).toBe('BINANCE:BTCUSDT');
    expect(parseSymbol('ethusd', { crypto: 'KRAKEN' })).toBe('KRAKEN:ETHUSD');
    expect(parseSymbol('AAPL')).toBe('NASDAQ:AAPL');
    expect(parseSymbol('gold')).toBe('METALS:XAUUSD');
    expect(parseSymbol('XAGUSD')).toBe('METALS:XAGUSD');
  });
  it('splits base and quote with longest quote first', () => {
    expect(splitBaseQuote('BTCUSDT')).toEqual({ base: 'BTC', quote: 'USDT' });
    expect(splitBaseQuote('BTCUSD')).toEqual({ base: 'BTC', quote: 'USD' });
    expect(splitBaseQuote('ETHBTC')).toEqual({ base: 'ETH', quote: 'BTC' });
    expect(splitBaseQuote('PAXGUSDT')).toEqual({ base: 'PAXG', quote: 'USDT' });
    expect(splitBaseQuote('USD')).toBeNull();
  });
  it('normalizes tickers', () => {
    expect(normalizeTicker(' xbt/usd ')).toBe('XBTUSD');
    expect(normalizeTicker('btc_usdt')).toBe('BTCUSDT');
    expect(splitSymbol('OKX:BTCUSDT')).toEqual({ exchange: 'OKX', ticker: 'BTCUSDT' });
  });
  it('maps to exchange-native formats', () => {
    expect(toCoinbaseProduct('BTCUSD')).toBe('BTC-USD');
    expect(toKrakenWsPair('ETHUSD')).toBe('ETH/USD');
    expect(toOkxInstId('SOLUSDT')).toBe('SOL-USDT');
  });
  it('searches the catalog with exchange prefix filter and ranking', () => {
    const r = searchCatalog('BINANCE:BTC');
    expect(r[0]?.id).toBe('BINANCE:BTCUSDT');
    expect(r.every((s) => s.exchange === 'BINANCE')).toBe(true);
    expect(searchCatalog('apple')[0]?.id).toBe('NASDAQ:AAPL');
    expect(searchCatalog('silver')[0]?.id).toBe('METALS:XAGUSD');
    expect(searchCatalog('').length).toBeGreaterThan(5);
  });
  it('formats prices', () => {
    expect(formatPrice(68000.123, 2)).toBe('68,000.12');
    expect(formatPrice(NaN)).toBe('—');
    expect(inferPrecision(0.00001234)).toBe(8);
    expect(inferPrecision(0.5)).toBe(5);
    expect(inferPrecision(68000)).toBe(2);
  });
});
