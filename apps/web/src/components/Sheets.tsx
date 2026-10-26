import { useStore } from '../state/store';
import { SymbolSearchSheet } from './sheets/SymbolSearchSheet';
import { IndicatorsSheet } from './sheets/IndicatorsSheet';
import { AlertSheet } from './sheets/AlertSheet';
import { LayoutsSheet } from './sheets/LayoutsSheet';
import { SettingsSheet } from './sheets/SettingsSheet';
import { AuthSheet } from './sheets/AuthSheet';
import { Modal } from '@tvk/ui';
import { Watchlist } from './Watchlist';
import { AlertsPanel } from './AlertsPanel';

export function Sheets({ phone }: { phone: boolean }) {
  const sheet = useStore((s) => s.ui.sheet);
  const close = useStore((s) => s.closeSheet);
  const tab = useStore((s) => s.ui.sidebarTab);
  switch (sheet) {
    case 'symbol': return <SymbolSearchSheet />;
    case 'indicators': return <IndicatorsSheet />;
    case 'alert': return <AlertSheet />;
    case 'layouts': return <LayoutsSheet />;
    case 'settings': return <SettingsSheet />;
    case 'auth': return <AuthSheet />;
    case 'drawings':
      // Phone: watchlist / alerts open as sheets instead of a sidebar.
      return phone ? <Modal title={tab === 'watchlist' ? 'Watchlist' : 'Alerts'} onClose={close}>{tab === 'watchlist' ? <Watchlist /> : <AlertsPanel />}</Modal> : null;
    default: return null;
  }
}
