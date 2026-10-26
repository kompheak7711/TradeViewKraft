import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import {
  AreaSeries, BarSeries, CandlestickSeries, ColorType, CrosshairMode, HistogramSeries, LineSeries, LineStyle, PriceScaleMode, createChart,
  type IChartApi, type ISeriesApi, type IPriceLine, type SeriesType, type UTCTimestamp, type LogicalRange,
} from 'lightweight-charts';
import type { Candle, ChartState, Drawing, DrawingType, PriceAlert } from '@tvk/shared-types';
import { computeIndicator, type IndicatorOutput } from '@tvk/chart-core';
import { chartPalette } from '@tvk/ui';
import type { ChartFeedSnapshot } from '../data/chart-feed';
import { asTime, lastSeriesPoint, toSeriesData } from './series-data';
import { DrawingOverlay } from './DrawingOverlay';

export interface ChartViewProps {
  chart: ChartState;
  snapshot: ChartFeedSnapshot;
  theme: 'dark' | 'light';
  precision: number;
  alerts: PriceAlert[];
  activeTool: DrawingType | null;
  selectedDrawingId: string | null;
  onLoadMore: () => void;
  onHover: (candle: Candle | null, indicatorValues: Record<string, number[]>) => void;
  onAddDrawing: (d: Drawing) => void;
  onUpdateDrawing: (d: Drawing) => void;
  onRemoveDrawing: (id: string) => void;
  onSelectDrawing: (id: string | null) => void;
  onToolDone: () => void;
  onIndicatorOutputs?: (outputs: IndicatorOutput[]) => void;
  onAlertFromPrice?: (price: number) => void;
}

type AnySeries = ISeriesApi<SeriesType>;
interface IndicatorSeriesSet { pane: number; series: Array<{ api: AnySeries; key: string }>; configKey: string }

function seriesDefinition(type: ChartState['chartType']) {
  switch (type) {
    case 'bars': return BarSeries;
    case 'line': return LineSeries;
    case 'area': return AreaSeries;
    default: return CandlestickSeries;
  }
}

