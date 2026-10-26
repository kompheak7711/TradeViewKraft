import type { PriceAlert, SymbolId, Tick, Unsubscribe } from '@tvk/shared-types';
import { useStore } from '../state/store';
import { getRegistry } from './registry';
import { playAlertSound, showNotification } from '../lib/notifications';

/** Pure check used by the engine and by tests: does a tick trigger the alert given the previous price? */
export function evaluateAlert(alert: PriceAlert, prevPrice: number | undefined, price: number): boolean {
  if (!alert.enabled) return false;
  switch (alert.condition) {
    case 'greater':
      return price > alert.price && (prevPrice === undefined || prevPrice <= alert.price);
    case 'less':
      return price < alert.price && (prevPrice === undefined || prevPrice >= alert.price);
    case 'crossing_up':
      return prevPrice !== undefined && prevPrice < alert.price && price >= alert.price;
    case 'crossing_down':
      return prevPrice !== undefined && prevPrice > alert.price && price <= alert.price;
    case 'crossing':
      return prevPrice !== undefined && ((prevPrice < alert.price && price >= alert.price) || (prevPrice > alert.price && price <= alert.price));
  }
}

export const CONDITION_LABELS: Record<PriceAlert['condition'], string> = {
  crossing: 'Crossing', crossing_up: 'Crossing up', crossing_down: 'Crossing down', greater: 'Greater than', less: 'Less than',
};

/**
 * Subscribes to ticks for every enabled alert's symbol while the app is open and fires
 * in-app toasts plus system notifications. Alerts while the app is closed need a server (v2).
 */
export class AlertEngine {
  private subs = new Map<string, Unsubscribe>();
  private lastPrice = new Map<string, number>();
  private stop: (() => void) | null = null;

  start(): void {
    this.sync(useStore.getState().alerts);
    this.stop = useStore.subscribe((s, prev) => {
      if (s.alerts !== prev.alerts) this.sync(s.alerts);
    });
  }

  dispose(): void {
    this.stop?.();
    for (const u of this.subs.values()) u();
    this.subs.clear();
  }

  private sync(alerts: PriceAlert[]): void {
    const needed = new Set<SymbolId>(alerts.filter((a) => a.enabled).map((a) => a.symbol));
    for (const [sym, unsub] of this.subs) {
      if (!needed.has(sym as SymbolId)) {
        unsub();
        this.subs.delete(sym);
      }
    }
    for (const sym of needed) if (!this.subs.has(sym)) this.subs.set(sym, this.subscribeSymbol(sym as SymbolId));
  }

  private subscribeSymbol(symbol: SymbolId): Unsubscribe {
    let inner: Unsubscribe | null = null;
    let cancelled = false;
    void getRegistry().then((r) => {
      if (cancelled) return;
      try {
        inner = r.providerFor(symbol).subscribeTicks(symbol, (t) => this.onTick(t));
      } catch (e) {
        console.warn('alert subscription failed', symbol, e);
      }
    });
    return () => {
      cancelled = true;
      inner?.();
    };
  }

  private onTick(t: Tick): void {
    const prev = this.lastPrice.get(t.symbol);
    this.lastPrice.set(t.symbol, t.price);
    const state = useStore.getState();
    for (const a of state.alerts) {
      if (a.symbol !== t.symbol || !a.enabled) continue;
      if (a.triggeredAt && a.frequency === 'every' && Date.now() - a.triggeredAt < 60000) continue; // debounce 1/min
      if (evaluateAlert(a, prev, t.price)) this.fire(a, t.price);
    }
  }

  private fire(a: PriceAlert, price: number): void {
    const state = useStore.getState();
    state.markAlertTriggered(a.id, Date.now());
    const title = `${a.symbol.split(':')[1]} ${CONDITION_LABELS[a.condition].toLowerCase()} ${a.price}`;
    const body = a.message || `Last price ${price}`;
    state.pushToast({ kind: 'warn', title: `Alert: ${title}`, body });
    if (state.settings.notificationsEnabled) void showNotification(title, body);
    if (state.settings.soundEnabled) playAlertSound();
  }
}
