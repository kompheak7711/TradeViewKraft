import { tickerOf, exchangeOf } from '@tvk/market-data';
import { Empty, IconBell, IconPlus, IconTrash, Switch } from '@tvk/ui';
import { useStore } from '../state/store';
import { CONDITION_LABELS } from '../data/alert-engine';

export function AlertsPanel() {
  const store = useStore();
  const alerts = useStore((s) => s.alerts);
  const sorted = [...alerts].sort((a, b) => b.createdAt - a.createdAt);
  return (
    <div className="panel" data-testid="alerts-panel">
      <div className="panel-header">
        <b className="grow">Alerts</b>
        <button className="btn ghost sm icon" data-testid="alerts-add" onClick={() => store.openSheet('alert', { alertDraft: { symbol: store.activeChart().symbol } })} title="New alert"><IconPlus size={16} /></button>
      </div>
      {!store.settings.notificationsEnabled && alerts.length > 0 && (
        <div className="panel-note">System notifications are off. <button className="link" onClick={() => store.openSheet('settings')}>Turn on in Settings</button></div>
      )}
      <div className="list">
        {sorted.length === 0 && <Empty icon={<IconBell size={28} />} title="No alerts yet" hint="Alerts fire while the app is open, with a macOS notification or in-app banner." action={<button className="btn primary" onClick={() => store.openSheet('alert', { alertDraft: { symbol: store.activeChart().symbol } })}>Create alert</button>} />}
        {sorted.map((a) => (
          <div key={a.id} className="list-item alert-row" data-testid="alert-row" data-alert-id={a.id}>
            <div className="grow clickable" onClick={() => store.openSheet('alert', { alertDraft: { symbol: a.symbol, price: a.price, editId: a.id } })} role="button" tabIndex={0}>
              <div><b>{tickerOf(a.symbol)}</b> <span className="muted small">{exchangeOf(a.symbol)}</span></div>
              <div className="small">{CONDITION_LABELS[a.condition]} <span className="num">{a.price}</span>{a.message ? ` · ${a.message}` : ''}</div>
              <div className="muted small">{a.triggeredAt ? `Triggered ${new Date(a.triggeredAt).toLocaleString()}` : a.frequency === 'once' ? 'Once' : 'Every time'}</div>
            </div>
            <Switch on={a.enabled} onChange={(v) => store.toggleAlert(a.id, v)} label={`Enable alert ${a.id}`} />
            <button className="btn ghost sm icon" aria-label="Delete alert" onClick={() => store.removeAlert(a.id)}><IconTrash size={14} /></button>
          </div>
        ))}
      </div>
    </div>
  );
}
