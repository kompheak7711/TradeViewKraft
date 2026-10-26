export const isTauri = typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;
export const isIOS = typeof navigator !== 'undefined' && /iP(hone|ad|od)/.test(navigator.userAgent) || (typeof navigator !== 'undefined' && navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1 && !isTauri);
export const isStandalone = typeof window !== 'undefined' && (window.matchMedia?.('(display-mode: standalone)').matches || (navigator as unknown as { standalone?: boolean }).standalone === true);
export const isTouch = typeof window !== 'undefined' && window.matchMedia?.('(pointer: coarse)').matches;

export type FormFactor = 'phone' | 'tablet' | 'desktop';

export function formFactor(width = typeof window !== 'undefined' ? window.innerWidth : 1280): FormFactor {
  if (width < 720) return 'phone';
  if (width < 1100) return 'tablet';
  return 'desktop';
}

const params = typeof location !== 'undefined' ? new URLSearchParams(location.search) : new URLSearchParams();
export const DATA_MODE: 'live' | 'mock' = params.get('mock') === '1' ? 'mock' : (import.meta.env.VITE_DATA_MODE === 'mock' ? 'mock' : 'live');
export const RELAY_BASE: string = (import.meta.env.VITE_RELAY_BASE ?? '').replace(/\/$/, '');
