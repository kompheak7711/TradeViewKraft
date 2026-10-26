import type { LayoutGrid } from '@tvk/shared-types';
import { IconBell, IconGrid, IconLayout1, IconLayout2h, IconLayout2v, IconLayout4, IconList, IconMoon, IconSearch, IconSettings, IconSun, IconUser } from '@tvk/ui';
import { useStore } from '../state/store';
import { syncAvailable } from '../lib/supabase';

const GRIDS: Array<{ value: LayoutGrid; icon: React.ReactNode; label: string }> = [
  { value: '1', icon: <IconLayout1 size={16} />, label: '1 chart' },
  { value: '2h', icon: <IconLayout2h size={16} />, label: '2 charts side by side' },
  { value: '2v', icon: <IconLayout2v size={16} />, label: '2 charts stacked' },
  { value: '4', icon: <IconLayout4 size={16} />, label: '4 charts' },
];

export function TopBar({ phone, theme }: { phone: boolean; theme: 'dark' | 'light' }) {
  const store = useStore();
  const layout = store.activeLayout();
  const sync = useStore((s) => s.sync);
  return (
    <header className="topbar" data-testid="topbar">
      <div className="brand" aria-label="TradingViewKraft">
        <span className="brand-mark" aria-hidden="true" />
        {!phone && <span className="brand-name">TradingViewKraft</span>}
      </div>
      <button className="btn ghost" data-testid="open-symbol-search" onClick={() => store.openSheet('symbol', { symbolTarget: 'chart' })} title="Symbol search (/)">
        <IconSearch size={16} /><span>Search symbol</span>{!phone && <span className="kbd" style={{ marginLeft: 6 }}>/</span>}
      </button>
      <div className="grow" />
      {!phone && (
        <div className="segmented" role="radiogroup" aria-label="Chart layout" data-testid="grid-picker">
          {GRIDS.map((g) => (
            <button key={g.value} role="radio" aria-checked={layout.grid === g.value} className={layout.grid === g.value ? 'active' : ''} data-testid={`grid-${g.value}`} onClick={() => store.setGrid(g.value)} title={g.label}>{g.icon}</button>
          ))}
        </div>
      )}
      <button className="btn ghost sm" data-testid="layouts-button" onClick={() => store.openSheet('layouts')} title="Saved layouts"><IconGrid size={16} />{!phone && <span className="layout-name">{layout.name}</span>}</button>
      {!phone && (
        <>
          <button className={`btn ghost sm icon${store.ui.sidebarOpen && store.ui.sidebarTab === 'watchlist' ? ' active' : ''}`} data-testid="toggle-watchlist" onClick={() => store.setUi({ sidebarOpen: !(store.ui.sidebarOpen && store.ui.sidebarTab === 'watchlist'), sidebarTab: 'watchlist' })} title="Watchlist"><IconList size={16} /></button>
          <button className={`btn ghost sm icon${store.ui.sidebarOpen && store.ui.sidebarTab === 'alerts' ? ' active' : ''}`} data-testid="toggle-alerts" onClick={() => store.setUi({ sidebarOpen: !(store.ui.sidebarOpen && store.ui.sidebarTab === 'alerts'), sidebarTab: 'alerts' })} title="Alerts"><IconBell size={16} /></button>
        </>
      )}
      <button className="btn ghost sm icon" data-testid="theme-toggle" onClick={() => store.updateSettings({ theme: theme === 'dark' ? 'light' : 'dark' })} title="Toggle theme">{theme === 'dark' ? <IconSun size={16} /> : <IconMoon size={16} />}</button>
      <button className="btn ghost sm icon" data-testid="account-button" onClick={() => store.openSheet(syncAvailable ? 'auth' : 'settings')} title={sync.userEmail ? `Signed in as ${sync.userEmail}` : 'Account'}>
        <IconUser size={16} />
        <span className={`sync-dot ${sync.status}`} aria-hidden="true" />
      </button>
      <button className="btn ghost sm icon" data-testid="settings-button" onClick={() => store.openSheet('settings')} title="Settings"><IconSettings size={16} /></button>
    </header>
  );
}
