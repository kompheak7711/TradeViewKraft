import type { DrawingType } from '@tvk/shared-types';
import { DRAWING_TOOLS } from '@tvk/chart-core';
import { IconCursor, IconFib, IconHLine, IconRay, IconRect, IconText, IconTrash, IconTrend } from '@tvk/ui';
import { useStore } from '../state/store';

const ICONS: Record<DrawingType, React.ReactNode> = {
  trendline: <IconTrend size={18} />, ray: <IconRay size={18} />, hline: <IconHLine size={18} />, rect: <IconRect size={18} />, fib: <IconFib size={18} />, text: <IconText size={18} />,
};

/** Vertical tool rail on Mac/iPad, horizontal strip above the tab bar on iPhone. */
export function DrawingToolbar({ horizontal }: { horizontal: boolean }) {
  const ui = useStore((s) => s.ui);
  const setUi = useStore((s) => s.setUi);
  const chart = useStore((s) => s.activeChart());
  const removeDrawing = useStore((s) => s.removeDrawing);
  const clearDrawings = useStore((s) => s.clearDrawings);
  return (
    <nav className={`tool-rail${horizontal ? ' horizontal' : ''}`} aria-label="Drawing tools" data-testid="drawing-toolbar">
      <button className={`btn ghost icon${ui.activeTool === null ? ' active' : ''}`} data-testid="tool-cursor" onClick={() => setUi({ activeTool: null })} title="Cursor"><IconCursor size={18} /></button>
      {DRAWING_TOOLS.map((t) => (
        <button key={t.type} className={`btn ghost icon${ui.activeTool === t.type ? ' active' : ''}`} data-testid={`tool-${t.type}`} aria-pressed={ui.activeTool === t.type} onClick={() => setUi({ activeTool: ui.activeTool === t.type ? null : t.type, selectedDrawingId: null })} title={`${t.name}${t.shortcut ? ` (${t.shortcut})` : ''}`}>{ICONS[t.type]}</button>
      ))}
      <div className="grow" />
      <button className="btn ghost icon" data-testid="tool-delete" disabled={!ui.selectedDrawingId} onClick={() => { if (ui.selectedDrawingId) { removeDrawing(chart.id, ui.selectedDrawingId); setUi({ selectedDrawingId: null }); } }} title="Delete selected drawing"><IconTrash size={18} /></button>
      <button className="btn ghost sm" data-testid="tool-clear" disabled={!chart.drawings.length} onClick={() => { if (confirm('Remove all drawings on this chart?')) clearDrawings(chart.id); }} title="Remove all drawings">Clear</button>
    </nav>
  );
}
