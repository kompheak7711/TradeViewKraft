import { useEffect, useRef } from 'react';
import type { IChartApi, ISeriesApi, SeriesType } from 'lightweight-charts';
import type { Candle, Drawing, DrawingPoint, DrawingType, Timeframe } from '@tvk/shared-types';
import { DRAWING_TOOLS, FIB_LEVELS, createDrawing, fibLevels, hitTest, logicalToTime, movePoint, rayEnd, timeToLogical, translateDrawing, type Px } from '@tvk/chart-core';
import { chartPalette } from '@tvk/ui';

export interface DrawingOverlayProps {
  chart: IChartApi;
  series: ISeriesApi<SeriesType>;
  container: HTMLDivElement;
  candles: readonly Candle[];
  timeframe: Timeframe;
  drawings: Drawing[];
  activeTool: DrawingType | null;
  selectedId: string | null;
  theme: 'dark' | 'light';
  precision: number;
  onAdd: (d: Drawing) => void;
  onUpdate: (d: Drawing) => void;
  onRemove: (id: string) => void;
  onSelect: (id: string | null) => void;
  onToolDone: () => void;
}

type Interaction =
  | { kind: 'none' }
  | { kind: 'drawing'; type: DrawingType; first: DrawingPoint; startPx: Px; preview: DrawingPoint | null; moved: boolean }
  | { kind: 'move'; id: string; last: DrawingPoint; original: Drawing; moved: boolean }
  | { kind: 'handle'; id: string; index: number };

/**
 * Canvas overlay for drawings. Input is captured on the chart container in the capture phase so that
 * the chart does not pan while the user is drawing or dragging a shape. Works with mouse, touch and pen.
 */
