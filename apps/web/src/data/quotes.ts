import { create } from 'zustand';
import type { FeedState, Quote, SymbolId, Unsubscribe } from '@tvk/shared-types';
import { getRegistry } from './registry';

export interface QuoteRow extends Quote {
  /** 'up' | 'down' flash hint for the last tick. */
  flash?: 'up' | 'down';
  status?: FeedState['status'];
}

interface QuoteStore {
  quotes: Record<string, QuoteRow>;
  set(symbol: SymbolId, patch: Partial<QuoteRow>): void;
}

export const useQuotes = create<QuoteStore>((set) => ({
  quotes: {},
  set: (symbol, patch) =>
    set((s) => {
      const prev = s.quotes[symbol];
      const price = patch.price ?? prev?.price ?? NaN;
      const prevClose = patch.prevClose ?? prev?.prevClose;
      const change = prevClose !== undefined ? price - prevClose : patch.change ?? prev?.change;
      const changePct = prevClose ? ((price - prevClose) / prevClose) * 100 : patch.changePct ?? prev?.changePct;
      const flash: QuoteRow['flash'] = prev && patch.price !== undefined && patch.price !== prev.price ? (patch.price > prev.price ? 'up' : 'down') : prev?.flash;
      return { quotes: { ...s.quotes, [symbol]: { symbol, time: Date.now(), ...prev, ...patch, price, prevClose, change, changePct, flash } } };
    }),
}));

/**
 * Keeps live quotes for a set of symbols: one REST quote for prevClose (refreshed every minute)
 * and a tick subscription for the live price. Shared across watchlist rows and the alert engine.
 */
export class QuoteHub {
  private subs = new Map<string, { count: number; unsub: Unsubscribe | null; timer: ReturnType<typeof setInterval> | null }>();

  acquire(symbol: SymbolId): Unsubscribe {
    let entry = this.subs.get(symbol);
    if (!entry) {
      entry = { count: 0, unsub: null, timer: null };
      this.subs.set(symbol, entry);
      void this.open(symbol, entry);
    }
    entry.count++;
    return () => {
      const e = this.subs.get(symbol);
      if (!e) return;
      e.count--;
      if (e.count <= 0) {
        e.unsub?.();
        if (e.timer) clearInterval(e.timer);
        this.subs.delete(symbol);
      }
    };
  }

  private async open(symbol: SymbolId, entry: { count: number; unsub: Unsubscribe | null; timer: ReturnType<typeof setInterval> | null }): Promise<void> {
    try {
      const registry = await getRegistry();
      const provider = registry.providerFor(symbol);
      const refresh = async () => {
        try {
          const q = await provider.getQuote?.(symbol);
          if (q) useQuotes.getState().set(symbol, { ...q, status: undefined });
        } catch (e) {
          useQuotes.getState().set(symbol, { status: 'error' });
          console.warn('quote failed', symbol, e);
        }
      };
      await refresh();
      if (!this.subs.has(symbol)) return;
      entry.timer = setInterval(refresh, 60000);
      entry.unsub = provider.subscribeTicks(
        symbol,
        (t) => useQuotes.getState().set(symbol, { price: t.price, time: t.time, source: t.source }),
        (s) => useQuotes.getState().set(symbol, { status: s.status }),
      );
    } catch (e) {
      useQuotes.getState().set(symbol, { status: 'error' });
      console.warn('quote subscription failed', symbol, e);
    }
  }
}

export const quoteHub = new QuoteHub();
