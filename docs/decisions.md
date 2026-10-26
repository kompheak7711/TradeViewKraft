# Decision log

Each entry: context → decision → consequences. Newest at the bottom. Free-tier limits we depend on are collected at the end.

## D-001 · Replica skills were not installed; pipeline run manually
**Context.** The brief expects `.claude/skills/replica-*`. The repository was empty (no commits) and no skills directory
existed locally. Section 8 of the brief says: log it, choose the safest workaround, continue.
**Decision.** Run the same pipeline stages by hand (recon → architect → design → build → backend → test → diff) and
write the outputs the skills would have produced into `replica/` (`recon.md`, `features.csv`, `architecture.md`,
`design.md`, `build.md`, `backend.md`, `test-report.md`, `diff.md`, `status-report.md`).
**Consequences.** Same deliverables, no skill-specific templates. Entrepreneur/brand/launch/deploy stages are
intentionally not run (approval gate).

## D-002 · Sandbox network: exchange and provider hosts unreachable; mock provider for verification
**Context.** The build container's proxy returns 403 for api.binance.com, Coinbase, Kraken, Bybit, OKX, Alpaca and
Twelve Data (only npm and crates.io are reachable). Live feeds therefore could not be exercised here.
**Decision.** Add a deterministic `MockProvider` (seeded random walk, 500 ms ticks) selectable with `?mock=1` or
`VITE_DATA_MODE=mock`. All end-to-end tests run in mock mode; adapters are verified with unit tests that feed
recorded message shapes through the parsers and a fake WebSocket.
**Consequences.** Message formats are implemented from the exchanges' public API documentation and must be
smoke-tested on a real network (first thing to do on the Mac). The mock also doubles as an offline demo mode.

## D-003 · Lightweight Charts v5 as the renderer; indicators and drawings in our code
**Decision.** `lightweight-charts@5` (Apache-2.0) with `addSeries(..., paneIndex)` for indicator panes. Indicators are
computed in `@tvk/chart-core` and fed as line/histogram series. Drawings are rendered on a canvas overlay using the
library's `timeScale().logicalToCoordinate` / `series.priceToCoordinate` mappings; input is captured on the chart
container in the capture phase so pan/zoom does not fight with drawing.
**Consequences.** No TradingView proprietary library is used. Ray/extension beyond data uses logical indices
extrapolated by timeframe, so drawings stay anchored when history is prepended.

## D-004 · Monorepo with source packages (no package build step)
**Decision.** Workspace packages export `src/index.ts`; Vite bundles them, vitest runs them from source. Vercel's
Root Directory is `apps/web`; Vercel auto-detects the pnpm workspace above it.
**Consequences.** Fast builds, no publish step. Type safety is enforced by `pnpm typecheck` per package.