export function DrawingOverlay(props: DrawingOverlayProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const propsRef = useRef(props);
  propsRef.current = props;
  const interactionRef = useRef<Interaction>({ kind: 'none' });
  const hoverRef = useRef<Px | null>(null);
  const sigRef = useRef('');

  // ---- coordinate helpers (read latest props) ----
  const toPx = (pt: DrawingPoint): Px | null => {
    const { chart, series, candles, timeframe } = propsRef.current;
    const times = candles.map((c) => c.time);
    const logical = timeToLogical(times, pt.time, timeframe);
    const x = chart.timeScale().logicalToCoordinate(logical as never);
    const y = series.priceToCoordinate(pt.price);
    if (x === null || y === null) return null;
    return { x, y };
  };
  const toPoint = (px: Px): DrawingPoint | null => {
    const { chart, series, candles, timeframe } = propsRef.current;
    const logical = chart.timeScale().coordinateToLogical(px.x);
    const price = series.coordinateToPrice(px.y);
    if (logical === null || price === null) return null;
    const times = candles.map((c) => c.time);
    return { time: logicalToTime(times, logical as number, timeframe), price: price as number };
  };

  // ---- render loop (only redraws when the signature changes) ----
  useEffect(() => {
    let raf = 0;
    const tick = () => {
      draw(false);
      raf = requestAnimationFrame(tick);
    };
    const draw = (force: boolean) => {
      const canvas = canvasRef.current;
      const { chart, drawings, activeTool, selectedId, series } = propsRef.current;
      if (!canvas) return;
      const size = chart.paneSize(0);
      const w = Math.max(1, Math.floor(size.width));
      const h = Math.max(1, Math.floor(size.height));
      const range = chart.timeScale().getVisibleLogicalRange();
      const ref = series.priceToCoordinate(propsRef.current.candles[propsRef.current.candles.length - 1]?.close ?? 0);
      const inter = interactionRef.current;
      const sig = `${w}x${h}|${range?.from.toFixed(3)}-${range?.to.toFixed(3)}|${ref}|${drawings.length}|${drawings.map((d) => d.id + d.points.map((p) => p.time + ':' + p.price).join(',')).join(';')}|${activeTool}|${selectedId}|${inter.kind}|${inter.kind === 'drawing' ? `${inter.preview?.time}:${inter.preview?.price}` : ''}|${hoverRef.current?.x ?? ''}:${hoverRef.current?.y ?? ''}`;
      if (!force && sig === sigRef.current) return;
      sigRef.current = sig;
      const dpr = window.devicePixelRatio || 1;
      if (canvas.width !== w * dpr || canvas.height !== h * dpr) {
        canvas.width = w * dpr;
        canvas.height = h * dpr;
        canvas.style.width = `${w}px`;
        canvas.style.height = `${h}px`;
      }
      const ctx = canvas.getContext('2d');
      if (!ctx) return;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, w, h);
      const pal = chartPalette();
      for (const d of drawings) renderDrawing(ctx, d, toPx, w, h, d.id === selectedId, pal, propsRef.current.precision);
      if (inter.kind === 'drawing' && inter.preview) {
        const def = DRAWING_TOOLS.find((t) => t.type === inter.type);
        const preview: Drawing = { id: 'preview', type: inter.type, points: def?.points === 1 ? [inter.first] : [inter.first, inter.preview], color: pal.accent, width: 1.5 };
        renderDrawing(ctx, preview, toPx, w, h, false, pal, propsRef.current.precision);
      }
      if (activeTool && hoverRef.current) {
        // Small crosshair target so touch users see where the point will land.
        const { x, y } = hoverRef.current;
        ctx.strokeStyle = pal.accent;
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.arc(x, y, 6, 0, Math.PI * 2);
        ctx.stroke();
      }
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ---- input handling on the chart container (capture phase) ----
  useEffect(() => {
    const el = props.container;
    const rel = (e: PointerEvent | MouseEvent | Touch): Px => {
      const r = el.getBoundingClientRect();
      return { x: e.clientX - r.left, y: e.clientY - r.top };
    };
    const swallow = (e: Event) => {
      e.stopPropagation();
      if (e.cancelable) e.preventDefault();
    };
    let capturing = false;

    const onPointerDown = (e: PointerEvent) => {
      const p = propsRef.current;
      if (e.button !== 0 && e.pointerType === 'mouse') return;
      const px = rel(e);
      const size = p.chart.paneSize(0);
      if (px.x > size.width || px.y > size.height) return; // on a scale, let the chart handle it
      const inter = interactionRef.current;
      if (p.activeTool) {
        const pt = toPoint(px);
        if (!pt) return;
        capturing = true;
        swallow(e);
        const def = DRAWING_TOOLS.find((t) => t.type === p.activeTool)!;
        if (inter.kind === 'drawing') {
          // Second tap in tap-tap mode finishes the shape.
          finishDrawing(inter.type, inter.first, pt);
          return;
        }
        if (def.points === 1) {
          let text: string | undefined;
          if (p.activeTool === 'text') {
            text = window.prompt('Text') ?? '';
            if (!text) {
              capturing = false;
              return;
            }
          }
          p.onAdd(createDrawing(p.activeTool, [pt], chartPalette().accent, text));
          p.onToolDone();
          capturing = false;
          return;
        }
        interactionRef.current = { kind: 'drawing', type: p.activeTool, first: pt, startPx: px, preview: pt, moved: false };
        return;
      }
      if (!p.drawings.length) return;
      const hit = hitTest(p.drawings, px, toPx, { w: size.width, h: size.height }, e.pointerType === 'mouse' ? 6 : 12);
      if (!hit) {
        if (p.selectedId) p.onSelect(null);
        return;
      }
      const d = p.drawings.find((x) => x.id === hit.drawingId)!;
      capturing = true;
      swallow(e);
      p.onSelect(d.id);
      const pt = toPoint(px);
      if (!pt) return;
      if (hit.handle !== null && !d.locked) interactionRef.current = { kind: 'handle', id: d.id, index: hit.handle };
      else interactionRef.current = { kind: 'move', id: d.id, last: pt, original: d, moved: false };
    };

    const finishDrawing = (type: DrawingType, first: DrawingPoint, second: DrawingPoint) => {
      const p = propsRef.current;
      interactionRef.current = { kind: 'none' };
      capturing = false;
      if (first.time === second.time && first.price === second.price) return;
      p.onAdd(createDrawing(type, [first, second], chartPalette().accent));
      p.onToolDone();
    };

    const onPointerMove = (e: PointerEvent) => {
      const p = propsRef.current;
      const px = rel(e);
      hoverRef.current = p.activeTool ? px : null;
      const inter = interactionRef.current;
      if (inter.kind === 'none') return;
      swallow(e);
      const pt = toPoint(px);
      if (!pt) return;
      if (inter.kind === 'drawing') {
        const moved = inter.moved || Math.hypot(px.x - inter.startPx.x, px.y - inter.startPx.y) > 4;
        interactionRef.current = { ...inter, preview: pt, moved };
      } else if (inter.kind === 'move') {
        const d = p.drawings.find((x) => x.id === inter.id);
        if (!d) return;
        p.onUpdate(translateDrawing(d, pt.time - inter.last.time, pt.price - inter.last.price));
        interactionRef.current = { ...inter, last: pt, moved: true };
      } else if (inter.kind === 'handle') {
        const d = p.drawings.find((x) => x.id === inter.id);
        if (!d) return;
        p.onUpdate(movePoint(d, inter.index, pt));
      }
    };

    const onPointerUp = (e: PointerEvent) => {
      const inter = interactionRef.current;
      if (inter.kind === 'none') return;
      swallow(e);
      if (inter.kind === 'drawing') {
        if (inter.moved && inter.preview) finishDrawing(inter.type, inter.first, inter.preview);
        // else: tap-tap mode, wait for the second tap
        return;
      }
      interactionRef.current = { kind: 'none' };
      capturing = false;
    };

    const onKey = (e: KeyboardEvent) => {
      const p = propsRef.current;
      if ((e.key === 'Delete' || e.key === 'Backspace') && p.selectedId && !(e.target instanceof HTMLInputElement) && !(e.target instanceof HTMLTextAreaElement)) {
        p.onRemove(p.selectedId);
        p.onSelect(null);
      }
      if (e.key === 'Escape') {
        interactionRef.current = { kind: 'none' };
        capturing = false;
        if (p.activeTool) p.onToolDone();
        p.onSelect(null);
      }
    };
    // Block the chart's own mouse/touch handlers while we own the gesture.
    const block = (e: Event) => {
      if (capturing) swallow(e);
    };
    const opts: AddEventListenerOptions = { capture: true, passive: false };
    el.addEventListener('pointerdown', onPointerDown, opts);
    window.addEventListener('pointermove', onPointerMove, opts);
    window.addEventListener('pointerup', onPointerUp, opts);
    window.addEventListener('pointercancel', onPointerUp, opts);
    for (const t of ['mousedown', 'mousemove', 'mouseup', 'touchstart', 'touchmove', 'touchend', 'click', 'dblclick']) el.addEventListener(t, block, opts);
    window.addEventListener('keydown', onKey);
    return () => {
      el.removeEventListener('pointerdown', onPointerDown, opts);
      window.removeEventListener('pointermove', onPointerMove, opts);
      window.removeEventListener('pointerup', onPointerUp, opts);
      window.removeEventListener('pointercancel', onPointerUp, opts);
      for (const t of ['mousedown', 'mousemove', 'mouseup', 'touchstart', 'touchmove', 'touchend', 'click', 'dblclick']) el.removeEventListener(t, block, opts);
      window.removeEventListener('keydown', onKey);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [props.container]);

  // Reset interaction when the tool changes.
  useEffect(() => {
    interactionRef.current = { kind: 'none' };
    if (!props.activeTool) hoverRef.current = null;
  }, [props.activeTool]);

  return <canvas ref={canvasRef} className="drawing-overlay" data-testid="drawing-overlay" data-count={props.drawings.length} aria-hidden="true" />;
}

function renderDrawing(ctx: CanvasRenderingContext2D, d: Drawing, toPx: (p: DrawingPoint) => Px | null, w: number, h: number, selected: boolean, pal: ReturnType<typeof chartPalette>, precision: number): void {
  const pts = d.points.map(toPx);
  const [a, b] = pts;
  ctx.save();
  ctx.lineWidth = (d.width ?? 1.5) + (selected ? 1 : 0);
  ctx.strokeStyle = d.color;
  ctx.fillStyle = d.color;
  ctx.font = '12px Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
  switch (d.type) {
    case 'hline': {
      if (!a) break;
      ctx.beginPath();
      ctx.moveTo(0, a.y);
      ctx.lineTo(w, a.y);
      ctx.stroke();
      label(ctx, d.points[0]!.price.toFixed(precision), w - 6, a.y - 4, 'right', pal);
      break;
    }
    case 'trendline': {
      if (!a || !b) break;
      ctx.beginPath();
      ctx.moveTo(a.x, a.y);
      ctx.lineTo(b.x, b.y);
      ctx.stroke();
      break;
    }
    case 'ray': {
      if (!a || !b) break;
      const end = rayEnd(a, b, w, h);
      ctx.beginPath();
      ctx.moveTo(a.x, a.y);
      ctx.lineTo(end.x, end.y);
      ctx.stroke();
      break;
    }
    case 'rect': {
      if (!a || !b) break;
      const x = Math.min(a.x, b.x), y = Math.min(a.y, b.y), rw = Math.abs(b.x - a.x), rh = Math.abs(b.y - a.y);
      ctx.globalAlpha = 0.15;
      ctx.fillRect(x, y, rw, rh);
      ctx.globalAlpha = 1;
      ctx.strokeRect(x, y, rw, rh);
      break;
    }
    case 'fib': {
      if (!a || !b) break;
      const x0 = Math.min(a.x, b.x), x1 = Math.max(a.x, b.x);
      const levels = fibLevels(d.points[0]!, d.points[1]!);
      const colors = ['#9aa9c2', '#f4527a', '#f5b041', '#1fc37f', '#58b6f0', '#a855f7', '#9aa9c2'];
      ctx.setLineDash([]);
      ctx.globalAlpha = 0.35;
      ctx.strokeStyle = d.color;
      ctx.beginPath();
      ctx.moveTo(a.x, a.y);
      ctx.lineTo(b.x, b.y);
      ctx.stroke();
      ctx.globalAlpha = 1;
      levels.forEach((lv, i) => {
        const y = b.y - (b.y - a.y) * FIB_LEVELS[i]!;
        ctx.strokeStyle = colors[i]!;
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(x0, y);
        ctx.lineTo(x1, y);
        ctx.stroke();
        if (i > 0) {
          const yPrev = b.y - (b.y - a.y) * FIB_LEVELS[i - 1]!;
          ctx.globalAlpha = 0.08;
          ctx.fillStyle = colors[i]!;
          ctx.fillRect(x0, Math.min(y, yPrev), x1 - x0, Math.abs(y - yPrev));
          ctx.globalAlpha = 1;
        }
        label(ctx, `${(lv.level * 100).toFixed(1)}% (${lv.price.toFixed(precision)})`, x0 + 4, y - 3, 'left', pal, colors[i]);
      });
      break;
    }
    case 'text': {
      if (!a) break;
      label(ctx, d.text ?? '', a.x, a.y, 'left', pal, d.color, true);
      break;
    }
  }
  if (selected) {
    for (const p of pts) {
      if (!p) continue;
      ctx.fillStyle = pal.bg;
      ctx.strokeStyle = d.color;
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.arc(p.x, p.y, 5, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
    }
  }
  ctx.restore();
}

function label(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, align: CanvasTextAlign, pal: ReturnType<typeof chartPalette>, color?: string, big = false): void {
  ctx.save();
  ctx.font = big ? '600 14px Inter, -apple-system, sans-serif' : '11px Inter, -apple-system, sans-serif';
  ctx.textAlign = align;
  ctx.textBaseline = 'bottom';
  const metrics = ctx.measureText(text);
  const pad = 3;
  const bw = metrics.width + pad * 2;
  const bh = big ? 18 : 14;
  const bx = align === 'right' ? x - bw : x - pad;
  ctx.fillStyle = pal.bg;
  ctx.globalAlpha = 0.85;
  ctx.fillRect(bx, y - bh, bw, bh);
  ctx.globalAlpha = 1;
  ctx.fillStyle = color ?? pal.text;
  ctx.fillText(text, x, y - 1);
  ctx.restore();
}
