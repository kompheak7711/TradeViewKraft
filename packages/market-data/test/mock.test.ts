import { describe, expect, it } from 'vitest';
import { MockProvider, ProviderRegistry } from '../src';

describe('MockProvider', () => {
  it('produces deterministic, contiguous history', async () => {
    const p = new MockProvider({ now: () => 1_700_000_000 });
    const a = await p.getHistory({ symbol: 'BINANCE:BTCUSDT', timeframe: '1h', limit: 50 });
    const b = await p.getHistory({ symbol: 'BINANCE:BTCUSDT', timeframe: '1h', limit: 50 });
    expect(a).toEqual(b);
    expect(a).toHaveLength(50);
    for (let i = 1; i < a.length; i++) expect(a[i]!.time - a[i - 1]!.time).toBe(3600);
    expect(a.every((c) => c.high >= Math.max(c.open, c.close) && c.low <= Math.min(c.open, c.close))).toBe(true);
  });
  it('registry routes by exchange prefix', () => {
    const r = new ProviderRegistry({ mode: 'mock' });
    expect(r.providerFor('NASDAQ:AAPL').id).toBe('mock');
    const live = new ProviderRegistry({ mode: 'live', wsFactory: () => { throw new Error('no ws'); } });
    expect(live.providerFor('BINANCE:BTCUSDT').id).toBe('binance');
    expect(live.providerFor('NYSE:JPM').id).toBe('alpaca');
    expect(live.providerFor('METALS:XAUUSD').id).toBe('metals');
    expect(() => live.providerFor('MOCK:X')).toThrow();
  });
});
