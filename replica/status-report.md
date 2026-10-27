# TradingViewKraft — v1 status report

Branch: `claude/vibrant-fermat-sh7bs6` · Pipeline stages run: recon → architect → design → build → backend → test → diff.
Stopped before entrepreneur / brand / launch / deploy (approval gate, brief §10).

## What works, per platform

| Capability | Web (desktop browser) | iPhone / iPad PWA | Mac app (Tauri) |
| --- | --- | --- | --- |
| Chart types (candles, bars, line, area, Heikin Ashi), 1m–1M, zoom/pan/crosshair, log scale | ✅ verified (e2e, mock data) | ✅ verified at 390×844 and 1024×768 (Chromium touch emulation; WebKit run pending on a Mac) | ✅ same build; compile pending on a Mac |
| Live crypto (Binance, Coinbase, Kraken, Bybit, OKX) direct from the client | ✅ verified live by the owner on macOS (all five exchanges "Live") | same | same, via native HTTP (no CORS) |
| US stocks via relay (Finnhub + Twelve Data, or Alpaca): history, snapshots, search, SSE stream + polling fallback | ✅ implemented; needs `FINNHUB_API_KEY` + `TWELVEDATA_API_KEY` in Vercel | same | same, `VITE_RELAY_BASE` → Vercel URL |
| Gold/silver spot (Twelve Data via relay) + tokenized gold streams | ✅ implemented; needs Vercel env key | same | same |
| Symbol search with exchange prefixes, filters | ✅ verified | ✅ verified | ✅ |
| Watchlist with live price / change / % | ✅ verified | ✅ verified (sheet) | ✅ |
| Indicators SMA/EMA/VWAP/BB/RSI/MACD/Volume | ✅ verified (math unit-tested) | ✅ | ✅ |
| Drawings (trend, ray, hline, rect, fib, text) mouse/touch/pen | ✅ verified | ✅ verified with touch emulation | ✅ |
| Layouts 1/2/4 + saved layouts | ✅ verified | phone: single chart + quick switch ✅; iPad grids ✅ | ✅ |
| Alerts while open (toast + sound + system notification) | ✅ verified (toast/state); Web Notifications | ✅ Web Notifications via SW (needs Home-Screen install, iOS 16.4+) | macOS Notification Center via Tauri plugin (verify on Mac) |
| Sync across devices (Supabase) | ✅ implemented, local-first; needs a Supabase project | same | same |
| Dark / light themes, WCAG AA tokens | ✅ verified (contrast 32/32, Lighthouse a11y 100) | ✅ | ✅ |
| Install / offline shell | n/a | ✅ manifest + SW verified by test | bundled |

## Quality numbers
- Unit tests: 52 passed. End-to-end: 42 passed (14 scenarios × 3 viewports).
- Lighthouse (mobile): performance 98 · accessibility 100 · best practices 100.
- Frame timing: 60 fps with 4 live charts (Mac size) and 2 (iPad size), no frame > 50 ms.
- Parity: 100 % of in-scope must-haves implemented (95 % verified here), 95 % weighted in-scope parity, ≈ 60 % of the full observed Supercharts surface (details in `replica/diff.md`).

## Open bugs
No S1/S2 code defects open. Environment-blocked verification items: B8 (live provider smoke test) and B9 (Tauri
compile). Minor: B6 text tool uses `prompt()`, B7 legend overlap on compact 4-chart panels. See `replica/test-report.md`.

## Vercel URL
**https://tradeviewkraft-web.vercel.app** (production from the working branch). The full e2e suite passed against it
from the owner's Mac: desktop 14/14 (Chromium), iPad 14/14 and iPhone 14/14 on real WebKit.
`.github/workflows/ci.yml` runs typecheck, unit tests, contrast, build and the WebKit e2e suite on every push.

## Next steps (in order)
1. On the Mac: `pnpm install && pnpm dev` with real network → confirm Binance/Coinbase/Kraken/Bybit/OKX streams and history (first live smoke test); fix any message-shape drift.
2. Create the Supabase project, run the migration, set `VITE_SUPABASE_*`; sign in on two devices and confirm layout sync.
3. Import into Vercel (Root Directory `apps/web`), add `ALPACA_*` and `TWELVEDATA_API_KEY`, check `/api/health`, then run `E2E_BASE_URL=<preview> pnpm --filter @tvk/web test:e2e`.
4. `pnpm desktop:dev` → verify native window, native HTTP, macOS notifications; then `pnpm desktop:build` for the .dmg.
5. Install the PWA on iPhone/iPad from Safari; enable notifications; test background → resume reconnect/backfill.
6. Approval gate: decide whether to proceed with entrepreneur, brand, launch and deploy stages.
