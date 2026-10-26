import { useEffect, useState } from 'react';
import type { ChartType, Timeframe } from '@tvk/shared-types';
import { TIMEFRAMES } from '@tvk/shared-types';
import { Modal, Switch } from '@tvk/ui';
import { useStore } from '../../state/store';
import { notificationsSupported, requestNotificationPermission, showNotification } from '../../lib/notifications';
import { syncAvailable } from '../../lib/supabase';
import { syncService } from '../../data/sync';
import { DATA_MODE, isStandalone, isIOS, isTauri } from '../../lib/platform';

export function SettingsSheet() {
  const store = useStore();
  const settings = useStore((s) => s.settings);
  const sync = useStore((s) => s.sync);
  const [perm, setPerm] = useState<string>(typeof Notification !== 'undefined' ? Notification.permission : 'n/a');
  useEffect(() => setPerm(typeof Notification !== 'undefined' ? Notification.permission : isTauri ? 'tauri' : 'n/a'), [settings.notificationsEnabled]);
  const toggleNotifications = async (on: boolean) => {
    if (!on) {
      store.updateSettings({ notificationsEnabled: false });
      return;
    }
    const granted = await requestNotificationPermission();
    store.updateSettings({ notificationsEnabled: granted });
    if (!granted) store.pushToast({ kind: 'warn', title: 'Notifications not allowed', body: isIOS && !isStandalone ? 'On iPhone/iPad, add the app to your Home Screen first, then enable notifications.' : 'Allow notifications for this app in your system settings.' });
  };
  return (
    <Modal title="Settings" onClose={store.closeSheet}>
      <div className="settings-group">
        <div className="settings-title">Appearance</div>
        <div className="field">
          <label className="label" htmlFor="theme">Theme</label>
          <select id="theme" className="input select" data-testid="theme-select" value={settings.theme} onChange={(e) => store.updateSettings({ theme: e.target.value as typeof settings.theme })}>
            <option value="dark">Dark</option><option value="light">Light</option><option value="system">Follow system</option>
          </select>
        </div>
      </div>
      <div className="settings-group">
        <div className="settings-title">Chart defaults</div>
        <div className="row">
          <div className="field grow"><label className="label" htmlFor="def-tf">Timeframe for new charts</label>
            <select id="def-tf" className="input select" value={settings.defaultTimeframe} onChange={(e) => store.updateSettings({ defaultTimeframe: e.target.value as Timeframe })}>{TIMEFRAMES.map((t) => <option key={t} value={t}>{t}</option>)}</select></div>
          <div className="field grow"><label className="label" htmlFor="def-type">Chart type</label>
            <select id="def-type" className="input select" value={settings.defaultChartType} onChange={(e) => store.updateSettings({ defaultChartType: e.target.value as ChartType })}>
              <option value="candles">Candles</option><option value="bars">Bars</option><option value="line">Line</option><option value="area">Area</option><option value="heikinashi">Heikin Ashi</option>
            </select></div>
        </div>
      </div>
      <div className="settings-group">
        <div className="settings-title">Alerts</div>
        <div className="row" style={{ marginBottom: 10 }}>
          <div className="grow"><div>System notifications</div><div className="muted small">{isTauri ? 'macOS Notification Center' : notificationsSupported() ? `Web notifications (${perm})` : 'Not supported in this browser'}</div></div>
          <Switch on={settings.notificationsEnabled} onChange={(v) => void toggleNotifications(v)} label="System notifications" />
        </div>
        <div className="row" style={{ marginBottom: 10 }}>
          <div className="grow"><div>Sound</div><div className="muted small">Short chime when an alert fires</div></div>
          <Switch on={settings.soundEnabled} onChange={(v) => store.updateSettings({ soundEnabled: v })} label="Alert sound" />
        </div>
        {settings.notificationsEnabled && <button className="btn sm" onClick={() => void showNotification('TradingViewKraft', 'Test notification')}>Send test notification</button>}
      </div>
      <div className="settings-group">
        <div className="settings-title">Account & sync</div>
        {!syncAvailable && <p className="muted small">Sync is not configured for this build (set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY). Layouts, watchlists and alerts are saved on this device only.</p>}
        {syncAvailable && (
          <div className="row">
            <div className="grow">{sync.userEmail ? <><div>{sync.userEmail}</div><div className="muted small">Status: {sync.status}{sync.lastSyncAt ? ` · ${new Date(sync.lastSyncAt).toLocaleTimeString()}` : ''}{sync.message ? ` · ${sync.message}` : ''}</div></> : <div className="muted">Not signed in · local-only mode</div>}</div>
            {sync.userEmail ? <button className="btn" onClick={() => void syncService.signOut()}>Sign out</button> : <button className="btn primary" onClick={() => store.openSheet('auth')}>Sign in</button>}
          </div>
        )}
      </div>
      <div className="settings-group">
        <div className="settings-title">Data sources</div>
        <ul className="muted small sources">
          <li>Crypto: Binance, Coinbase, Kraken, Bybit, OKX public streams, direct from this device.</li>
          <li>US stocks: Alpaca (IEX feed) via the relay. Real-time IEX trades; volume reflects IEX only.</li>
          <li>Gold & silver: spot via Twelve Data (free plan, ~1 minute updates). Tokenized gold (PAXG, XAUT) available on crypto exchanges for tick-level charts.</li>
          <li>Mode: <b>{DATA_MODE}</b>{DATA_MODE === 'mock' ? ' (simulated data)' : ''} · Platform: {isTauri ? 'macOS app' : isStandalone ? 'installed PWA' : 'browser'}</li>
        </ul>
      </div>
      <div className="settings-group">
        <div className="settings-title">Keyboard</div>
        <div className="muted small"><span className="kbd">/</span> search · <span className="kbd">T</span> trend line · <span className="kbd">H</span> horizontal · <span className="kbd">R</span> ray · <span className="kbd">B</span> rectangle · <span className="kbd">F</span> fib · <span className="kbd">X</span> text · <span className="kbd">Esc</span> cursor · <span className="kbd">⌫</span> delete drawing</div>
      </div>
    </Modal>
  );
}
