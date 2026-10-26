import { INDICATOR_DEFINITIONS } from '@tvk/chart-core';
import type { IndicatorId } from '@tvk/shared-types';
import { IconClose, Modal } from '@tvk/ui';
import { useStore } from '../../state/store';

export function IndicatorsSheet() {
  const store = useStore();
  const chart = store.activeChart();
  const defs = Object.values(INDICATOR_DEFINITIONS);
  return (
    <Modal title="Indicators" onClose={store.closeSheet}>
      <div className="list" data-testid="indicator-list">
        {defs.map((d) => (
          <div key={d.type} className="list-item clickable" data-testid={`indicator-${d.type}`} role="button" tabIndex={0} onClick={() => { store.addIndicator(d.type as IndicatorId); store.closeSheet(); }} onKeyDown={(e) => e.key === 'Enter' && store.addIndicator(d.type as IndicatorId)}>
            <div className="grow"><b>{d.name}</b><div className="muted small">{d.pane === 'price' ? 'Overlay on price' : 'Separate pane'}{d.params.length ? ` · ${d.params.map((p) => `${p.label} ${p.default}`).join(', ')}` : ''}</div></div>
            <span className="muted small">Add</span>
          </div>
        ))}
      </div>
      {chart.indicators.length > 0 && (
        <>
          <div className="label" style={{ marginTop: 16 }}>On this chart</div>
          <div className="list">
            {chart.indicators.map((ind) => {
              const def = INDICATOR_DEFINITIONS[ind.type];
              return (
                <div key={ind.id} className="list-item" data-testid="active-indicator">
                  <div className="grow">
                    <b>{def.name}</b>
                    <div className="row" style={{ marginTop: 6, flexWrap: 'wrap' }}>
                      {def.params.map((p) => (
                        <label key={p.key} className="row small muted" style={{ gap: 4 }}>
                          {p.label}
                          <input className="input" style={{ width: 70, height: 28 }} type="number" min={p.min} max={p.max} step={p.key === 'mult' ? 0.1 : 1} value={ind.params[p.key] ?? p.default} onChange={(e) => store.updateIndicator(chart.id, ind.id, { params: { [p.key]: Number(e.target.value) || p.default } })} />
                        </label>
                      ))}
                      <label className="row small muted" style={{ gap: 4 }}>Color <input type="color" value={ind.color ?? def.defaultColor} onChange={(e) => store.updateIndicator(chart.id, ind.id, { color: e.target.value })} aria-label="Indicator color" /></label>
                    </div>
                  </div>
                  <button className="btn ghost sm icon" aria-label="Remove indicator" onClick={() => store.removeIndicator(chart.id, ind.id)}><IconClose size={14} /></button>
                </div>
              );
            })}
          </div>
        </>
      )}
    </Modal>
  );
}
