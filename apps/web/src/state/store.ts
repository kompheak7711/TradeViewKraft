import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import type { ChartState, ChartType, Drawing, DrawingType, IndicatorConfig, Layout, LayoutGrid, PriceAlert, SymbolId, Timeframe, UserSettings, Watchlist } from '@tvk/shared-types';
import { createIndicatorConfig } from '@tvk/chart-core';
import { uid } from '../lib/ids';

export type SidebarTab = 'watchlist' | 'alerts';
export type Sheet = 'settings' | 'auth' | 'layouts' | 'alert' | 'indicators' | 'symbol' | 'drawings' | null;

export interface Toast { id: string; title: string; body?: string; kind: 'info' | 'success' | 'warn' | 'error'; createdAt: number }

export interface UiState {
  sidebarOpen: boolean;
  sidebarTab: SidebarTab;
  sheet: Sheet;
  /** When the symbol sheet is opened for a specific purpose (e.g. adding to the watchlist). */
  symbolSheetTarget: 'chart' | 'watchlist' | 'alert';
  activeTool: DrawingType | null;
  selectedDrawingId: string | null;
  toasts: Toast[];
  /** Alert prefill when opening the alert sheet from a chart. */
  alertDraft: { symbol: SymbolId; price?: number; editId?: string } | null;
}

export interface SyncState {
  userEmail: string | null;
  status: 'local' | 'signing-in' | 'synced' | 'syncing' | 'error';
  lastSyncAt?: number;
  message?: string;
}

export interface AppState {
  layouts: Layout[];
  activeLayoutId: string;
  watchlists: Watchlist[];
  activeWatchlistId: string;
  alerts: PriceAlert[];
  settings: UserSettings;
  ui: UiState;
  sync: SyncState;
  /** Monotonic counter bumped on every persisted change; the sync layer watches it. */
  revision: number;

  // layout + charts
  activeLayout(): Layout;
  activeChart(): ChartState;
  setActiveChart(chartId: string): void;
  setGrid(grid: LayoutGrid): void;
  updateChart(chartId: string, patch: Partial<ChartState>): void;
  setSymbol(symbol: SymbolId, chartId?: string): void;
  setTimeframe(tf: Timeframe, chartId?: string): void;
  setChartType(t: ChartType, chartId?: string): void;
  toggleLog(chartId?: string): void;
  addIndicator(type: IndicatorConfig['type'], chartId?: string): void;
  updateIndicator(chartId: string, id: string, patch: Partial<IndicatorConfig>): void;
  removeIndicator(chartId: string, id: string): void;
  addDrawing(chartId: string, d: Drawing): void;
  updateDrawing(chartId: string, d: Drawing): void;
  removeDrawing(chartId: string, id: string): void;
  clearDrawings(chartId: string): void;
  saveLayoutAs(name: string): void;
  renameLayout(id: string, name: string): void;
  loadLayout(id: string): void;
  deleteLayout(id: string): void;

  // watchlists
  activeWatchlist(): Watchlist;
  addToWatchlist(symbol: SymbolId, watchlistId?: string): void;
  removeFromWatchlist(symbol: SymbolId, watchlistId?: string): void;
  createWatchlist(name: string): void;
  renameWatchlist(id: string, name: string): void;
  deleteWatchlist(id: string): void;
  setActiveWatchlist(id: string): void;

  // alerts
  upsertAlert(a: PriceAlert): void;
  removeAlert(id: string): void;
  toggleAlert(id: string, enabled: boolean): void;
  markAlertTriggered(id: string, at: number): void;

  // settings
  updateSettings(patch: Partial<UserSettings>): void;

  // ui
  setUi(patch: Partial<UiState>): void;
  openSheet(sheet: Sheet, opts?: { symbolTarget?: UiState['symbolSheetTarget']; alertDraft?: UiState['alertDraft'] }): void;
  closeSheet(): void;
  pushToast(t: Omit<Toast, 'id' | 'createdAt'>): void;
  dismissToast(id: string): void;
  setSync(patch: Partial<SyncState>): void;

  /** Replace synced collections from the server (used by the sync layer). */
  applyRemote(data: Partial<Pick<AppState, 'layouts' | 'watchlists' | 'alerts' | 'settings'>>): void;
}

