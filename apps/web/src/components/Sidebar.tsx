import { useStore } from '../state/store';
import { Watchlist } from './Watchlist';
import { AlertsPanel } from './AlertsPanel';

export function Sidebar() {
  const ui = useStore((s) => s.ui);
  const setUi = useStore((s) => s.setUi);
  return (
    <aside className="sidebar" data-testid="sidebar">
      <div className="segmented sidebar-tabs" role="tablist">
        <button role="tab" aria-selected={ui.sidebarTab === 'watchlist'} className={ui.sidebarTab === 'watchlist' ? 'active' : ''} onClick={() => setUi({ sidebarTab: 'watchlist' })}>Watchlist</button>
        <button role="tab" aria-selected={ui.sidebarTab === 'alerts'} className={ui.sidebarTab === 'alerts' ? 'active' : ''} onClick={() => setUi({ sidebarTab: 'alerts' })}>Alerts</button>
      </div>
      {ui.sidebarTab === 'watchlist' ? <Watchlist /> : <AlertsPanel />}
    </aside>
  );
}
