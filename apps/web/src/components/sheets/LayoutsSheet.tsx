import { useState } from 'react';
import type { LayoutGrid } from '@tvk/shared-types';
import { IconCheck, IconTrash, Modal } from '@tvk/ui';
import { useStore } from '../../state/store';

const GRID_LABEL: Record<LayoutGrid, string> = { '1': '1 chart', '2h': '2 side by side', '2v': '2 stacked', '4': '4 charts' };

export function LayoutsSheet() {
  const store = useStore();
  const layouts = useStore((s) => s.layouts);
  const active = store.activeLayout();
  const [name, setName] = useState('');
  return (
    <Modal title="Layouts" onClose={store.closeSheet}>
      <div className="field">
        <label className="label" htmlFor="layout-name">Save current layout as</label>
        <div className="row">
          <input id="layout-name" className="input grow" data-testid="layout-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Crypto 4-up" />
          <button className="btn primary" data-testid="layout-save" disabled={!name.trim()} onClick={() => { store.saveLayoutAs(name.trim()); setName(''); store.pushToast({ kind: 'success', title: `Layout “${name.trim()}” saved` }); }}>Save</button>
        </div>
      </div>
      <div className="row" style={{ marginBottom: 8, flexWrap: 'wrap' }}>
        <span className="muted small grow">Grid for the current layout</span>
        <div className="segmented" role="radiogroup" aria-label="Grid">
          {(['1', '2h', '2v', '4'] as LayoutGrid[]).map((g) => <button key={g} role="radio" aria-checked={active.grid === g} className={active.grid === g ? 'active' : ''} data-testid={`sheet-grid-${g}`} onClick={() => store.setGrid(g)}>{GRID_LABEL[g]}</button>)}
        </div>
      </div>
      <div className="list" data-testid="layout-list">
        {layouts.map((l) => (
          <div key={l.id} className={`list-item clickable${l.id === active.id ? ' selected' : ''}`} data-testid="layout-row" data-layout-name={l.name} role="button" tabIndex={0} onClick={() => { store.loadLayout(l.id); store.closeSheet(); }}>
            <div className="grow">
              <b>{l.name}</b> {l.id === active.id && <IconCheck size={14} />}
              <div className="muted small">{GRID_LABEL[l.grid]} · {l.charts.map((c) => `${c.symbol.split(':')[1]} ${c.timeframe}`).join(', ')} · {new Date(l.updatedAt).toLocaleString()}</div>
            </div>
            <button className="btn ghost sm" onClick={(e) => { e.stopPropagation(); const n = prompt('Rename layout', l.name); if (n) store.renameLayout(l.id, n); }}>Rename</button>
            <button className="btn ghost sm icon" aria-label="Delete layout" disabled={layouts.length <= 1} onClick={(e) => { e.stopPropagation(); if (confirm(`Delete layout "${l.name}"?`)) store.deleteLayout(l.id); }}><IconTrash size={14} /></button>
          </div>
        ))}
      </div>
    </Modal>
  );
}