export function defaultChart(symbol: SymbolId = 'BINANCE:BTCUSDT', timeframe: Timeframe = '1h'): ChartState {
  return { id: uid('c'), symbol, timeframe, chartType: 'candles', logScale: false, indicators: [createIndicatorConfig('volume')], drawings: [] };
}

export function defaultLayout(): Layout {
  const c = defaultChart();
  return { id: uid('l'), name: 'Default', grid: '1', charts: [c], activeChartId: c.id, updatedAt: Date.now() };
}

const DEFAULT_SETTINGS: UserSettings = { theme: 'dark', defaultTimeframe: '1h', defaultChartType: 'candles', notificationsEnabled: false, soundEnabled: true, updatedAt: 0 };

function defaultWatchlist(): Watchlist {
  return {
    id: uid('w'),
    name: 'My list',
    items: [
      { symbol: 'BINANCE:BTCUSDT' }, { symbol: 'BINANCE:ETHUSDT' }, { symbol: 'COINBASE:SOLUSD' },
      { symbol: 'NASDAQ:AAPL' }, { symbol: 'NASDAQ:NVDA' }, { symbol: 'AMEX:SPY' },
      { symbol: 'METALS:XAUUSD' }, { symbol: 'METALS:XAGUSD' },
    ],
    updatedAt: Date.now(),
  };
}

const GRID_COUNT: Record<LayoutGrid, number> = { '1': 1, '2h': 2, '2v': 2, '4': 4 };

