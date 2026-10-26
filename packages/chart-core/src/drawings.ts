/**
 * Drawing tool model and geometry. Coordinates are in chart space ({time, price}); the renderer
 * converts to pixels through the chart's scales. Hit-testing works in pixel space.
 */
import type { Drawing, DrawingPoint, DrawingType } from '@tvk/shared-types';

export interface Px { x: number; y: number }

export interface DrawingToolDefinition {
  type: DrawingType;
  name: string;
  /** Number of anchor points needed to finish the drawing. */
  points: 1 | 2;
  shortcut?: string;
}

export const DRAWING_TOOLS: DrawingToolDefinition[] = [
  { type: 'trendline', name: 'Trend line', points: 2, shortcut: 'T' },
  { type: 'ray', name: 'Ray', points: 2, shortcut: 'R' },
  { type: 'hline', name: 'Horizontal line', points: 1, shortcut: 'H' },
  { type: 'rect', name: 'Rectangle', points: 2, shortcut: 'B' },
  { type: 'fib', name: 'Fib retracement', points: 2, shortcut: 'F' },
  { type: 'text', name: 'Text', points: 1, shortcut: 'X' },
];

export const FIB_LEVELS = [0, 0.236, 0.382, 0.5, 0.618, 0.786, 1] as const;

export function createDrawing(type: DrawingType, points: DrawingPoint[], color: string, text?: string): Drawing {
  return { id: `${type}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`, type, points, color, width: 1.5, text };
}

/** Fib level prices from the two anchor points (first = start/0, second = end/1). */
export function fibLevels(a: DrawingPoint, b: DrawingPoint): Array<{ level: number; price: number }> {
  const diff = b.price - a.price;
  return FIB_LEVELS.map((level) => ({ level, price: b.price - diff * level }));
}

export function distToSegment(p: Px, a: Px, b: Px): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len2 = dx * dx + dy * dy;
  let t = len2 === 0 ? 0 : ((p.x - a.x) * dx + (p.y - a.y) * dy) / len2;
  t = Math.max(0, Math.min(1, t));
  const cx = a.x + t * dx;
  const cy = a.y + t * dy;
  return Math.hypot(p.x - cx, p.y - cy);
}

/** Distance from a point to a ray starting at `a` through `b`. */
export function distToRay(p: Px, a: Px, b: Px): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len2 = dx * dx + dy * dy;
  let t = len2 === 0 ? 0 : ((p.x - a.x) * dx + (p.y - a.y) * dy) / len2;
  t = Math.max(0, t);
  return Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy));
}

/** Extend the ray a→b to the right edge (or left if b is left of a) of a width `w` canvas. */
export function rayEnd(a: Px, b: Px, w: number, h: number): Px {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  if (dx === 0 && dy === 0) return b;
  const candidates: number[] = [];
  if (dx > 0) candidates.push((w - a.x) / dx);
  else if (dx < 0) candidates.push((0 - a.x) / dx);
  if (dy > 0) candidates.push((h - a.y) / dy);
  else if (dy < 0) candidates.push((0 - a.y) / dy);
  const t = Math.max(1, Math.min(...candidates.filter((c) => c > 0)));
  return { x: a.x + dx * t, y: a.y + dy * t };
}

export type HitResult = { drawingId: string; handle: number | null } | null;

/**
 * Hit-test drawings in pixel space. `toPx` maps chart points to pixels (null when off-scale).
 * Returns the hit drawing and, if the pointer is on an anchor, the handle index.
 */
export function hitTest(drawings: readonly Drawing[], p: Px, toPx: (pt: DrawingPoint) => Px | null, size: { w: number; h: number }, tolerance = 6): HitResult {
  for (let i = drawings.length - 1; i >= 0; i--) {
    const d = drawings[i]!;
    const pts = d.points.map(toPx);
    for (let k = 0; k < pts.length; k++) {
      const q = pts[k];
      if (q && Math.hypot(q.x - p.x, q.y - p.y) <= tolerance + 2) return { drawingId: d.id, handle: k };
    }
    const [a, b] = pts;
    switch (d.type) {
      case 'hline':
        if (a && Math.abs(p.y - a.y) <= tolerance) return { drawingId: d.id, handle: null };
        break;
      case 'trendline':
        if (a && b && distToSegment(p, a, b) <= tolerance) return { drawingId: d.id, handle: null };
        break;
      case 'ray':
        if (a && b && distToRay(p, a, b) <= tolerance) return { drawingId: d.id, handle: null };
        break;
      case 'rect':
        if (a && b) {
          const x0 = Math.min(a.x, b.x), x1 = Math.max(a.x, b.x), y0 = Math.min(a.y, b.y), y1 = Math.max(a.y, b.y);
          if (p.x >= x0 - tolerance && p.x <= x1 + tolerance && p.y >= y0 - tolerance && p.y <= y1 + tolerance) return { drawingId: d.id, handle: null };
        }
        break;
      case 'fib':
        if (a && b) {
          const x0 = Math.min(a.x, b.x) - tolerance, x1 = Math.max(a.x, b.x) + tolerance;
          const levelsY = FIB_LEVELS.map((l) => b.y - (b.y - a.y) * l);
          if (p.x >= x0 && p.x <= x1 && levelsY.some((y) => Math.abs(y - p.y) <= tolerance)) return { drawingId: d.id, handle: null };
        }
        break;
      case 'text':
        if (a && p.x >= a.x - tolerance && p.x <= a.x + 8 * (d.text?.length ?? 4) + tolerance && p.y >= a.y - 14 - tolerance && p.y <= a.y + tolerance) return { drawingId: d.id, handle: null };
        break;
    }
  }
  void size;
  return null;
}

/** Move every point of a drawing by a chart-space delta. */
export function translateDrawing(d: Drawing, dTime: number, dPrice: number): Drawing {
  return { ...d, points: d.points.map((p) => ({ time: p.time + dTime, price: p.price + dPrice })) };
}

export function movePoint(d: Drawing, index: number, pt: DrawingPoint): Drawing {
  const points = d.points.slice();
  points[index] = pt;
  return { ...d, points };
}
