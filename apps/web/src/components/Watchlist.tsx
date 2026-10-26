import { useEffect, useState } from 'react';
import type { SymbolId } from '@tvk/shared-types';
import { exchangeOf, formatPrice, inferPrecision, tickerOf } from '@tvk/market-data';
import { Empty, IconChevronDown, IconClose, IconPlus, IconTrash } from '@tvk/ui';
import { useStore } from '../state/store';
import { quoteHub, useQuotes } from '../data/quotes';

export function Watchlist() {
  const store = useStore();
  const watchlists = useStore((s) => s.watchlists);
  const wl = store.activeWatchlist();
  const [menu, setMenu] = useState(false);
  const activeSymbol = store.activeChart().symbol;
  return (
    <div className="panel" data-testid="watchlist">
      <div className="panel-header">
        <div className="menu-anchor grow">
          <button className="btn ghost sm" data-testid="watchlist-picker" onClick={() => setMenu((v) => !v)} aria-haspopup="menu" aria-expanded={menu}><b>{wl.name}</b> <IconChevronDown size={14} /></button>
          {menu && (
            <div className="menu" role="menu" onMouseLeave={() => setMenu(false)}>
              {watchlists.map((w) => (
                <button key={w.id} role="menuitem" className={`menu-item${w.id === wl.id ? ' active' : ''}`} onClick={() => { store.setActiveWatchlist(w.id); setMenu(false); }}>{w.name} <span className="muted">({w.items.length})</span></button>
              ))}
              <div className="menu-sep" />
              <button role="menuitem" className="menu-item" onClick={() => { const n = prompt('New watchlist name'); if (n) store.createWatchlist(n); setMenu(false); }}><IconPlus size={14} /> New list</button>
              <button role="menuitem" className="menu-item" onClick={() => { const n = prompt('Rename list', wl.name); if (n) store.renameWatchlist(wl.id, n); setMenu(false); }}>Rename</button>
              <button role="menuitem" className="menu-item danger" disabled={watchlists.length <= 1} onClick={() => { if (confirm(`Delete "${wl.name}"?`)) store.deleteWatchlist(wl.id); setMenu(false); }}><IconTrash size={14} /> Delete list</button>
            </div>
          )}
        </div>
        <button className="btn ghost sm icon" data-testid="watchlist-add" onClick={() => store.openSheet('symbol', { symbolTarget: 'watchlist' })} title="Add symbol"><IconPlus size={16} /></button>
      </div>
      <div className="list watchlist-rows">
        {wl.items.length === 0 && <Empty title="Your watchlist is empty" hint="Add crypto, stocks or metals to track them live." action={<button className="btn primary" onClick={() => store.openSheet('symbol', { symbolTarget: 'watchlist' })}>Add symbol</button>} />}
        {wl.items.map((item) => (
          <WatchlistRow key={item.symbol} symbol={item.symbol} active={item.symbol === activeSymbol} onSelect={() => store.setSymbol(item.symbol)} onRemove={() => store.removeFromWatchlist(item.symbol)} />
        ))}
      </div>
    </div>
  );
}

function WatchlistRow({ symbol, active, onSelect, onRemove }: { symbol: SymbolId; active: boolean; onSelect: () => void; onRemove: () => void }) {
  const q = useQuotes((s) => s.quotes[symbol]);
  useEffect(() => quoteHub.acquire(symbol), [symbol]);
  const precision = q?.price ? inferPrecision(q.price) : 2;
  const pct = q?.changePct;
  const dir = pct === undefined ? '' : pct >= 0 ? 'up' : 'down';
  return (
    <div className={`list-item clickable watch-row${active ? ' selected' : ''}`} data-testid="watchlist-row" data-symbol={symbol} onClick={onSelect} role="button" tabIndex={0} onKeyDown={(e) => e.key === 'Enter' && onSelect()}>
      <div className="grow">
        <div className="watch-ticker">{tickerOf(symbol)}</div>
        <div className="muted small">{exchangeOf(symbol)}{q?.status && q.status !== 'live' && q.status !== 'idle' ? ` · ${q.status}` : ''}</div>
      </div>
      <div className="watch-price num" style={{ textAlign: 'right' }}>
        <div className={`price flash-${q?.flash ?? 'none'}`} data-testid="watch-price">{q?.price ? formatPrice(q.price, precision) : <span className="muted">—</span>}</div>
        <div className={`small ${dir}`} data-testid="watch-change">
          {q?.change !== undefined && Number.isFinite(q.change) ? `${q.change >= 0 ? '+' : ''}${formatPrice(q.change, precision)} ` : ''}
          {pct !== undefined && Number.isFinite(pct) ? `${pct >= 0 ? '+' : ''}${pct.toFixed(2)}%` : <span className="muted">&nbsp;</span>}
        </div>
      </div>
      <button className="btn ghost sm icon remove" aria-label={`Remove ${symbol}`} onClick={(e) => { e.stopPropagation(); onRemove(); }}><IconClose size={14} /></button>
    </div>
  );
}
