import { IconBell, IconChart, IconList, IconSettings, IconTrend } from '@tvk/ui';
import { useStore } from '../state/store';

/** iPhone bottom tab bar. */
export function TabBar({ toolsOpen, onToggleTools }: { toolsOpen: boolean; onToggleTools: () => void }) {
  const store = useStore();
  const sheet = useStore((s) => s.ui.sheet);
  const tab = useStore((s) => s.ui.sidebarTab);
  const open = (t: 'watchlist' | 'alerts') => { store.setUi({ sidebarTab: t }); store.openSheet('drawings'); };
  return (
    <nav className="tabbar" aria-label="Main" data-testid="tabbar">
      <button className={`tab${!sheet && !toolsOpen ? ' active' : ''}`} onClick={() => { store.closeSheet(); if (toolsOpen) onToggleTools(); }}><IconChart /><span>Chart</span></button>
      <button className={`tab${toolsOpen ? ' active' : ''}`} data-testid="tab-tools" onClick={onToggleTools}><IconTrend /><span>Draw</span></button>
      <button className={`tab${sheet === 'drawings' && tab === 'watchlist' ? ' active' : ''}`} data-testid="tab-watchlist" onClick={() => open('watchlist')}><IconList /><span>Watchlist</span></button>
      <button className={`tab${sheet === 'drawings' && tab === 'alerts' ? ' active' : ''}`} data-testid="tab-alerts" onClick={() => open('alerts')}><IconBell /><span>Alerts</span></button>
      <button className={`tab${sheet === 'settings' ? ' active' : ''}`} onClick={() => store.openSheet('settings')}><IconSettings /><span>Settings</span></button>
    </nav>
  );
}
