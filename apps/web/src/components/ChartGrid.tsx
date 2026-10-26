import type { Layout } from '@tvk/shared-types';
import { tickerOf } from '@tvk/market-data';
import { useStore } from '../state/store';
import { ChartPanel } from './ChartPanel';

/** 1 / 2 / 4 chart grid on Mac and iPad; a single chart with a quick-switch strip on phones. */
export function ChartGrid({ layout, phone, theme }: { layout: Layout; phone: boolean; theme: 'dark' | 'light' }) {
  const setActiveChart = useStore((s) => s.setActiveChart);
  if (phone) {
    const chart = layout.charts.find((c) => c.id === layout.activeChartId) ?? layout.charts[0]!;
    return (
      <div className="chart-grid phone" data-testid="chart-grid" data-grid="phone">
        {layout.charts.length > 1 && (
          <div className="chart-strip" role="tablist" aria-label="Charts">
            {layout.charts.map((c, i) => (
              <button key={c.id} role="tab" aria-selected={c.id === chart.id} className={`chip${c.id === chart.id ? ' active' : ''}`} onClick={() => setActiveChart(c.id)}>{i + 1} · {tickerOf(c.symbol)} {c.timeframe}</button>
            ))}
          </div>
        )}
        <ChartPanel key={chart.id} chart={chart} active compact theme={theme} onActivate={() => {}} />
      </div>
    );
  }
  return (
    <div className={`chart-grid grid-${layout.grid}`} data-testid="chart-grid" data-grid={layout.grid}>
      {layout.charts.map((c) => (
        <ChartPanel key={c.id} chart={c} active={c.id === layout.activeChartId} compact={layout.grid === '4' || layout.grid === '2h'} theme={theme} onActivate={() => setActiveChart(c.id)} />
      ))}
    </div>
  );
}
