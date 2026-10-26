import { describe, expect, it } from 'vitest';
import { fibLevels, hitTest, rayEnd, distToSegment, translateDrawing, createDrawing } from '../src/drawings';
import { timeToLogical, logicalToTime } from '../src/timeframes';

describe('drawing geometry', () => {
  it('fib levels between anchors', () => {
    const l = fibLevels({ time: 0, price: 100 }, { time: 1, price: 200 });
    const expected = [200, 176.4, 161.8, 150, 138.2, 121.4, 100];
    l.forEach((x, i) => expect(x.price).toBeCloseTo(expected[i]!, 6));
  });
  it('ray extends to the canvas edge', () => {
    expect(rayEnd({ x: 0, y: 0 }, { x: 10, y: 5 }, 100, 100)).toEqual({ x: 100, y: 50 });
    expect(rayEnd({ x: 50, y: 50 }, { x: 40, y: 50 }, 100, 100)).toEqual({ x: 0, y: 50 });
  });
  it('segment distance', () => {
    expect(distToSegment({ x: 5, y: 5 }, { x: 0, y: 0 }, { x: 10, y: 0 })).toBe(5);
    expect(distToSegment({ x: 20, y: 0 }, { x: 0, y: 0 }, { x: 10, y: 0 })).toBe(10);
  });
  it('hit tests lines, handles and rectangles', () => {
    const toPx = (p: { time: number; price: number }) => ({ x: p.time, y: 100 - p.price });
    const line = createDrawing('trendline', [{ time: 0, price: 0 }, { time: 100, price: 100 }], '#fff');
    const rect = createDrawing('rect', [{ time: 200, price: 10 }, { time: 300, price: 50 }], '#fff');
    const h = createDrawing('hline', [{ time: 0, price: 80 }], '#fff');
    const all = [line, rect, h];
    expect(hitTest(all, { x: 50, y: 50 }, toPx, { w: 400, h: 100 })).toEqual({ drawingId: line.id, handle: null });
    expect(hitTest(all, { x: 100, y: 0 }, toPx, { w: 400, h: 100 })).toEqual({ drawingId: line.id, handle: 1 });
    expect(hitTest(all, { x: 250, y: 70 }, toPx, { w: 400, h: 100 })).toEqual({ drawingId: rect.id, handle: null });
    expect(hitTest(all, { x: 350, y: 20 }, toPx, { w: 400, h: 100 })).toEqual({ drawingId: h.id, handle: null });
    expect(hitTest(all, { x: 350, y: 40 }, toPx, { w: 400, h: 100 })).toBeNull();
  });
  it('translates drawings', () => {
    const d = translateDrawing(createDrawing('hline', [{ time: 5, price: 10 }], '#fff'), 1, 2);
    expect(d.points[0]).toEqual({ time: 6, price: 12 });
  });
  it('maps time <-> logical index with extrapolation', () => {
    const times = [0, 60, 120, 180];
    expect(timeToLogical(times, 60, '1m')).toBe(1);
    expect(timeToLogical(times, 90, '1m')).toBe(1.5);
    expect(timeToLogical(times, 300, '1m')).toBe(5);
    expect(timeToLogical(times, -60, '1m')).toBe(-1);
    expect(logicalToTime(times, 2.5, '1m')).toBe(150);
    expect(logicalToTime(times, 5, '1m')).toBe(300);
    expect(logicalToTime(times, -1, '1m')).toBe(-60);
  });
});