/** Lightweight Charts wrapper: main series, indicator panes, alert price lines and the drawing overlay. */
export function ChartView(props: ChartViewProps) {
  const { chart: cs, snapshot, theme, precision, alerts, onLoadMore } = props;
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const mainRef = useRef<AnySeries | null>(null);
  const mainTypeRef = useRef<ChartState['chartType'] | null>(null);
  const indicatorsRef = useRef<Map<string, IndicatorSeriesSet>>(new Map());
  const priceLinesRef = useRef<IPriceLine[]>([]);
  const lastHistoryVersion = useRef(-1);
  const appliedKey = useRef('');
  const lastCandleCount = useRef(0);
  const firstTimeRef = useRef<number | null>(null);
  const loadMoreGate = useRef(0);
  const [ready, setReady] = useState(false);
  const outputsRef = useRef<IndicatorOutput[]>([]);
  const hoverRef = useRef(props.onHover);
  hoverRef.current = props.onHover;
  const loadMoreRef = useRef(onLoadMore);
  loadMoreRef.current = onLoadMore;

  // ---- create chart once ----
  useLayoutEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const p = chartPalette();
    const chart = createChart(el, {
      autoSize: true,
      layout: { background: { type: ColorType.Solid, color: p.bg }, textColor: p.text, fontFamily: 'Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif', fontSize: 11, attributionLogo: false, panes: { separatorColor: p.border, separatorHoverColor: p.accent, enableResize: true } },
      grid: { vertLines: { color: p.grid }, horzLines: { color: p.grid } },
      crosshair: { mode: CrosshairMode.Normal, vertLine: { color: p.crosshair, labelBackgroundColor: p.crosshair, style: LineStyle.Dashed }, horzLine: { color: p.crosshair, labelBackgroundColor: p.crosshair, style: LineStyle.Dashed } },
      rightPriceScale: { borderColor: p.border, scaleMargins: { top: 0.08, bottom: 0.08 } },
      timeScale: { borderColor: p.border, timeVisible: true, secondsVisible: false, rightOffset: 6, barSpacing: 8, minBarSpacing: 2, lockVisibleTimeRangeOnResize: true },
      handleScroll: { mouseWheel: true, pressedMouseMove: true, horzTouchDrag: true, vertTouchDrag: false },
      handleScale: { axisPressedMouseMove: true, mouseWheel: true, pinch: true },
      kineticScroll: { touch: true, mouse: false },
      localization: { priceFormatter: (v: number) => formatAxis(v, precision) },
    });
    chartRef.current = chart;
    const onRange = (range: LogicalRange | null) => {
      if (!range) return;
      if (range.from < 40 && Date.now() - loadMoreGate.current > 800) {
        loadMoreGate.current = Date.now();
        loadMoreRef.current();
      }
    };
    chart.timeScale().subscribeVisibleLogicalRangeChange(onRange);
    chart.subscribeCrosshairMove((param) => {
      const main = mainRef.current;
      if (!param.time || !main) {
        hoverRef.current(null, {});
        return;
      }
      const t = param.time as number;
      const candle = candlesRef.current.find((c) => c.time === t) ?? null;
      const values: Record<string, number[]> = {};
      for (const out of outputsRef.current) {
        const idx = candlesRef.current.findIndex((c) => c.time === t);
        values[out.id] = out.lines.map((l) => l.values[idx] ?? NaN);
      }
      hoverRef.current(candle, values);
    });
    setReady(true);
    return () => {
      chart.remove();
      chartRef.current = null;
      mainRef.current = null;
      indicatorsRef.current.clear();
      setReady(false);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ---- theme ----
  useEffect(() => {
    const chart = chartRef.current;
    if (!chart) return;
    const p = chartPalette();
    chart.applyOptions({
      layout: { background: { type: ColorType.Solid, color: p.bg }, textColor: p.text, panes: { separatorColor: p.border, separatorHoverColor: p.accent } },
      grid: { vertLines: { color: p.grid }, horzLines: { color: p.grid } },
      crosshair: { vertLine: { color: p.crosshair, labelBackgroundColor: p.crosshair }, horzLine: { color: p.crosshair, labelBackgroundColor: p.crosshair } },
      rightPriceScale: { borderColor: p.border },
      timeScale: { borderColor: p.border },
    });
    mainRef.current?.applyOptions(mainOptions(cs.chartType, p));
  }, [theme, cs.chartType]);

  useEffect(() => {
    chartRef.current?.applyOptions({ localization: { priceFormatter: (v: number) => formatAxis(v, precision) } });
    mainRef.current?.applyOptions({ priceFormat: { type: 'price', precision, minMove: 10 ** -precision } });
  }, [precision]);

  // ---- main series (recreated when the chart type changes) ----
  const candlesRef = useRef<readonly Candle[]>(snapshot.candles);
  candlesRef.current = snapshot.candles;

  useEffect(() => {
    const chart = chartRef.current;
    if (!chart || !ready) return;
    if (mainRef.current && mainTypeRef.current !== null && sameFamily(mainTypeRef.current, cs.chartType)) {
      mainRef.current.applyOptions(mainOptions(cs.chartType, chartPalette()));
      mainTypeRef.current = cs.chartType;
      mainRef.current.setData(toSeriesData(snapshot.candles, cs.chartType) as never);
      return;
    }
    if (mainRef.current) {
      for (const pl of priceLinesRef.current) mainRef.current.removePriceLine(pl);
      priceLinesRef.current = [];
      chart.removeSeries(mainRef.current);
    }
    const series = chart.addSeries(seriesDefinition(cs.chartType), { ...mainOptions(cs.chartType, chartPalette()), priceFormat: { type: 'price', precision, minMove: 10 ** -precision } } as never, 0);
    mainRef.current = series as AnySeries;
    mainTypeRef.current = cs.chartType;
    series.setData(toSeriesData(snapshot.candles, cs.chartType) as never);
    lastHistoryVersion.current = snapshot.historyVersion;
    lastCandleCount.current = snapshot.candles.length;
    firstTimeRef.current = snapshot.candles[0]?.time ?? null;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cs.chartType, ready]);

  // ---- log scale ----
  useEffect(() => {
    chartRef.current?.priceScale('right').applyOptions({ mode: cs.logScale ? PriceScaleMode.Logarithmic : PriceScaleMode.Normal });
  }, [cs.logScale]);

  // ---- data: full reset on history change, cheap update on ticks ----
  useEffect(() => {
    const chart = chartRef.current;
    const main = mainRef.current;
    if (!chart || !main) return;
    const candles = snapshot.candles;
    // A new feed (symbol or timeframe change) must always replace the series data, never update incrementally.
    if (snapshot.key !== appliedKey.current) {
      appliedKey.current = snapshot.key;
      lastHistoryVersion.current = -1;
      firstTimeRef.current = null;
    }
    const historyChanged = snapshot.historyVersion !== lastHistoryVersion.current || candles.length < lastCandleCount.current;
    if (historyChanged) {
      const prevFirst = firstTimeRef.current;
      const range = chart.timeScale().getVisibleLogicalRange();
      main.setData(toSeriesData(candles, cs.chartType) as never);
      // Keep the viewport stable when older bars were prepended.
      if (prevFirst !== null && range && candles.length) {
        const added = candles.findIndex((c) => c.time >= prevFirst);
        if (added > 0) chart.timeScale().setVisibleLogicalRange({ from: range.from + added, to: range.to + added });
      } else if (snapshot.historyVersion <= 1) {
        chart.timeScale().scrollToRealTime();
      }
      lastHistoryVersion.current = snapshot.historyVersion;
      firstTimeRef.current = candles[0]?.time ?? null;
    } else if (snapshot.lastUpdate) {
      const p = lastSeriesPoint(candles, cs.chartType);
      if (p) main.update(p as never);
    }
    const countChanged = candles.length !== lastCandleCount.current;
    lastCandleCount.current = candles.length;
    updateIndicators(chart, candles, cs.indicators, indicatorsRef.current, outputsRef, historyChanged || countChanged, props.onIndicatorOutputs);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [snapshot.candles, snapshot.historyVersion, snapshot.lastUpdate, cs.chartType]);

  // ---- indicators config changes ----
  const indicatorsKey = JSON.stringify(cs.indicators);
  useEffect(() => {
    const chart = chartRef.current;
    if (!chart || !mainRef.current) return;
    updateIndicators(chart, snapshot.candles, cs.indicators, indicatorsRef.current, outputsRef, true, props.onIndicatorOutputs);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [indicatorsKey, ready, theme]);

  // ---- alert price lines ----
  useEffect(() => {
    const main = mainRef.current;
    if (!main) return;
    for (const pl of priceLinesRef.current) main.removePriceLine(pl);
    priceLinesRef.current = alerts.map((a) =>
      main.createPriceLine({ price: a.price, color: a.enabled ? chartPalette().accent : chartPalette().crosshair, lineWidth: 1, lineStyle: LineStyle.Dashed, axisLabelVisible: true, title: a.enabled ? 'alert' : 'alert (off)' }),
    );
  }, [alerts, cs.chartType, ready, theme]);

  return (
    <div className="chart-view" ref={containerRef} data-testid="chart-view" data-symbol={cs.symbol} data-timeframe={cs.timeframe}>
      {ready && chartRef.current && mainRef.current && (
        <DrawingOverlay
          chart={chartRef.current}
          series={mainRef.current}
          container={containerRef.current!}
          candles={snapshot.candles}
          timeframe={cs.timeframe}
          drawings={cs.drawings}
          activeTool={props.activeTool}
          selectedId={props.selectedDrawingId}
          theme={theme}
          precision={precision}
          onAdd={props.onAddDrawing}
          onUpdate={props.onUpdateDrawing}
          onRemove={props.onRemoveDrawing}
          onSelect={props.onSelectDrawing}
          onToolDone={props.onToolDone}
        />
      )}
    </div>
  );
}

function sameFamily(a: ChartState['chartType'], b: ChartState['chartType']): boolean {
  const fam = (t: ChartState['chartType']) => (t === 'candles' || t === 'heikinashi' ? 'candle' : t);
  return fam(a) === fam(b);
}

function mainOptions(type: ChartState['chartType'], p: ReturnType<typeof chartPalette>): Record<string, unknown> {
  switch (type) {
    case 'bars':
      return { upColor: p.up, downColor: p.down, thinBars: false };
    case 'line':
      return { color: p.accent, lineWidth: 2, crosshairMarkerVisible: true, lastValueVisible: true, priceLineVisible: true };
    case 'area':
      return { lineColor: p.accent, topColor: hexWithAlpha(p.accent, 0.35), bottomColor: hexWithAlpha(p.accent, 0.02), lineWidth: 2 };
    default:
      return { upColor: p.up, downColor: p.down, borderUpColor: p.up, borderDownColor: p.down, wickUpColor: p.up, wickDownColor: p.down };
  }
}

function hexWithAlpha(hex: string, alpha: number): string {
  const m = /^#([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return hex;
  const n = parseInt(m[1]!, 16);
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${alpha})`;
}

function formatAxis(v: number, precision: number): string {
  if (Math.abs(v) >= 1e6) return (v / 1e6).toFixed(2) + 'M';
  if (Math.abs(v) >= 1e4) return v.toLocaleString('en-US', { maximumFractionDigits: Math.min(precision, 2) });
  return v.toFixed(precision);
}

/** Create / update indicator series. Separate-pane indicators each get their own pane. */
function updateIndicators(
  chart: IChartApi,
  candles: readonly Candle[],
  configs: ChartState['indicators'],
  sets: Map<string, IndicatorSeriesSet>,
  outputsRef: { current: IndicatorOutput[] },
  full: boolean,
  onOutputs?: (o: IndicatorOutput[]) => void,
): void {
  // Remove deleted
  for (const [id, set] of sets) {
    if (!configs.some((c) => c.id === id)) {
      for (const s of set.series) chart.removeSeries(s.api);
      sets.delete(id);
    }
  }
  const outputs: IndicatorOutput[] = [];
  let nextPane = 1;
  const p = chartPalette();
  for (const cfg of configs) {
    const out = computeIndicator(cfg, candles);
    outputs.push(out);
    const configKey = JSON.stringify({ ...cfg, visible: undefined });
    let set = sets.get(cfg.id);
    const pane = out.pane === 'price' ? 0 : nextPane++;
    const mustRecreate = set && (set.configKey !== configKey || set.pane !== pane);
    if (set && mustRecreate) {
      for (const s of set.series) chart.removeSeries(s.api);
      sets.delete(cfg.id);
      set = undefined;
    }
    if (!set) {
      const created: IndicatorSeriesSet = { pane, series: [], configKey };
      for (const line of out.lines) {
        const isHist = line.style === 'histogram';
        const api = isHist
          ? chart.addSeries(HistogramSeries, { color: line.color, priceFormat: cfg.type === 'volume' ? { type: 'volume' } : { type: 'price', precision: 4, minMove: 0.0001 }, priceLineVisible: false, lastValueVisible: cfg.type !== 'volume', base: 0 }, pane)
          : chart.addSeries(LineSeries, { color: line.color, lineWidth: cfg.type === 'bb' && line.key === 'middle' ? 1 : 2, priceLineVisible: false, lastValueVisible: out.pane === 'separate', crosshairMarkerVisible: false, priceFormat: { type: 'price', precision: out.pane === 'separate' ? 2 : 8, minMove: 0.00000001 } }, pane);
        created.series.push({ api: api as AnySeries, key: line.key });
      }
      if (cfg.type === 'rsi') {
        const s = created.series[0]?.api;
        if (s) {
          s.createPriceLine({ price: 70, color: p.crosshair, lineWidth: 1, lineStyle: LineStyle.Dotted, axisLabelVisible: false, title: '' });
          s.createPriceLine({ price: 30, color: p.crosshair, lineWidth: 1, lineStyle: LineStyle.Dotted, axisLabelVisible: false, title: '' });
        }
      }
      set = created;
      sets.set(cfg.id, set);
      full = true;
    }
    for (const s of set.series) s.api.applyOptions({ visible: cfg.visible });
    for (let li = 0; li < out.lines.length; li++) {
      const line = out.lines[li]!;
      const api = set.series[li]?.api;
      if (!api) continue;
      if (full) {
        const data = line.values.map((v, i) => (Number.isFinite(v) ? { time: asTime(candles[i]!.time), value: v, ...(out.colors && line.style === 'histogram' ? { color: out.colors[i] } : {}) } : { time: asTime(candles[i]!.time) }));
        api.setData(data as never);
      } else {
        const i = candles.length - 1;
        const v = line.values[i];
        if (i >= 0 && v !== undefined && Number.isFinite(v)) api.update({ time: asTime(candles[i]!.time), value: v, ...(out.colors && line.style === 'histogram' ? { color: out.colors[i] } : {}) } as never);
      }
    }
  }
  // Pane proportions: price pane dominates.
  const panes = chart.panes();
  panes.forEach((pane, i) => pane.setStretchFactor(i === 0 ? 3 : 1));
  outputsRef.current = outputs;
  onOutputs?.(outputs);
}

export type { UTCTimestamp };
