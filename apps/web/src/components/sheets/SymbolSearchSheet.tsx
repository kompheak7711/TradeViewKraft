import { useEffect, useRef, useState } from 'react';
import type { AssetClass, SymbolInfo } from '@tvk/shared-types';
import { parseSymbol, POPULAR_SYMBOLS, searchCatalog } from '@tvk/market-data';
import { IconPlus, IconCheck, Modal } from '@tvk/ui';
import { useStore } from '../../state/store';
import { getRegistry } from '../../data/registry';

type Filter = 'all' | AssetClass;
const FILTERS: Array<{ value: Filter; label: string }> = [
  { value: 'all', label: 'All' }, { value: 'crypto', label: 'Crypto' }, { value: 'stock', label: 'Stocks' }, { value: 'metal', label: 'Metals' },
];

export function SymbolSearchSheet() {
  const store = useStore();
  const target = useStore((s) => s.ui.symbolSheetTarget);
  const wl = store.activeWatchlist();
  const [q, setQ] = useState('');
  const [filter, setFilter] = useState<Filter>('all');
  const [results, setResults] = useState<SymbolInfo[]>(POPULAR_SYMBOLS);
  const [loading, setLoading] = useState(false);
  const [cursor, setCursor] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  useEffect(() => {
    let cancelled = false;
    const local = searchCatalog(q, POPULAR_SYMBOLS, 40);
    setResults(local);
    setCursor(0);
    if (!q.trim()) return;
    setLoading(true);
    const t = setTimeout(async () => {
      try {
        const r = await getRegistry();
        const remote = await r.search(q, 40);
        if (!cancelled) setResults(remote.length ? remote : local);
      } catch {
        /* keep local */
      } finally {
        if (!cancelled) setLoading(false);
      }
    }, 250);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [q]);

  const visible = results.filter((s) => filter === 'all' || s.assetClass === filter);
  const choose = (s: SymbolInfo) => {
    if (target === 'watchlist') {
      store.addToWatchlist(s.id);
      store.pushToast({ kind: 'success', title: `${s.ticker} added to ${wl.name}` });
    } else if (target === 'alert') {
      store.openSheet('alert', { alertDraft: { symbol: s.id } });
      return;
    } else {
      store.setSymbol(s.id);
    }
    store.closeSheet();
  };
  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); setCursor((c) => Math.min(c + 1, visible.length - 1)); }
    if (e.key === 'ArrowUp') { e.preventDefault(); setCursor((c) => Math.max(c - 1, 0)); }
    if (e.key === 'Enter') {
      const hit = visible[cursor];
      if (hit) choose(hit);
      else {
        const id = parseSymbol(q);
        if (id) choose({ id, ticker: id.split(':')[1]!, exchange: id.split(':')[0] as SymbolInfo['exchange'], description: id, assetClass: 'crypto', base: '', quote: '', priceStep: 0.01, pricePrecision: 2 });
      }
    }
  };
  return (
    <Modal title={target === 'watchlist' ? `Add to ${wl.name}` : 'Symbol search'} onClose={store.closeSheet}>
      <input ref={inputRef} className="input" data-testid="symbol-search-input" placeholder="Search: BTCUSDT, BINANCE:ETHUSDT, AAPL, NASDAQ:NVDA, XAUUSD, gold…" value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={onKey} autoCapitalize="characters" autoCorrect="off" spellCheck={false} aria-label="Symbol search" />
      <div className="row" style={{ margin: '10px 0', flexWrap: 'wrap' }}>
        {FILTERS.map((f) => <button key={f.value} className={`chip${filter === f.value ? ' active' : ''}`} data-testid={`filter-${f.value}`} onClick={() => setFilter(f.value)}>{f.label}</button>)}
        {loading && <span className="muted small">Searching…</span>}
      </div>
      <div className="list symbol-results" role="listbox" data-testid="symbol-results">
        {visible.length === 0 && <div className="empty">No symbols match “{q}”. Try an exchange prefix like BINANCE:, COINBASE:, KRAKEN:, BYBIT:, OKX:, NASDAQ:, NYSE: or METALS:.</div>}
        {visible.map((s, i) => {
          const inList = wl.items.some((x) => x.symbol === s.id);
          return (
            <div key={s.id} role="option" aria-selected={i === cursor} className={`list-item clickable${i === cursor ? ' selected' : ''}`} data-testid="symbol-result" data-symbol={s.id} onClick={() => choose(s)} onMouseEnter={() => setCursor(i)}>
              <div className="grow">
                <div><b>{s.ticker}</b> <span className="muted small">{s.description}</span></div>
                <div className="muted small">{s.exchange} · {s.assetClass}{s.dataNote ? ` · ${s.dataNote}` : ''}</div>
              </div>
              {target !== 'watchlist' && (
                <button className="btn ghost sm icon" title={inList ? 'In watchlist' : 'Add to watchlist'} aria-label={inList ? 'In watchlist' : `Add ${s.ticker} to watchlist`} onClick={(e) => { e.stopPropagation(); if (!inList) store.addToWatchlist(s.id); }}>
                  {inList ? <IconCheck size={14} /> : <IconPlus size={14} />}
                </button>
              )}
            </div>
          );
        })}
      </div>
    </Modal>
  );
}
