# Parity report

Method: the in-scope TradingView surface was reduced to the 49 features in `replica/features.csv` (recon). Each must-have
counts 3, should 2, could 1; out-of-scope rows are excluded. "Done" earns full points, "partial" half, "done-unverified"
full for implementation but is flagged separately.

| Bucket | Items | Points available | Points earned | Score |
| --- | --- | --- | --- | --- |
| Must | 37 | 111 | 111 | **100 %** implemented (35/37 verified by tests here; F40/F47 need a Mac) |
| Should | 4 (F12, F13, F25, F48) | 8 | 5 | 63 % |
| Could | 3 (F26, F33, F36) | 3 | 0 | 0 % |
| **Weighted in-scope parity** | 44 | 122 | 116 | **95 %** |

Against the full desktop Supercharts feature set observed in recon (including out-of-scope areas such as Pine, replay,
hollow/Renko/Kagi, magnet/measure, symbol sync, email/push alerts, screeners, ideas), the estimated overall parity is
about **60 %** — by design: v1 targets the daily-use charting loop for one person.

## Missing must-haves
None unimplemented. Two must-haves are implemented but could not be verified in this environment:
- F40 macOS notifications (Tauri notification plugin) — verify with the first `pnpm desktop:dev` on the Mac.
- F47 Mac native app build — compile on macOS; `Cargo.lock` is resolved.

## Gaps worth closing next (should/could)
1. Percent scale (F12) and a "scroll to realtime" button (F13): small.
2. Symbol/interval sync across charts in a layout (F36).
3. Magnet mode and measure tool (F33).
4. Watchlist sections/flags (F26).
5. Inline text editor for the text tool (B6).

## v2 items (out of scope by brief)
Server-side alerts while closed (Supabase scheduled Edge Function + web push), Pine-like scripting, news/ideas,
screeners, broker integration, options data, bar replay.