export const useStore = create<AppState>()(
  persist(
    (set, get) => {
      const touch = <T extends Partial<AppState>>(patch: T): T & { revision: number } => ({ ...patch, revision: get().revision + 1 });
      const updateLayout = (fn: (l: Layout) => Layout) =>
        set((s) => touch({ layouts: s.layouts.map((l) => (l.id === s.activeLayoutId ? { ...fn(l), updatedAt: Date.now() } : l)) }));
      const updateChartIn = (chartId: string | undefined, fn: (c: ChartState) => ChartState) =>
        updateLayout((l) => {
          const id = chartId ?? l.activeChartId;
          return { ...l, charts: l.charts.map((c) => (c.id === id ? fn(c) : c)) };
        });
      const initialLayout = defaultLayout();
      const initialWatchlist = defaultWatchlist();
      return {
        layouts: [initialLayout],
        activeLayoutId: initialLayout.id,
        watchlists: [initialWatchlist],
        activeWatchlistId: initialWatchlist.id,
        alerts: [],
        settings: DEFAULT_SETTINGS,
        ui: { sidebarOpen: true, sidebarTab: 'watchlist', sheet: null, symbolSheetTarget: 'chart', activeTool: null, selectedDrawingId: null, toasts: [], alertDraft: null },
        sync: { userEmail: null, status: 'local' },
        revision: 0,

        activeLayout: () => {
          const s = get();
          return s.layouts.find((l) => l.id === s.activeLayoutId) ?? s.layouts[0]!;
        },
        activeChart: () => {
          const l = get().activeLayout();
          return l.charts.find((c) => c.id === l.activeChartId) ?? l.charts[0]!;
        },
        setActiveChart: (chartId) => updateLayout((l) => (l.charts.some((c) => c.id === chartId) ? { ...l, activeChartId: chartId } : l)),
        setGrid: (grid) =>
          updateLayout((l) => {
            const n = GRID_COUNT[grid];
            const charts = l.charts.slice(0, n);
            const fallbacks: SymbolId[] = ['BINANCE:ETHUSDT', 'NASDAQ:AAPL', 'METALS:XAUUSD', 'COINBASE:SOLUSD'];
            while (charts.length < n) charts.push(defaultChart(fallbacks[charts.length - 1] ?? 'BINANCE:BTCUSDT', get().settings.defaultTimeframe));
            const activeChartId = charts.some((c) => c.id === l.activeChartId) ? l.activeChartId : charts[0]!.id;
            return { ...l, grid, charts, activeChartId };
          }),
        updateChart: (chartId, patch) => updateChartIn(chartId, (c) => ({ ...c, ...patch })),
        setSymbol: (symbol, chartId) => updateChartIn(chartId, (c) => (c.symbol === symbol ? c : { ...c, symbol, drawings: [] })),
        setTimeframe: (timeframe, chartId) => updateChartIn(chartId, (c) => ({ ...c, timeframe })),
        setChartType: (chartType, chartId) => updateChartIn(chartId, (c) => ({ ...c, chartType })),
        toggleLog: (chartId) => updateChartIn(chartId, (c) => ({ ...c, logScale: !c.logScale })),
        addIndicator: (type, chartId) => updateChartIn(chartId, (c) => ({ ...c, indicators: [...c.indicators, createIndicatorConfig(type)] })),
        updateIndicator: (chartId, id, patch) => updateChartIn(chartId, (c) => ({ ...c, indicators: c.indicators.map((i) => (i.id === id ? { ...i, ...patch, params: { ...i.params, ...(patch.params ?? {}) } } : i)) })),
        removeIndicator: (chartId, id) => updateChartIn(chartId, (c) => ({ ...c, indicators: c.indicators.filter((i) => i.id !== id) })),
        addDrawing: (chartId, d) => updateChartIn(chartId, (c) => ({ ...c, drawings: [...c.drawings, d] })),
        updateDrawing: (chartId, d) => updateChartIn(chartId, (c) => ({ ...c, drawings: c.drawings.map((x) => (x.id === d.id ? d : x)) })),
        removeDrawing: (chartId, id) => updateChartIn(chartId, (c) => ({ ...c, drawings: c.drawings.filter((x) => x.id !== id) })),
        clearDrawings: (chartId) => updateChartIn(chartId, (c) => ({ ...c, drawings: [] })),
        saveLayoutAs: (name) =>
          set((s) => {
            const cur = s.activeLayout();
            const copy: Layout = { ...structuredClone(cur), id: uid('l'), name, updatedAt: Date.now() };
            return touch({ layouts: [...s.layouts, copy], activeLayoutId: copy.id });
          }),
        renameLayout: (id, name) => set((s) => touch({ layouts: s.layouts.map((l) => (l.id === id ? { ...l, name, updatedAt: Date.now() } : l)) })),
        loadLayout: (id) => set((s) => (s.layouts.some((l) => l.id === id) ? touch({ activeLayoutId: id }) : {})),
        deleteLayout: (id) =>
          set((s) => {
            if (s.layouts.length <= 1) return {};
            const layouts = s.layouts.filter((l) => l.id !== id);
            return touch({ layouts, activeLayoutId: s.activeLayoutId === id ? layouts[0]!.id : s.activeLayoutId });
          }),

        activeWatchlist: () => {
          const s = get();
          return s.watchlists.find((w) => w.id === s.activeWatchlistId) ?? s.watchlists[0]!;
        },
        addToWatchlist: (symbol, watchlistId) =>
          set((s) => {
            const id = watchlistId ?? s.activeWatchlistId;
            return touch({ watchlists: s.watchlists.map((w) => (w.id === id && !w.items.some((i) => i.symbol === symbol) ? { ...w, items: [...w.items, { symbol }], updatedAt: Date.now() } : w)) });
          }),
        removeFromWatchlist: (symbol, watchlistId) =>
          set((s) => {
            const id = watchlistId ?? s.activeWatchlistId;
            return touch({ watchlists: s.watchlists.map((w) => (w.id === id ? { ...w, items: w.items.filter((i) => i.symbol !== symbol), updatedAt: Date.now() } : w)) });
          }),
        createWatchlist: (name) =>
          set((s) => {
            const w: Watchlist = { id: uid('w'), name, items: [], updatedAt: Date.now() };
            return touch({ watchlists: [...s.watchlists, w], activeWatchlistId: w.id });
          }),
        renameWatchlist: (id, name) => set((s) => touch({ watchlists: s.watchlists.map((w) => (w.id === id ? { ...w, name, updatedAt: Date.now() } : w)) })),
        deleteWatchlist: (id) =>
          set((s) => {
            if (s.watchlists.length <= 1) return {};
            const watchlists = s.watchlists.filter((w) => w.id !== id);
            return touch({ watchlists, activeWatchlistId: s.activeWatchlistId === id ? watchlists[0]!.id : s.activeWatchlistId });
          }),
        setActiveWatchlist: (id) => set(() => touch({ activeWatchlistId: id })),

        upsertAlert: (a) =>
          set((s) => {
            const next = { ...a, updatedAt: Date.now() };
            const exists = s.alerts.some((x) => x.id === a.id);
            return touch({ alerts: exists ? s.alerts.map((x) => (x.id === a.id ? next : x)) : [...s.alerts, next] });
          }),
        removeAlert: (id) => set((s) => touch({ alerts: s.alerts.filter((a) => a.id !== id) })),
        toggleAlert: (id, enabled) => set((s) => touch({ alerts: s.alerts.map((a) => (a.id === id ? { ...a, enabled, updatedAt: Date.now() } : a)) })),
        markAlertTriggered: (id, at) =>
          set((s) => touch({ alerts: s.alerts.map((a) => (a.id === id ? { ...a, triggeredAt: at, enabled: a.frequency === 'every', updatedAt: Date.now() } : a)) })),

        updateSettings: (patch) => set((s) => touch({ settings: { ...s.settings, ...patch, updatedAt: Date.now() } })),

        setUi: (patch) => set((s) => ({ ui: { ...s.ui, ...patch } })),
        openSheet: (sheet, opts) => set((s) => ({ ui: { ...s.ui, sheet, symbolSheetTarget: opts?.symbolTarget ?? 'chart', alertDraft: opts?.alertDraft ?? null } })),
        closeSheet: () => set((s) => ({ ui: { ...s.ui, sheet: null, alertDraft: null } })),
        pushToast: (t) => {
          const toast: Toast = { ...t, id: uid('t'), createdAt: Date.now() };
          set((s) => ({ ui: { ...s.ui, toasts: [...s.ui.toasts.slice(-4), toast] } }));
          setTimeout(() => get().dismissToast(toast.id), t.kind === 'error' ? 9000 : 5000);
        },
        dismissToast: (id) => set((s) => ({ ui: { ...s.ui, toasts: s.ui.toasts.filter((t) => t.id !== id) } })),
        setSync: (patch) => set((s) => ({ sync: { ...s.sync, ...patch } })),

        applyRemote: (data) =>
          set((s) => {
            const next: Partial<AppState> = {};
            if (data.layouts?.length) {
              next.layouts = data.layouts;
              next.activeLayoutId = data.layouts.some((l) => l.id === s.activeLayoutId) ? s.activeLayoutId : data.layouts[0]!.id;
            }
            if (data.watchlists?.length) {
              next.watchlists = data.watchlists;
              next.activeWatchlistId = data.watchlists.some((w) => w.id === s.activeWatchlistId) ? s.activeWatchlistId : data.watchlists[0]!.id;
            }
            if (data.alerts) next.alerts = data.alerts;
            if (data.settings) next.settings = data.settings;
            return next; // no revision bump: remote data must not be echoed back
          }),
      };
    },
    {
      name: 'tvk-state-v1',
      storage: createJSONStorage(() => (typeof localStorage !== 'undefined' ? localStorage : memoryStorage())),
      partialize: (s) => ({ layouts: s.layouts, activeLayoutId: s.activeLayoutId, watchlists: s.watchlists, activeWatchlistId: s.activeWatchlistId, alerts: s.alerts, settings: s.settings, revision: s.revision, ui: { sidebarOpen: s.ui.sidebarOpen, sidebarTab: s.ui.sidebarTab } }),
      merge: (persisted, current) => {
        const p = (persisted ?? {}) as Partial<AppState>;
        return { ...current, ...p, ui: { ...current.ui, ...(p.ui ?? {}) }, sync: current.sync };
      },
      version: 1,
    },
  ),
);

function memoryStorage(): Storage {
  const m = new Map<string, string>();
  return {
    get length() { return m.size; },
    clear: () => m.clear(),
    getItem: (k) => m.get(k) ?? null,
    key: (i) => [...m.keys()][i] ?? null,
    removeItem: (k) => void m.delete(k),
    setItem: (k, v) => void m.set(k, v),
  };
}
