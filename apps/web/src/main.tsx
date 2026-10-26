import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { registerSW } from 'virtual:pwa-register';
import '@tvk/ui/tokens.css';
import './styles.css';
import { App } from './App';
import { useStore } from './state/store';
import { isTauri } from './lib/platform';

// Service workers are a web/PWA concern; the Mac app ships the bundle inside the .app.
if (!isTauri) registerSW({
  immediate: true,
  onNeedRefresh() {
    useStore.getState().pushToast({ kind: 'info', title: 'Update available', body: 'Reload to get the latest version.' });
  },
  onOfflineReady() {
    useStore.getState().pushToast({ kind: 'success', title: 'Ready offline', body: 'The app shell is cached. Live data still needs a connection.' });
  },
});

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