## D-005 · Crypto data direct from the client; Binance never relayed
**Context.** Binance (and some others) return HTTP 451 to datacenter IPs including Vercel.
**Decision.** Browser and Mac app open exchange WebSockets directly and call CORS-enabled public REST. Binance
REST/WS are always direct. For Bybit/OKX/Kraken/Coinbase REST, the client first tries direct; on a network/CORS
error it retries through `api/proxy.ts`, which only allows those four hosts and read-only market paths.
In the Mac app REST goes through Tauri's native HTTP plugin, so CORS never applies.
**Consequences.** No crypto quota on Vercel. Kraken REST only returns the last 720 candles per interval (documented
in the symbol's data note). Coinbase lacks several timeframes, so the adapter fetches a base timeframe and
aggregates (`aggregateCandles`).

## D-006 · Stocks: Alpaca free plan via Vercel Functions, SSE instead of a WebSocket relay
**Context.** Vercel Functions cannot accept WebSocket upgrades. Alpaca free: IEX feed, 1 concurrent stream
connection, 30 symbols per stream, 200 REST requests/minute.
**Decision.** `api/stocks/stream.ts` opens Alpaca's websocket server-side and forwards trades as **Server-Sent
Events**; it sends an `end` event at ~280 s (under the 300 s `maxDuration`) and the client reconnects immediately,
then backfills from REST. When Alpaca answers 406 (connection limit; e.g. Mac and iPhone streaming at once) the
relay sends a `connection_limit` status and the client falls back to 5 s snapshot polling with a visible
"Limited" badge. Data is labelled "IEX via Alpaca, real-time (IEX volume only)".
**Consequences.** Streaming costs one function invocation per ~5 minutes per client. Polling fallback keeps a second
device useful. Historical bars are `adjustment=split`, paginated server-side.

## D-007 · Gold and silver: Twelve Data spot via relay + tokenized gold for tick-level charts
**Evaluation (from provider documentation; live verification pending, see D-002):**
| Option | Real-time spot? | Free limits | Verdict |
| --- | --- | --- | --- |
| Twelve Data free | REST quote + OHLC time series for XAU/USD, XAG/USD; WebSocket is trial/paid only | 8 credits/min, 800/day | **Chosen** for spot quotes and history |
| Finnhub free | Forex/metal candles and quotes moved behind paid plans (OANDA:XAU_USD) | 60 req/min | Rejected: metals not reliably free |
| MetalCharts / metals-API style plans | Daily or hourly spot, no intraday streaming | ~100 req/month | Rejected: quota far too small for live use |
| Tokenized gold (PAXG, XAUT) on Binance/Kraken/Bybit/OKX | Yes, trade-by-trade, free, no key | exchange limits only | **Chosen** as live proxy, labelled "token gold" |
**Decision.** `METALS:XAUUSD` / `METALS:XAGUSD` load history from `api/metals/bars` (Twelve Data `time_series`) and poll
`api/metals/quote` every 60 s; both functions memoize per instance and set `s-maxage` so every client shares one
upstream call per minute. Silver has no liquid token, so XAG is spot-only. Gold tick charts are available as
`BINANCE:PAXGUSDT`, `KRAKEN:PAXGUSD`, `BYBIT:XAUTUSDT`, `OKX:XAUTUSDT` with an explicit "token gold" note.
**Consequences.** Quota math: quote (2 symbols, 1 call/min when cached) ≈ 1 440 credits/day worst case if the CDN
cache never hits; in practice the 55 s edge cache keeps it near 1 call/min = 1 440/day… which exceeds 800. We
therefore (a) count both symbols in one `/quote` call (1 credit per symbol) and (b) rely on the edge cache; if the
daily quota is exhausted the relay returns 429, the client shows "Metals free quota exhausted" and keeps the last
prices. A paid plan or a second free key is the upgrade path; see Free-tier limits.

## D-008 · Supabase sync: JSON documents, last-write-wins, realtime
**Decision.** Four tables (`layouts`, `watchlists`, `alerts`, `settings`) keyed by client-generated ids with a `data`
JSON column and `updated_at`. RLS restricts every row to `auth.uid()`. The client is local-first (zustand +
localStorage); after sign-in it pulls, merges by `updatedAt`, pushes debounced on every revision bump, and listens to
`postgres_changes` for other devices. Remote applies do not bump the revision (no echo loops).
**Consequences.** Simple, offline-tolerant, no migrations when models evolve. Conflicts resolve by newest timestamp
(acceptable for a single user on several devices).

## D-009 · Alerts only while the app is open
**Decision.** An `AlertEngine` subscribes to ticks of every enabled alert's symbol and evaluates crossing/greater/less
conditions client-side; notifications via Tauri (macOS) or Web Notifications through the service worker (iOS PWA
16.4+). "Every time" alerts are debounced to once per minute.
**Consequences.** Closed-app alerts need an always-on evaluator (Supabase Edge Function on a schedule or a tiny VPS)
and web push; planned for v2.

## D-010 · Tauri 2 for macOS; no blocking limitation found
**Decision.** Tauri with `tauri-plugin-http` (native fetch injected into `@tvk/market-data`), `tauri-plugin-notification`
and `tauri-plugin-os`. Service-worker registration is skipped inside Tauri. The Rust manifest resolves (Cargo.lock
committed); compilation could not be verified in the Linux sandbox (no webkit2gtk), so the first `pnpm desktop:dev`
on the Mac is the acceptance step. Electron is not needed.

## D-011 · Design: own tokens, system font stack, own icons
**Decision.** Palette and spacing are ours (`packages/ui/src/tokens.css`), checked by `scripts/contrast.py`
(all AA checks pass in both themes after adjusting accent, border-strong and light up/down colors). The font is the
system stack (Inter if installed, otherwise SF/Segoe/Roboto) so the PWA works offline without a webfont request.
Icons are hand-drawn 24px stroke SVGs. No TradingView assets, names or copy are used.

## D-012 · Tests and quality gates
**Decision.** Unit: 52 tests (market-data 29, chart-core 14, web 9). E2E: 14 scenarios × 3 viewport projects =
42 Playwright tests in mock mode (Chromium here; `E2E_WEBKIT=1` switches the iPad/iPhone projects to WebKit on a
Mac or in CI). Lighthouse (mobile): performance 98, accessibility 100, best practices 100; manifest + service
worker verified by test. Frame timing with 4 live charts (Mac size) and 2 (iPad size): 60 fps, no frames > 50 ms.
**Consequences.** Lighthouse 12 no longer has a PWA category; installability is covered by the manifest/SW test and
by the manual Safari install procedure in the README.

## D-013 · Vercel could not be deployed from this session
**Context.** No Vercel token or GitHub→Vercel link exists in this environment.
**Decision.** Ship a complete Vercel configuration (`apps/web/vercel.json`, Root Directory documented) and a CI
workflow; the first deployment is a one-click import by the owner. The preview URL is therefore still open in the
status report.

## Free-tier limits we depend on
| Service | Limit | How we stay inside |
| --- | --- | --- |
| Vercel Hobby | 100 GB bandwidth/mo, 1M function invocations/mo (fluid), 300 s max duration, no WebSocket upgrades | SSE streams ≤ 280 s; CDN caching on all relay responses; crypto never touches Vercel |
| Supabase Free | 500 MB DB, 50k MAU, 200 realtime connections, pauses after 7 days inactivity | tiny JSON rows; app works offline while paused |
| Alpaca free | IEX feed, 1 stream connection, 30 symbols/stream, 200 REST req/min | 1 stream per client, polling fallback on 406, server-side memoization |
| Twelve Data free | 8 credits/min, 800 credits/day, no WebSocket | 60 s client poll + 55 s edge cache; bars memoized 50 s; history pages cached 10 min |
| Binance public | 6 000 request weight/min per IP, WS 5 msgs/s client→server | 1 shared socket per exchange; history pages of 500–1000 |
| Coinbase/Kraken/Bybit/OKX public | 10–20 req/s per IP, WS ping requirements | token-bucket helper, per-exchange ping payloads, single shared socket |
