export type ThemeName = 'dark' | 'light' | 'system';

export function resolveTheme(theme: ThemeName): 'dark' | 'light' {
  if (theme !== 'system') return theme;
  if (typeof window !== 'undefined' && window.matchMedia?.('(prefers-color-scheme: light)').matches) return 'light';
  return 'dark';
}

export function applyTheme(theme: ThemeName): 'dark' | 'light' {
  const resolved = resolveTheme(theme);
  if (typeof document !== 'undefined') {
    document.documentElement.setAttribute('data-theme', resolved);
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute('content', resolved === 'dark' ? '#0b0f17' : '#f4f6fa');
  }
  return resolved;
}

/** Read a CSS variable from :root (after the theme is applied). */
export function cssVar(name: string, fallback = ''): string {
  if (typeof getComputedStyle === 'undefined') return fallback;
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim() || fallback;
}

/** Chart colors derived from the active theme tokens. */
export function chartPalette(): { bg: string; text: string; grid: string; border: string; up: string; down: string; crosshair: string; accent: string } {
  return {
    bg: cssVar('--bg-elev', '#111827'),
    text: cssVar('--text-muted', '#9aa9c2'),
    grid: cssVar('--grid', '#1a2232'),
    border: cssVar('--border', '#253147'),
    up: cssVar('--up', '#1fc37f'),
    down: cssVar('--down', '#f4527a'),
    crosshair: cssVar('--crosshair', '#6f7f9a'),
    accent: cssVar('--accent', '#4f8cff'),
  };
}
