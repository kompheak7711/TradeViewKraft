import { useState } from 'react';
import { Modal } from '@tvk/ui';
import { useStore } from '../../state/store';
import { syncService } from '../../data/sync';
import { syncAvailable } from '../../lib/supabase';

export function AuthSheet() {
  const store = useStore();
  const sync = useStore((s) => s.sync);
  const [email, setEmail] = useState('');
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const submit = async () => {
    setError(null);
    try {
      await syncService.signInWithEmail(email.trim());
      setSent(true);
    } catch (e) {
      setError((e as Error).message);
    }
  };
  return (
    <Modal title="Account" onClose={store.closeSheet}>
      {!syncAvailable && <p className="muted">Sync is not configured for this build.</p>}
      {syncAvailable && sync.userEmail && (
        <div>
          <p>Signed in as <b>{sync.userEmail}</b>. Layouts, watchlists, alerts and settings sync across your Mac, iPhone and iPad.</p>
          <p className="muted small">Status: {sync.status}{sync.message ? ` · ${sync.message}` : ''}</p>
          <button className="btn" onClick={() => void syncService.signOut().then(store.closeSheet)}>Sign out</button>
        </div>
      )}
      {syncAvailable && !sync.userEmail && !sent && (
        <form onSubmit={(e) => { e.preventDefault(); void submit(); }}>
          <p className="muted small">Enter your email and we will send a magic link. No password needed.</p>
          <div className="field"><label className="label" htmlFor="email">Email</label><input id="email" className="input" type="email" required autoComplete="email" inputMode="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" /></div>
          {error && <p className="down small">{error}</p>}
          <button className="btn primary" type="submit" disabled={!email.includes('@') || sync.status === 'signing-in'}>{sync.status === 'signing-in' ? 'Sending…' : 'Send magic link'}</button>
        </form>
      )}
      {sent && <p>Check <b>{email}</b> for a sign-in link. Open it on this device to finish signing in.</p>}
    </Modal>
  );
}
