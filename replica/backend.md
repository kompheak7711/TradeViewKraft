# Backend (Vercel Functions + Supabase)

## Functions (`apps/web/api`)

| Route | Purpose | Upstream | Caching | Limits handled |
| --- | --- | --- | --- | --- |
| `GET /api/health` | Config check (`stocks`, `metals` booleans, region) | — | no-store | — |
| `GET /api/proxy?url=` | Read-only CORS relay for Bybit, OKX, Kraken, Coinbase public market paths | allow-listed hosts | 5 s edge | 403 on any other host/path; Binance excluded (451) |
| `GET /api/stocks/bars` | OHLCV bars (`1Min`…`1Month`), `end`/`start` paging | Alpaca `/v2/stocks/{s}/bars` when Alpaca keys exist; otherwise Twelve Data `time_series` (aggregated for 3m/6h/12h) | 10 s live / 300 s paged (Alpaca); 50 s / 600 s (Twelve Data) | symbol/timeframe validation |
| `GET /api/stocks/snapshot?symbols=` | Last trade + previous close for up to 50 symbols | Alpaca `/v2/stocks/snapshots`, or Finnhub `/quote` per symbol | 3 s edge (Alpaca); 5 s edge + 10 s memo (Finnhub) | polling fallback target |
| `GET /api/stocks/search?q=` | Ticker/name search | Alpaca `/v2/assets` (memoized 1 h), or Finnhub `/search?exchange=US` | 1 h edge | — |
| `GET /api/stocks/stream?symbols=` | **SSE** trades (`trade`, `status`, `end` events), ≤ 30 (Alpaca) / 50 (Finnhub) symbols | Alpaca WS `wss://stream.data.alpaca.markets/v2/iex`, or Finnhub WS `wss://ws.finnhub.io` | none | 406 → `connection_limit`, 405 → `symbol_limit`, ends at 280 s before `maxDuration` 300 s |
| `GET /api/metals/quote?symbols=` | XAU/USD, XAG/USD spot + previous close | Twelve Data `/quote` | 55 s edge + memo | 429 → `rate_limited` |
| `GET /api/metals/bars?symbol=&timeframe=` | Spot OHLC (aggregated for 3m/6h/12h) | Twelve Data `/time_series` | 50 s live / 600 s paged + memo | 429 → `rate_limited` |

Cross-cutting: CORS for `tauri://localhost`, `http://tauri.localhost`, localhost dev ports and `RELAY_ALLOWED_ORIGINS`;
`AbortSignal` timeouts (10 s) → 504; `UpstreamError` mapping (429 → 429, else 502); per-instance memoization on top of
`s-maxage` CDN caching so many devices share one upstream call.

### Why SSE and not a WebSocket relay
Vercel Functions terminate HTTP requests; they do not accept WebSocket upgrades. A streaming response is the closest
equivalent: same server-side secret handling, same "connection closes at max duration" behaviour. The client reconnects
immediately on the `end` event (no backoff), re-subscribes with the current symbol set and backfills from REST, so the
chart shows no gap. iOS Safari suspends `EventSource` in the background; `visibilitychange`/`pageshow` re-open it.

## Supabase

- `supabase/migrations/0001_init.sql`: tables `layouts`, `watchlists`, `alerts` (`id text pk, user_id uuid, data jsonb, updated_at`), `settings` (`user_id pk`), indexes, RLS policies (select/insert/update/delete `auth.uid() = user_id`), realtime publication.
- Auth: email magic link (`signInWithOtp`), redirect to the app origin; the Mac app needs `tauri://localhost` in the redirect allow-list.
- Client sync: `apps/web/src/data/sync.ts` — pull/merge/push/realtime as described in architecture.md.
- Free-plan caveat: projects pause after 7 days without activity; the app keeps working locally and re-syncs on restore.

## Environment variables
See `apps/web/.env.example`. Server-side: `FINNHUB_API_KEY`, `TWELVEDATA_API_KEY`, optional `ALPACA_KEY_ID`, `ALPACA_SECRET_KEY`, `ALPACA_FEED`,
`RELAY_ALLOWED_ORIGINS`. Client-safe: `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, `VITE_RELAY_BASE`, `VITE_DATA_MODE`.

## Deployment configuration
`apps/web/vercel.json`: framework Vite, `pnpm install --frozen-lockfile`, `pnpm run build`, output `dist`, Functions
`maxDuration: 300` / 1024 MB, SPA rewrite excluding `/api` and PWA assets, immutable caching for `/assets`, no-cache for `sw.js`.
Vercel project setting **Root Directory = `apps/web`**; production from `main`, previews for every branch.
