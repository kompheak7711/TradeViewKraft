# Build log

Order followed: app shell → chart + live crypto flow → stocks → gold/silver → remaining screens with all states.

| Phase | Commit | What landed | Verification |
| --- | --- | --- | --- |
| 0 Scaffold | `05c548b` | pnpm workspace, TS base config, shared types, market-data adapters + tests, chart-core + tests, ui tokens | `pnpm -r typecheck`, 43 unit tests |
| 1 App shell | `f4054a4` | Responsive shell (top bar, tool rail, grid, sidebar, tab bar, sheets, toasts), theme switching, zustand store with persistence | Screenshots at 1440/1024/390 |
| 2 Chart + crypto | `f4054a4` | `ChartFeed` pipeline, `ChartView` (5 chart types, log, panes), `DrawingOverlay`, indicators, symbol search, watchlist quotes | e2e `chart.spec.ts` |
| 3 Stocks | `ddfdf77` | Alpaca client (SSE + polling fallback), `api/stocks/*`, session labels, data-source notes | typecheck of `api/`; e2e in mock mode |
| 4 Gold/silver | `ddfdf77` | Metals client (60 s polling), `api/metals/*`, token-gold symbols in the catalog | typecheck; e2e in mock mode |
| 5 Remaining screens | `f4054a4` | Layouts sheet, alerts (engine + sheet + panel), settings, auth, loading/empty/error/disconnected/limited/closed states, PWA manifest + SW + icons | e2e `layout-sync-alerts.spec.ts`, Lighthouse |
| 6 Desktop | `58dce3e` | Tauri 2 shell, capabilities, icons, Cargo.lock | `cargo generate-lockfile` (compile needs a Mac) |
| 7 Quality | this commit | Contrast fixes, accessibility fixes (names, targets, font sizes, viewport), perf measurement, docs | contrast 32/32, Lighthouse 98/100/100, 42 e2e |

## Bugs found and fixed during the build
1. Watchlist/alerts selector returned a new array per render → React "maximum update depth" loop. Fixed with memoized selectors.
2. Switching timeframe batched the empty and loaded snapshots into one render; the chart compared history versions across two feeds and called `series.update` with an older bar → Lightweight Charts threw and unmounted the app. Fixed by keying snapshots per feed and forcing a full `setData` on key change.
3. Phone layout: chart panel had no `flex: 1` inside the phone grid → zero-height chart. Fixed.
4. Toolbar buttons shrank below 24 px in the scrollable toolbar → failed touch-target audit. Fixed with `flex: none`.
5. Accent-on-white and light-theme up/down colors below AA → tokens retuned (see design.md).

## Known limitations (v1)
- Text drawing uses the browser `prompt()` for its content (works in Safari PWA and Tauri; a custom popover is a v1.1 polish item).
- In the 4-chart grid the legend can overlap the first candles on small panels; indicator rows can be hidden per indicator.
- Kraken REST returns at most 720 bars per interval; the data note says so.
- Live exchange/provider traffic could not be exercised in the build sandbox (network policy); see test-report.md.
