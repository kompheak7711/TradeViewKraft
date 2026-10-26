# Test report

Environment: Linux sandbox, Node 22, pnpm 10, Chromium 1243 (Playwright). Exchange/provider hosts were unreachable
(proxy 403), so every end-to-end run used the deterministic mock provider (`?mock=1`); adapter parsing is covered by
unit tests with recorded message shapes.

## Unit tests (`pnpm test`) — 52 passed
| Package | Tests | Covers |
| --- | --- | --- |
| @tvk/market-data | 29 | symbol parsing/normalization/search, native symbol mapping, bucketing (incl. ISO weeks, months), candle builder (ticks, late ticks, klines, backfill merge, gaps), aggregation, Heikin Ashi, reconnecting socket (backoff, resubscribe, stale, ping), five exchange stream parsers, mock determinism, registry routing |
| @tvk/chart-core | 14 | SMA, EMA seeding, stddev/Bollinger, RSI (Wilder textbook values), MACD/signal/histogram, VWAP session reset, indicator dispatch, fib levels, ray extension, segment distance, hit-testing (line/handle/rect/hline), translate, time↔logical mapping |
| @tvk/web | 9 | alert condition evaluation (all 5 conditions, disabled), store: symbol change scoping, grid changes, layouts save/load/delete, watchlist idempotence, alert trigger/disable, revision semantics |

## End-to-end (`pnpm --filter @tvk/web test:e2e`) — 42 passed (14 scenarios × desktop 1440×900, iPad 1024×768 touch, iPhone 390×844 touch)
1. open chart (live badge, legend)
2. switch symbol across crypto (COINBASE:SOLUSD), stocks (NASDAQ:AAPL) and metals (METALS:XAUUSD)
3. exchange-prefixed input with separators (`kraken:eth/usd`)
4. switch timeframe via quick bar and grouped menu (15m, 1M)
5. switch chart types + log scale
6. add indicators (RSI, Bollinger) and remove one from the legend
7. draw a trend line and a horizontal line, select, delete, persist across reload
8. load older history by scrolling left
9. multi-chart layouts (2h, 4 with independent symbols) / phone quick switch
10. save a layout and open it in a second session (shared account storage)
11. watchlist live price/change, add symbol, click-to-chart
12. create an alert and see it trigger (toast, panel state)
13. theme toggle persists
14. PWA manifest (`standalone`, icons) and service worker served

Engine note: the sandbox has no WebKit build; the config supports `E2E_WEBKIT=1` (iPad/iPhone projects on WebKit) for a
Mac or CI (`.github/workflows/ci.yml` installs chromium + webkit). Run against a Vercel preview with `E2E_BASE_URL`.

## Lighthouse 12 (mobile profile, preview build, mock data)
Performance 98 · Accessibility 100 · Best practices 100. FCP 1.9 s, LCP 2.1 s, TBT 30 ms, CLS 0.004.
Lighthouse 12 no longer ships a PWA category; installability is covered by the manifest/SW test and the Safari install
steps in the README. Initial audit failures (button names, prohibited ARIA, touch targets, 11 px text, `user-scalable=no`,
accent contrast) were all fixed.

## Design tokens contrast (`python3 scripts/contrast.py`)
32/32 checks pass (both themes). Initial failures: white on accent (3.2:1), `border-strong` (1.8:1), light-theme
up/down small text (3.2 / 4.3) → retuned.

## Performance
`node apps/web/scripts/perf.mjs` with live mock ticks (500 ms per chart):
| Scenario | fps | p95 frame | p99 frame | frames > 50 ms |
| --- | --- | --- | --- | --- |
| Mac 1440×900, 4 charts | 60.0 | 16.7 ms | 16.8 ms | 0 |
| iPad 1024×768, 2 charts | 60.0 | 16.7 ms | 16.8 ms | 0 |

## Bugs
Severity: S1 blocker, S2 major, S3 minor, S4 cosmetic.

| ID | Sev | Status | Description |
| --- | --- | --- | --- |
| B1 | S1 | fixed | Render loop from non-memoized store selectors |
| B2 | S1 | fixed | App unmounted on timeframe switch (incremental update across feeds) |
| B3 | S2 | fixed | Phone chart area collapsed to zero height |
| B4 | S3 | fixed | Toolbar buttons shrank below touch-target size |
| B5 | S3 | fixed | Contrast failures in both themes |
| B6 | S3 | open | Text drawing uses `window.prompt` instead of an inline editor |
| B7 | S4 | open | Legend overlaps the first candles on compact 4-chart panels |
| B8 | S2 | open (unverifiable here) | Live adapters (Binance/Coinbase/Kraken/Bybit/OKX, Alpaca SSE, Twelve Data) not exercised against real endpoints; first smoke test must run on a networked machine |
| B9 | S2 | open (unverifiable here) | Tauri app not compiled (Linux sandbox lacks webkit2gtk); manifest resolves, code follows the Tauri 2 plugin APIs |

No S1 bugs open. S2 items B8/B9 are environment-blocked, not code defects found.
