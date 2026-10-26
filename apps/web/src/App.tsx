import { useEffect, useState } from 'react';
import { applyTheme } from '@tvk/ui';
import type { DrawingType } from '@tvk/shared-types';
import { useStore } from './state/store';
import { formFactor, type FormFactor } from './lib/platform';
import { TopBar } from './components/TopBar';
import { ChartGrid } from './components/ChartGrid';
import { Sidebar } from './components/Sidebar';
import { DrawingToolbar } from './components/DrawingToolbar';
import { Sheets } from './components/Sheets';
import { Toasts } from './components/Toasts';
import { TabBar } from './components/TabBar';
import { AlertEngine } from './data/alert-engine';
import { syncService } from './data/sync';

const TOOL_KEYS: Record<string, DrawingType> = { t: 'trendline', h: 'hline', r: 'ray', b: 'rect', f: 'fib', x: 'text' };

export function App() {
  const store = useStore();
  const layout = store.activeLayout();
  const themeSetting = useStore((s) => s.settings.theme);
  const [theme, setTheme] = useState<'dark' | 'light'>(() => applyTheme(themeSetting));
  const [ff, setFf] = useState<FormFactor>(() => formFactor());
  const [toolsOpen, setToolsOpen] = useState(false);
  const phone = ff === 'phone';

  useEffect(() => {
    setTheme(applyTheme(themeSetting));
    if (themeSetting !== 'system') return;
    const mq = window.matchMedia('(prefers-color-scheme: light)');
    const h = () => setTheme(applyTheme('system'));
    mq.addEventListener('change', h);
    return () => mq.removeEventListener('change', h);
  }, [themeSetting]);

  useEffect(() => {
    const onResize = () => setFf(formFactor());
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  useEffect(() => {
    const engine = new AlertEngine();
    engine.start();
    void syncService.start();
    return () => engine.dispose();
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.tagName === 'SELECT' || target.isContentEditable)) return;
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const s = useStore.getState();
      if (e.key === '/') {
        e.preventDefault();
        s.openSheet('symbol', { symbolTarget: 'chart' });
      } else if (TOOL_KEYS[e.key.toLowerCase()] && !s.ui.sheet) {
        s.setUi({ activeTool: s.ui.activeTool === TOOL_KEYS[e.key.toLowerCase()] ? null : TOOL_KEYS[e.key.toLowerCase()]!, selectedDrawingId: null });
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  return (
    <div className={`app ${ff}`} data-testid="app" data-form-factor={ff}>
      <TopBar phone={phone} theme={theme} />
      <div className="app-body">
        {!phone && <DrawingToolbar horizontal={false} />}
        <main className="main">
          <ChartGrid layout={layout} phone={phone} theme={theme} />
        </main>
        {!phone && store.ui.sidebarOpen && <Sidebar />}
      </div>
      {phone && toolsOpen && <DrawingToolbar horizontal />}
      {phone && <TabBar toolsOpen={toolsOpen} onToggleTools={() => setToolsOpen((v) => !v)} />}
      <Sheets phone={phone} />
      <Toasts />
    </div>
  );
}
