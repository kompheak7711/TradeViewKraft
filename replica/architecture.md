# Architecture

## System view

```
┌────────────────────────────── client (web / PWA / Tauri) ──────────────────────────────┐
│ React UI ── zustand store (local-first, persisted) ── SyncService ──► Supabase (RLS)   │
│     │                                                                                   │
│ ChartFeed (per chart) ── CandleBuilder ◄── ticks ── ProviderRegistry                    │
│     │                                           ├─ Binance  ─ WS + REST  ──────────────┼─► exchanges (direct)
│ ChartView (Lightweight Charts) + DrawingOverlay ├─ Coinbase/Kraken/Bybit/OKX ───────────┼─► exchanges (direct; REST may fall back to /api/proxy)
│ QuoteHub (watchlist) · AlertEngine             ├─ Alpaca client ── SSE + REST ─────────┼─► Vercel Functions ─► Alpaca (key server-side)
│                                                └─ Metals client ── REST polling ───────┼─► Vercel Functions ─► Twelve Data (key server-side)
└─────────────────────────────────────────────────────────────────────────────────────────┘
```

## Packages

| Package | Responsibility | Key modules |
| --- | --- | --- |
| `@tvk/shared-types` | Contracts: `SymbolId` (`EXCHANGE:SYMBOL`), `Tick`, `Candle`, `Timeframe`, `MarketDataProvider`, persisted models (`Layout`, `Watchlist`, `PriceAlert`, `UserSettings`) | `src/index.ts` |
| `@tvk/market-data` | Everything about getting data | `symbols.ts` (parse/normalize/search), `candles.ts` (bucketing, builder, merge, aggregate, Heikin Ashi), `reconnecting-ws.ts`, `http.ts` (fetch injection + relay fallback), `providers/*`, `registry.ts` |
| `@tvk/chart-core` | Pure chart math | `indicators.ts`, `drawings.ts` (geometry, hit-test, fib), `timeframes.ts` (time ↔ logical index) |
| `@tvk/ui` | Tokens, theme, icons, primitives | `tokens.css`, `theme.ts`, `icons.tsx`, `components.tsx` |
| `apps/web` | The app + Vercel Functions | `src/state/store.ts`, `src/data/*`, `src/chart/*`, `src/components/*`, `api/*` |
| `apps/desktop` | Tauri shell | `src-tauri/*` |

## Data flow for one chart

1. `ChartPanel` mounts `useChartFeed(symbol, timeframe)` → `new ChartFeed(...)`.
2. `ChartFeed.start()` resolves the provider from the registry, loads `resolveSymbol` + `getHistory(limit 500)` in parallel, seeds the `CandleBuilder`, emits a snapshot (`historyVersion = 1`).
3. `provider.subscribeTicks` delivers `Tick`s → `CandleBuilder.applyTick` → snapshot with `lastUpdate` (cheap `series.update`) or a new bucket (array grew).
4. Feed state transitions (`connecting → live → stale/disconnected → live`) trigger `backfill()` on recovery: fetch from the last candle time, merge, fill interior gaps, bump `historyVersion` (full `setData`, viewport preserved).
5. Scrolling to the left edge calls `loadMore()` → older page merged in front; `ChartView` shifts the visible logical range by the number of prepended bars.
6. Snapshots carry a `key` (`symbol|timeframe`); `ChartView` forces a full reset whenever the key changes so a batched React render can never apply an incremental update from a different feed.

## Provider contract

Every provider implements `MarketDataProvider`: `searchSymbols`, `resolveSymbol`, `getHistory`, `subscribeTicks(symbol, onTick, onState)`, optional `getQuote`/`getSession`, `dispose`. Crypto adapters share `TradeStream` (one multiplexed socket per exchange with subscribe/unsubscribe payloads, ping payloads and stale thresholds per exchange). Non-crypto adapters talk to the relay.

| Exchange | REST history | Stream | Ping / heartbeat | Notes |
| --- | --- | --- | --- | --- |
| Binance | `/api/v3/klines` 1000 bars, all 13 timeframes | `stream.binance.com:9443/stream` `<sym>@trade` | server pings; stale 120 s | never relayed (451) |
| Coinbase | `/products/{id}/candles` 300 bars; native 1m 5m 15m 1h 6h 1D → aggregated | `ws-feed` `matches` + `heartbeat` | heartbeat 1 s; stale 30 s | |
| Kraken | `/0/public/OHLC` last 720 bars only | `ws.kraken.com/v2` `trade` | heartbeat 1 s | REST pair alt names; WS uses `BTC/USD` |
| Bybit | `/v5/market/kline` 1000 bars | `stream.bybit.com/v5/public/spot` `publicTrade.<sym>` | client `{op:"ping"}` every 20 s | |
| OKX | `/api/v5/market/candles` + `history-candles` 300 bars | `ws.okx.com:8443/ws/v5/public` `trades` | client `"ping"` every 25 s | UTC-aligned bars for ≥6h |
| Alpaca (relay) | `/api/stocks/bars` (paginated server-side) | `/api/stocks/stream` SSE (`trade`, `status`, `end`) | SSE comment every 15 s; function ends at 280 s | 406 → polling `/api/stocks/snapshot` |
| Twelve Data (relay) | `/api/metals/bars` | `/api/metals/quote` polled 60 s | — | edge cache 55 s |

## State and persistence

- `useStore` (zustand + `persist`): layouts (charts with indicators and drawings), watchlists, alerts, settings, UI state, sync state and a `revision` counter bumped on every persisted mutation.
- `SyncService`: pull → merge by `updatedAt` → push (debounced 1.2 s on revision change) → realtime subscription. Deletions are reconciled by deleting rows whose ids no longer exist locally.
- Quotes live in a separate `useQuotes` store fed by `QuoteHub` (shared subscriptions across watchlist rows and charts).

## Responsive shell

`formFactor()` → `phone` (< 720 px): tab bar, single chart, sheets; `tablet` (< 1100 px): rail + chart + 260 px panel; `desktop`: rail + grid + 300 px panel. Safe-area insets via `env(safe-area-inset-*)`, `100dvh`, `viewport-fit=cover`.

## Error handling map

| Failure | Detection | UX | Recovery |
| --- | --- | --- | --- |
| WS drop | `onclose`, stale timer | badge `Disconnected`/`Stale`, banner | backoff reconnect, resubscribe, backfill |
| iOS background/sleep | `visibilitychange`, `pageshow`, `online`, `focus` | — | immediate reconnect + backfill, metals re-poll |
| History HTTP error | `HttpError` | error panel with Retry / Change symbol | manual retry |
| CORS blocked (browser) | `TypeError` on fetch | — | retry through `/api/proxy` (allow-listed hosts) |
| Alpaca 406/405 | SSE `status` | badge `Limited` + banner | 5 s polling |
| Missing relay key | SSE/REST `no_key` | badge `Error` with message | — |
| Twelve Data 429 | REST 429 | badge `Limited` "quota exhausted" | keep last prices, keep polling |
| Function timeout / cold start | SSE `end`, HTTP 504 | brief `Connecting` | reconnect without backoff on `end` |

## Security

- Secrets only in Vercel env (`ALPACA_*`, `TWELVEDATA_API_KEY`); never prefixed `VITE_`.
- `/api/proxy` allow-lists four hosts and read-only market paths; Binance excluded.
- Supabase RLS on all tables; anon key is public by design.
- Tauri capability scopes HTTP to exchange hosts, `*.vercel.app` and `*.supabase.co`; strict CSP.
