import { useCallback, useEffect, useMemo, useState } from 'react';
import type { Candle, ChartState, ChartType, Drawing, Timeframe } from '@tvk/shared-types';
import { INDICATOR_DEFINITIONS, QUICK_TIMEFRAMES, TIMEFRAME_GROUPS, type IndicatorOutput } from '@tvk/chart-core';
import { formatPrice, inferPrecision, exchangeOf, tickerOf } from '@tvk/market-data';
import { IconArea, IconBars, IconBell, IconCandles, IconChevronDown, IconClose, IconEye, IconEyeOff, IconIndicator, IconLine, IconLog, IconRefresh, IconSearch, Spinner } from '@tvk/ui';
import { useChartFeed } from '../data/use-chart-feed';
import { useStore } from '../state/store';
import { ChartView } from '../chart/ChartView';
import { useQuotes } from '../data/quotes';

const CHART_TYPES: Array<{ value: ChartType; label: string; icon: React.ReactNode }> = [
  { value: 'candles', label: 'Candles', icon: <IconCandles /> },
  { value: 'bars', label: 'Bars', icon: <IconBars /> },
  { value: 'line', label: 'Line', icon: <IconLine /> },
  { value: 'area', label: 'Area', icon: <IconArea /> },
  { value: 'heikinashi', label: 'Heikin Ashi', icon: <IconCandles /> },
];

