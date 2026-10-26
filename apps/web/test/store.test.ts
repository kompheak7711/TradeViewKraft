import { beforeEach, describe, expect, it } from 'vitest';
import { useStore } from '../src/state/store';

describe('app store', () => {
  beforeEach(() => {
    useStore.persist?.clearStorage?.();
  });
  it('changes symbol on the active chart only and resets drawings', () => {
    const s = useStore.getState();
    s.setGrid('2h');
    const [a, b] = useStore.getState().activeLayout().charts;
    s.addDrawing(a!.id, { id: 'd1', type: 'hline', points: [{ time: 1, price: 2 }], color: '#fff' });
    s.setSymbol('NASDAQ:AAPL');
    const l = useStore.getState().activeLayout();
    expect(l.charts[0]!.symbol).toBe('NASDAQ:AAPL');
    expect(l.charts[0]!.drawings).toHaveLength(0);
    expect(l.charts[1]!.symbol).toBe(b!.symbol);
  });
  it('grid changes keep existing charts and add defaults', () => {
    const s = useStore.getState();
    s.setGrid('4');
    expect(useStore.getState().activeLayout().charts).toHaveLength(4);
    s.setGrid('1');
    expect(useStore.getState().activeLayout().charts).toHaveLength(1);
  });
  it('saves, loads and deletes layouts', () => {
    const s = useStore.getState();
    const before = useStore.getState().layouts.length;
    s.setTimeframe('1D');
    s.saveLayoutAs('Daily');
    const saved = useStore.getState().layouts.find((l) => l.name === 'Daily')!;
    expect(useStore.getState().layouts).toHaveLength(before + 1);
    expect(useStore.getState().activeLayoutId).toBe(saved.id);
    s.loadLayout(useStore.getState().layouts[0]!.id);
    expect(useStore.getState().activeLayoutId).not.toBe(saved.id);
    s.deleteLayout(saved.id);
    expect(useStore.getState().layouts.find((l) => l.id === saved.id)).toBeUndefined();
  });
  it('watchlist add is idempotent and alerts toggle', () => {
    const s = useStore.getState();
    s.addToWatchlist('METALS:XAGUSD');
    s.addToWatchlist('METALS:XAGUSD');
    const items = useStore.getState().activeWatchlist().items.filter((i) => i.symbol === 'METALS:XAGUSD');
    expect(items).toHaveLength(1);
    s.upsertAlert({ id: 'x', symbol: 'METALS:XAGUSD', condition: 'greater', price: 1, enabled: true, frequency: 'once', createdAt: 0, updatedAt: 0 });
    s.markAlertTriggered('x', 123);
    const a = useStore.getState().alerts.find((x) => x.id === 'x')!;
    expect(a.enabled).toBe(false);
    expect(a.triggeredAt).toBe(123);
  });
  it('bumps revision on persisted changes but not on remote apply', () => {
    const s = useStore.getState();
    const r0 = useStore.getState().revision;
    s.updateSettings({ theme: 'light' });
    expect(useStore.getState().revision).toBe(r0 + 1);
    s.applyRemote({ alerts: [] });
    expect(useStore.getState().revision).toBe(r0 + 1);
  });
});
