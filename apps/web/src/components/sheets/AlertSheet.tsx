import { useState } from 'react';
import type { AlertCondition, PriceAlert } from '@tvk/shared-types';
import { Modal } from '@tvk/ui';
import { useStore } from '../../state/store';
import { CONDITION_LABELS } from '../../data/alert-engine';
import { uid } from '../../lib/ids';
import { notificationsSupported, requestNotificationPermission } from '../../lib/notifications';

export function AlertSheet() {
  const store = useStore();
  const draft = useStore((s) => s.ui.alertDraft);
  const existing = draft?.editId ? store.alerts.find((a) => a.id === draft.editId) : undefined;
  const symbol = draft?.symbol ?? store.activeChart().symbol;
  const [condition, setCondition] = useState<AlertCondition>(existing?.condition ?? 'crossing');
  const [price, setPrice] = useState(String(existing?.price ?? (draft?.price !== undefined ? Number(draft.price.toPrecision(6)) : '')));
  const [message, setMessage] = useState(existing?.message ?? '');
  const [frequency, setFrequency] = useState<PriceAlert['frequency']>(existing?.frequency ?? 'once');
  const valid = Number.isFinite(Number(price)) && price !== '';
  const save = async () => {
    const a: PriceAlert = {
      id: existing?.id ?? uid('a'), symbol, condition, price: Number(price), message: message.trim() || undefined, enabled: true, frequency,
      createdAt: existing?.createdAt ?? Date.now(), updatedAt: Date.now(),
    };
    store.upsertAlert(a);
    if (!store.settings.notificationsEnabled && notificationsSupported()) {
      const granted = await requestNotificationPermission();
      if (granted) store.updateSettings({ notificationsEnabled: true });
    }
    store.pushToast({ kind: 'success', title: existing ? 'Alert updated' : 'Alert created', body: `${symbol.split(':')[1]} ${CONDITION_LABELS[condition].toLowerCase()} ${price}` });
    store.closeSheet();
  };
  return (
    <Modal
      title={existing ? 'Edit alert' : 'Create alert'}
      onClose={store.closeSheet}
      footer={<><button className="btn" onClick={store.closeSheet}>Cancel</button><button className="btn primary" data-testid="alert-save" disabled={!valid} onClick={() => void save()}>{existing ? 'Save' : 'Create'}</button></>}
    >
      <div className="field">
        <label className="label">Symbol</label>
        <div className="row">
          <input className="input grow" data-testid="alert-symbol" value={symbol} readOnly />
          <button className="btn" onClick={() => store.openSheet('symbol', { symbolTarget: 'alert' })}>Change</button>
        </div>
      </div>
      <div className="field">
        <label className="label" htmlFor="alert-condition">Condition</label>
        <select id="alert-condition" className="input select" data-testid="alert-condition" value={condition} onChange={(e) => setCondition(e.target.value as AlertCondition)}>
          {(Object.keys(CONDITION_LABELS) as AlertCondition[]).map((c) => <option key={c} value={c}>{CONDITION_LABELS[c]}</option>)}
        </select>
      </div>
      <div className="field">
        <label className="label" htmlFor="alert-price">Price</label>
        <input id="alert-price" className="input num" data-testid="alert-price" inputMode="decimal" value={price} onChange={(e) => setPrice(e.target.value)} placeholder="e.g. 70000" />
      </div>
      <div className="field">
        <label className="label" htmlFor="alert-freq">Trigger</label>
        <select id="alert-freq" className="input select" value={frequency} onChange={(e) => setFrequency(e.target.value as PriceAlert['frequency'])}>
          <option value="once">Only once</option>
          <option value="every">Every time (max once per minute)</option>
        </select>
      </div>
      <div className="field">
        <label className="label" htmlFor="alert-msg">Message (optional)</label>
        <input id="alert-msg" className="input" data-testid="alert-message" value={message} onChange={(e) => setMessage(e.target.value)} placeholder="Shown in the notification" />
      </div>
      <p className="muted small">Alerts are evaluated on live ticks while the app is open on this device. Background alerts need an always-on server and are planned for v2.</p>
    </Modal>
  );
}