export function ChartPanel({ chart, active, compact, theme, onActivate }: { chart: ChartState; active: boolean; compact: boolean; theme: 'dark' | 'light'; onActivate: () => void }) {
  const { snapshot, feed } = useChartFeed(chart.symbol, chart.timeframe);
  const store = useStore();
  const allAlerts = useStore((s) => s.alerts);
  const alerts = useMemo(() => allAlerts.filter((a) => a.symbol === chart.symbol), [allAlerts, chart.symbol]);
  const ui = useStore((s) => s.ui);
  const [hover, setHover] = useState<{ candle: Candle | null; values: Record<string, number[]> }>({ candle: null, values: {} });
  const [outputs, setOutputs] = useState<IndicatorOutput[]>([]);
  const [tfMenu, setTfMenu] = useState(false);
  const [typeMenu, setTypeMenu] = useState(false);
  const precision = snapshot.info?.pricePrecision ?? inferPrecision(snapshot.candles[snapshot.candles.length - 1]?.close ?? 1);
  const last = snapshot.candles[snapshot.candles.length - 1] ?? null;
  const shown = hover.candle ?? last;
  const prev = useMemo(() => {
    if (!shown) return null;
    const i = snapshot.candles.findIndex((c) => c.time === shown.time);
    return i > 0 ? snapshot.candles[i - 1]! : null;
  }, [shown, snapshot.candles]);
  const change = shown && prev ? shown.close - prev.close : shown ? shown.close - shown.open : 0;
  const changePct = shown && prev && prev.close ? (change / prev.close) * 100 : shown && shown.open ? (change / shown.open) * 100 : 0;

  // Push the live price into the shared quote store so the watchlist and header agree.
  useEffect(() => {
    if (snapshot.lastUpdate) useQuotes.getState().set(chart.symbol, { price: snapshot.lastUpdate.close, time: Date.now() });
  }, [snapshot.lastUpdate, chart.symbol]);

  const onHover = useCallback((candle: Candle | null, values: Record<string, number[]>) => setHover({ candle, values }), []);
  const onLoadMore = useCallback(() => void feed?.loadMore(), [feed]);
  const onAddDrawing = useCallback((d: Drawing) => store.addDrawing(chart.id, d), [store, chart.id]);
  const onUpdateDrawing = useCallback((d: Drawing) => store.updateDrawing(chart.id, d), [store, chart.id]);
  const onRemoveDrawing = useCallback((id: string) => store.removeDrawing(chart.id, id), [store, chart.id]);
  const onSelectDrawing = useCallback((id: string | null) => store.setUi({ selectedDrawingId: id }), [store]);
  const onToolDone = useCallback(() => store.setUi({ activeTool: null }), [store]);
  const onOutputs = useCallback((o: IndicatorOutput[]) => setOutputs(o), []);

  const closeMenus = () => {
    setTfMenu(false);
    setTypeMenu(false);
  };
  const feedStatus = snapshot.feed.status;
  const sessionClosed = snapshot.session && snapshot.session.state !== 'open' && snapshot.session.state !== 'always';
  const statusLabel = snapshot.error && snapshot.candles.length === 0 ? 'error' : feedStatus === 'live' && sessionClosed ? 'closed' : feedStatus;
  const statusText = statusLabel === 'closed' ? (snapshot.session?.label ?? 'Market closed') : STATUS_TEXT[statusLabel] ?? statusLabel;

  return (
    <section className={`chart-panel${active ? ' active' : ''}`} onPointerDownCapture={onActivate} data-testid="chart-panel" data-active={active} aria-label={`Chart ${chart.symbol}`}>
      <div className={`chart-toolbar${compact ? ' compact' : ''}`} onClick={closeMenus}>
        <button className="btn ghost symbol-btn" data-testid="symbol-button" onClick={(e) => { e.stopPropagation(); store.setActiveChart(chart.id); store.openSheet('symbol', { symbolTarget: 'chart' }); }} title="Change symbol (/)">
          <IconSearch size={16} />
          <span className="symbol-name">{tickerOf(chart.symbol)}</span>
          <span className="muted symbol-ex">{exchangeOf(chart.symbol)}</span>
        </button>
        <div className="tf-quick" role="group" aria-label="Timeframe">
          {(compact ? QUICK_TIMEFRAMES.slice(0, 5) : QUICK_TIMEFRAMES).map((tf) => (
            <button key={tf} className={`btn ghost sm${chart.timeframe === tf ? ' active' : ''}`} data-testid={`tf-${tf}`} onClick={() => store.setTimeframe(tf, chart.id)}>{tf}</button>
          ))}
          <div className="menu-anchor">
            <button className={`btn ghost sm${!QUICK_TIMEFRAMES.includes(chart.timeframe) ? ' active' : ''}`} data-testid="tf-more" aria-label="More timeframes" onClick={(e) => { e.stopPropagation(); setTfMenu((v) => !v); setTypeMenu(false); }} aria-haspopup="menu" aria-expanded={tfMenu}>
              {QUICK_TIMEFRAMES.includes(chart.timeframe) ? <IconChevronDown size={14} /> : chart.timeframe}
            </button>
            {tfMenu && (
              <div className="menu" role="menu">
                {TIMEFRAME_GROUPS.map((g) => (
                  <div key={g.label} className="menu-group">
                    <div className="menu-title">{g.label}</div>
                    {g.items.map((tf) => (
                      <button key={tf} role="menuitem" className={`menu-item${chart.timeframe === tf ? ' active' : ''}`} data-testid={`tf-menu-${tf}`} onClick={() => { store.setTimeframe(tf as Timeframe, chart.id); closeMenus(); }}>{tf}</button>
                    ))}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
        <div className="menu-anchor">
          <button className="btn ghost sm icon" data-testid="chart-type" onClick={(e) => { e.stopPropagation(); setTypeMenu((v) => !v); setTfMenu(false); }} title="Chart type" aria-haspopup="menu" aria-expanded={typeMenu}>
            {CHART_TYPES.find((t) => t.value === chart.chartType)?.icon}
          </button>
          {typeMenu && (
            <div className="menu" role="menu">
              {CHART_TYPES.map((t) => (
                <button key={t.value} role="menuitem" className={`menu-item${chart.chartType === t.value ? ' active' : ''}`} data-testid={`chart-type-${t.value}`} onClick={() => { store.setChartType(t.value, chart.id); closeMenus(); }}>{t.icon}<span>{t.label}</span></button>
              ))}
            </div>
          )}
        </div>
        <button className="btn ghost sm" data-testid="indicators-button" onClick={(e) => { e.stopPropagation(); store.setActiveChart(chart.id); store.openSheet('indicators'); }} title="Indicators"><IconIndicator size={16} />{!compact && <span>Indicators</span>}</button>
        <button className={`btn ghost sm icon${chart.logScale ? ' active' : ''}`} data-testid="log-toggle" onClick={() => store.toggleLog(chart.id)} title="Logarithmic scale" aria-pressed={chart.logScale}><IconLog size={16} /></button>
        <button className="btn ghost sm icon" data-testid="alert-button" onClick={(e) => { e.stopPropagation(); store.openSheet('alert', { alertDraft: { symbol: chart.symbol, price: last?.close } }); }} title="Create alert"><IconBell size={16} /></button>
        <div className="grow" />
        <span className={`badge ${statusLabel}`} data-testid="feed-status" data-status={statusLabel} title={snapshot.feed.message ?? snapshot.info?.dataNote ?? ''}>
          <span className="dot" />{statusText}
        </span>
      </div>

      <div className="chart-legend" data-testid="legend">
        <div className="legend-row">
          <span className="legend-symbol">{snapshot.info?.description ?? chart.symbol}</span>
          <span className="muted"> · {chart.timeframe} · {exchangeOf(chart.symbol)}</span>
          {shown && (
            <span className="legend-ohlc num">
              <span>O <b>{formatPrice(shown.open, precision)}</b></span>
              <span>H <b>{formatPrice(shown.high, precision)}</b></span>
              <span>L <b>{formatPrice(shown.low, precision)}</b></span>
              <span>C <b className={change >= 0 ? 'up' : 'down'}>{formatPrice(shown.close, precision)}</b></span>
              <span className={change >= 0 ? 'up' : 'down'}>{change >= 0 ? '+' : ''}{formatPrice(change, precision)} ({changePct >= 0 ? '+' : ''}{changePct.toFixed(2)}%)</span>
            </span>
          )}
        </div>
        {chart.indicators.map((ind) => {
          const out = outputs.find((o) => o.id === ind.id);
          const vals = hover.values[ind.id] ?? out?.lines.map((l) => l.values[l.values.length - 1] ?? NaN) ?? [];
          return (
            <div key={ind.id} className="legend-row indicator" data-testid="legend-indicator">
              <span>{INDICATOR_DEFINITIONS[ind.type].name}{Object.keys(ind.params).length ? ` (${Object.values(ind.params).join(', ')})` : ''}</span>
              <span className="num muted">{out?.lines.map((l, i) => <span key={l.key} style={{ color: l.color }}> {Number.isFinite(vals[i]) ? fmtVal(vals[i]!, ind.type === 'volume' ? 0 : ind.type === 'rsi' ? 2 : precision) : '—'}</span>)}</span>
              <button className="btn ghost sm icon legend-btn" onClick={() => store.updateIndicator(chart.id, ind.id, { visible: !ind.visible })} title={ind.visible ? 'Hide' : 'Show'}>{ind.visible ? <IconEye size={14} /> : <IconEyeOff size={14} />}</button>
              <button className="btn ghost sm icon legend-btn" data-testid="remove-indicator" onClick={() => store.removeIndicator(chart.id, ind.id)} title="Remove"><IconClose size={14} /></button>
            </div>
          );
        })}
        {snapshot.info?.dataNote && <div className="legend-row muted small">{snapshot.info.dataNote}{snapshot.feed.message && snapshot.feed.status !== 'live' ? ` · ${snapshot.feed.message}` : ''}</div>}
      </div>

      <div className="chart-area">
        <ChartView
          chart={chart}
          snapshot={snapshot}
          theme={theme}
          precision={precision}
          alerts={alerts}
          activeTool={active ? ui.activeTool : null}
          selectedDrawingId={active ? ui.selectedDrawingId : null}
          onLoadMore={onLoadMore}
          onHover={onHover}
          onAddDrawing={onAddDrawing}
          onUpdateDrawing={onUpdateDrawing}
          onRemoveDrawing={onRemoveDrawing}
          onSelectDrawing={onSelectDrawing}
          onToolDone={onToolDone}
          onIndicatorOutputs={onOutputs}
        />
        {snapshot.loading && (
          <div className="chart-state" data-testid="chart-loading"><Spinner label="Loading chart…" /></div>
        )}
        {!snapshot.loading && snapshot.error && snapshot.candles.length === 0 && (
          <div className="chart-state error" data-testid="chart-error">
            <div style={{ fontWeight: 600 }}>Could not load {chart.symbol}</div>
            <div className="muted" style={{ maxWidth: 360 }}>{snapshot.error}</div>
            <div className="row" style={{ marginTop: 8 }}>
              <button className="btn" onClick={() => void feed?.retry()}><IconRefresh size={16} /> Retry</button>
              <button className="btn ghost" onClick={() => store.openSheet('symbol')}>Change symbol</button>
            </div>
          </div>
        )}
        {snapshot.loadingMore && <div className="chart-loading-more"><div className="spinner" /></div>}
        {!snapshot.loading && snapshot.feed.status === 'disconnected' && snapshot.candles.length > 0 && (
          <div className="chart-banner warn" data-testid="disconnected-banner">Disconnected from {snapshot.feed.provider.toUpperCase()} — reconnecting…</div>
        )}
        {!snapshot.loading && snapshot.feed.status === 'limited' && (
          <div className="chart-banner info">{snapshot.feed.message ?? 'Data source limit reached'}</div>
        )}
        {!snapshot.loading && snapshot.feed.status === 'error' && snapshot.candles.length > 0 && (
          <div className="chart-banner warn">{snapshot.feed.message ?? 'Live data unavailable'}</div>
        )}
      </div>
    </section>
  );
}

const STATUS_TEXT: Record<string, string> = { idle: 'Idle', connecting: 'Connecting', live: 'Live', stale: 'Stale', disconnected: 'Disconnected', error: 'Error', limited: 'Limited', closed: 'Closed' };

function fmtVal(v: number, precision: number): string {
  if (Math.abs(v) >= 1e6) return (v / 1e6).toFixed(2) + 'M';
  if (Math.abs(v) >= 1e4 && precision === 0) return (v / 1e3).toFixed(1) + 'K';
  return v.toFixed(precision);
}
