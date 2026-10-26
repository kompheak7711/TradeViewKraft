import type { ExchangeId, MarketDataProvider, SymbolId, SymbolInfo } from '@tvk/shared-types';
import { exchangeOf, POPULAR_SYMBOLS, searchCatalog } from './symbols';
import { BinanceProvider } from './providers/binance';
import { CoinbaseProvider } from './providers/coinbase';
import { KrakenProvider } from './providers/kraken';
import { BybitProvider } from './providers/bybit';
import { OkxProvider } from './providers/okx';
import { AlpacaProvider } from './providers/alpaca';
import { MetalsProvider } from './providers/metals';
import { MockProvider } from './providers/mock';
import type { WsFactory } from './reconnecting-ws';

export interface RegistryOptions {
  /** 'live' uses real providers; 'mock' uses the deterministic simulator for every exchange. */
  mode?: 'live' | 'mock';
  /** Base URL for the Vercel relay functions ('' = same origin). */
  relayBase?: string;
  wsFactory?: WsFactory;
}

export class ProviderRegistry {
  private readonly byExchange = new Map<ExchangeId, MarketDataProvider>();
  readonly providers: MarketDataProvider[] = [];

  constructor(opts: RegistryOptions = {}) {
    if (opts.mode === 'mock') {
      this.register(new MockProvider());
      return;
    }
    const relayBase = opts.relayBase ?? '';
    for (const p of [
      new BinanceProvider({ wsFactory: opts.wsFactory }),
      new CoinbaseProvider({ wsFactory: opts.wsFactory }),
      new KrakenProvider({ wsFactory: opts.wsFactory }),
      new BybitProvider({ wsFactory: opts.wsFactory }),
      new OkxProvider({ wsFactory: opts.wsFactory }),
      new AlpacaProvider({ relayBase }),
      new MetalsProvider({ relayBase }),
    ]) this.register(p);
  }

  register(p: MarketDataProvider): void {
    this.providers.push(p);
    for (const ex of p.exchanges) if (!this.byExchange.has(ex)) this.byExchange.set(ex, p);
  }

  providerFor(symbol: SymbolId): MarketDataProvider {
    const p = this.byExchange.get(exchangeOf(symbol));
    if (!p) throw new Error(`No provider for ${symbol}`);
    return p;
  }

  /** Search across all providers; static catalog results come first for instant feedback. */
  async search(query: string, limit = 25): Promise<SymbolInfo[]> {
    const local = searchCatalog(query, POPULAR_SYMBOLS, limit);
    const remote = await Promise.allSettled(this.providers.map((p) => p.searchSymbols(query, 10)));
    const seen = new Set<string>();
    const merged: SymbolInfo[] = [];
    for (const s of [...local, ...remote.flatMap((r) => (r.status === 'fulfilled' ? r.value : []))]) {
      if (seen.has(s.id)) continue;
      seen.add(s.id);
      merged.push(s);
    }
    return merged.slice(0, limit);
  }

  dispose(): void {
    for (const p of this.providers) p.dispose();
  }
}
