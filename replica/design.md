# Design

Own visual language: a cool-dark workspace with a single blue accent, green/rose price colors tuned for WCAG AA, 13 px
UI type on desktop (14 px on phones), 6–14 px radii, 1 px hairline borders. No TradingView assets, colors or copy.

Screenshots: `replica/screenshots/` (`mac-*`, `ipad-*`, `iphone-*`, dark and light).

## Tokens (`packages/ui/src/tokens.css`)

| Token | Dark | Light | Use |
| --- | --- | --- | --- |
| `--bg` | #0b0f17 | #f4f6fa | app background |
| `--bg-elev` | #111827 | #ffffff | panels, chart background |
| `--surface` / `--surface-2` | #151d2c / #1b2536 | #ffffff / #eef2f8 | cards, chips, menus |
| `--border` / `--border-strong` | #253147 / #55678a | #d9e0ea / #8794ad | hairlines / control borders (≥ 3:1) |
| `--text` / `--text-muted` / `--text-faint` | #e8eef8 / #9aa9c2 / #6f7f9a | #0f172a / #4b5a73 / #7b8aa3 | body / secondary / tertiary |
| `--accent` / `--accent-strong` / `--accent-text` | #2f6fe6 / #2860cf / #7fb0ff | #2563eb / #1d4ed8 / #1d4ed8 | buttons, active states / small accent text |
| `--up` / `--down` | #1fc37f / #f4527a | #0b7a4e / #c2255c | price up / down |
| `--warn` / `--info` | #f5b041 / #58b6f0 | #b45309 / #0369a1 | warnings, info banners |
| `--grid` / `--crosshair` | #1a2232 / #6f7f9a | #e6ebf3 / #7b8aa3 | chart grid / crosshair |

Spacing scale 4/8/12/16/24; radii 6/10/14; `--topbar-h` 48, `--toolbar-h` 40, `--sidebar-w` 300 (260 on tablet),
`--tabbar-h` 56, minimum touch target 44 px on coarse pointers (buttons grow to 36 px, rows to 44 px).

Contrast: `python3 scripts/contrast.py` → all 32 checks pass (text ≥ 4.5:1, UI components ≥ 3:1) in both themes.
Lighthouse accessibility 100 on the mobile profile.

## Typography and icons

System font stack (`Inter` when installed, else `-apple-system`/SF, Segoe UI, Roboto) so the PWA shell is fully
offline. Tabular numerals for prices (`.num`). Icons are our own 24 px, 1.8 px stroke SVGs in `packages/ui/src/icons.tsx`.

## Layout specs

### Mac window (≥ 1100 px)
- Top bar 48 px: brand · symbol search (`/`) · grid picker (1 / 2h / 2v / 4) · layouts · watchlist/alerts toggles · theme · account · settings.
- Left tool rail 48 px: cursor + 6 drawing tools, delete selected, clear.
- Chart grid fills the remainder; each panel: 40 px toolbar (symbol, 7 quick timeframes + menu, chart type, indicators, log, alert, status badge), legend overlay, chart.
- Right panel 300 px with Watchlist / Alerts tabs. Active panel in multi-chart grids has a 2 px accent outline.

### iPad landscape (1024 × 768) and portrait (768 × 1024)
- Same shell with a 260 px panel; in portrait the panel can be hidden from the top bar toggles.
- 2-chart layouts recommended; 4 works but toolbars switch to compact (fewer quick timeframes, data note hidden).
- Touch: 36 px buttons, 44 px rows, enlarged drawing hit tolerance (12 px), tap-tap drawing.

### iPhone (390 × 844, safe areas)
- Top bar: brand mark, search, layouts, theme, account, settings.
- Single chart with compact toolbar (5 quick timeframes + menu); chart strip (chips) appears when the active layout has several charts.
- Bottom tab bar (56 px + home-indicator inset): Chart · Draw (toggles a horizontal tool strip) · Watchlist · Alerts · Settings. Watchlist/alerts/settings open as bottom sheets (≤ 92 dvh, rounded top).
- Fonts: body 14 px, small 12 px (no text below 12 px except canvas axis labels).

## States

Loading spinner with label; empty states with icon, title, hint and primary action; error panel with Retry and Change
symbol; disconnected/limited/error banners pinned above the time scale; feed badge colors: live green, stale/limited/connecting
amber, disconnected/error rose, closed grey.

## Motion
120–160 ms ease-out for menus, sheets and toasts; price flashes recolor for 400 ms; no motion on chart data updates
(the renderer handles smooth pan/zoom).
