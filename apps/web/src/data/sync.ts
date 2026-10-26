/**
 * Account sync via Supabase: layouts, watchlists, alerts and settings are stored per user as JSON rows
 * protected by row-level security. Strategy: local-first, last-write-wins per row by updated_at,
 * push debounced on local changes, pull on sign-in, and realtime postgres_changes for other devices.
 */
import type { Layout, PriceAlert, UserSettings, Watchlist } from '@tvk/shared-types';
import type { RealtimeChannel } from '@supabase/supabase-js';
import { supabase } from '../lib/supabase';
import { useStore } from '../state/store';

type Table = 'layouts' | 'watchlists' | 'alerts';

export class SyncService {
  private channel: RealtimeChannel | null = null;
  private unsubscribeStore: (() => void) | null = null;
  private pushTimer: ReturnType<typeof setTimeout> | null = null;
  private userId: string | null = null;
  private lastPushedRevision = -1;

  async start(): Promise<void> {
    if (!supabase) return;
    const { data } = await supabase.auth.getSession();
    await this.onSession(data.session?.user ?? null);
    supabase.auth.onAuthStateChange((_event, session) => void this.onSession(session?.user ?? null));
  }

  async signInWithEmail(email: string): Promise<void> {
    if (!supabase) throw new Error('Sync is not configured');
    useStore.getState().setSync({ status: 'signing-in' });
    const { error } = await supabase.auth.signInWithOtp({ email, options: { emailRedirectTo: typeof location !== 'undefined' ? location.origin : undefined } });
    if (error) {
      useStore.getState().setSync({ status: 'local', message: error.message });
      throw error;
    }
  }

  async signOut(): Promise<void> {
    await supabase?.auth.signOut();
  }

  private async onSession(user: { id: string; email?: string } | null): Promise<void> {
    const store = useStore.getState();
    if (!user) {
      this.teardown();
      store.setSync({ userEmail: null, status: 'local', message: undefined });
      return;
    }
    if (this.userId === user.id) return;
    this.userId = user.id;
    store.setSync({ userEmail: user.email ?? null, status: 'syncing' });
    try {
      await this.pullAll();
      await this.pushAll();
      this.subscribeRealtime();
      this.unsubscribeStore = useStore.subscribe((s, prev) => {
        if (s.revision !== prev.revision) this.schedulePush();
      });
      store.setSync({ status: 'synced', lastSyncAt: Date.now(), message: undefined });
    } catch (e) {
      store.setSync({ status: 'error', message: (e as Error).message });
    }
  }

  private teardown(): void {
    this.userId = null;
    this.channel?.unsubscribe();
    this.channel = null;
    this.unsubscribeStore?.();
    this.unsubscribeStore = null;
  }

  private schedulePush(): void {
    if (this.pushTimer) clearTimeout(this.pushTimer);
    this.pushTimer = setTimeout(() => void this.pushAll(), 1200);
  }

  private async pullAll(): Promise<void> {
    if (!supabase || !this.userId) return;
    const [l, w, a, s] = await Promise.all([
      supabase.from('layouts').select('id,data,updated_at'),
      supabase.from('watchlists').select('id,data,updated_at'),
      supabase.from('alerts').select('id,data,updated_at'),
      supabase.from('settings').select('data,updated_at').eq('user_id', this.userId).maybeSingle(),
    ]);
    for (const r of [l, w, a, s]) if (r.error) throw new Error(r.error.message);
    const store = useStore.getState();
    const merge = <T extends { id: string; updatedAt: number }>(local: T[], remote: Array<{ id: string; data: T; updated_at: string }>): T[] => {
      const map = new Map(local.map((x) => [x.id, x]));
      for (const row of remote) {
        const cur = map.get(row.id);
        const remoteUpdated = Math.max(row.data.updatedAt ?? 0, Date.parse(row.updated_at));
        if (!cur || remoteUpdated >= cur.updatedAt) map.set(row.id, { ...row.data, updatedAt: remoteUpdated });
      }
      return [...map.values()];
    };
    const layouts = merge(store.layouts, (l.data ?? []) as Array<{ id: string; data: Layout; updated_at: string }>);
    const watchlists = merge(store.watchlists, (w.data ?? []) as Array<{ id: string; data: Watchlist; updated_at: string }>);
    const alerts = merge(store.alerts, (a.data ?? []) as Array<{ id: string; data: PriceAlert; updated_at: string }>);
    const remoteSettings = s.data?.data as UserSettings | undefined;
    const settings = remoteSettings && remoteSettings.updatedAt >= store.settings.updatedAt ? remoteSettings : undefined;
    store.applyRemote({ layouts, watchlists, alerts, settings });
  }

  private async pushAll(): Promise<void> {
    if (!supabase || !this.userId) return;
    const store = useStore.getState();
    if (store.revision === this.lastPushedRevision) return;
    const rev = store.revision;
    store.setSync({ status: 'syncing' });
    const uid = this.userId;
    const rows = (table: Table, items: Array<{ id: string; updatedAt: number }>) =>
      supabase!.from(table).upsert(items.map((x) => ({ id: x.id, user_id: uid, data: x, updated_at: new Date(x.updatedAt || Date.now()).toISOString() })), { onConflict: 'id' });
    const results = await Promise.all([
      rows('layouts', store.layouts),
      rows('watchlists', store.watchlists),
      rows('alerts', store.alerts),
      supabase.from('settings').upsert({ user_id: uid, data: store.settings, updated_at: new Date(store.settings.updatedAt || Date.now()).toISOString() }, { onConflict: 'user_id' }),
    ]);
    const err = results.find((r) => r.error)?.error;
    if (err) {
      store.setSync({ status: 'error', message: err.message });
      return;
    }
    // Delete rows that no longer exist locally.
    await Promise.all([
      this.deleteMissing('layouts', store.layouts.map((x) => x.id)),
      this.deleteMissing('watchlists', store.watchlists.map((x) => x.id)),
      this.deleteMissing('alerts', store.alerts.map((x) => x.id)),
    ]);
    this.lastPushedRevision = rev;
    store.setSync({ status: 'synced', lastSyncAt: Date.now(), message: undefined });
  }

  private async deleteMissing(table: Table, keep: string[]): Promise<void> {
    if (!supabase || !this.userId) return;
    const q = supabase.from(table).delete().eq('user_id', this.userId);
    if (keep.length) await q.not('id', 'in', `(${keep.map((k) => `"${k}"`).join(',')})`);
    else await q;
  }

  private subscribeRealtime(): void {
    if (!supabase || !this.userId) return;
    this.channel = supabase
      .channel(`user-sync-${this.userId}`)
      .on('postgres_changes', { event: '*', schema: 'public', filter: `user_id=eq.${this.userId}` }, () => {
        // Another device wrote: pull and merge (debounced).
        if (this.pushTimer) clearTimeout(this.pushTimer);
        setTimeout(() => void this.pullAll().then(() => useStore.getState().setSync({ status: 'synced', lastSyncAt: Date.now() })), 300);
      })
      .subscribe();
  }
}

export const syncService = new SyncService();
