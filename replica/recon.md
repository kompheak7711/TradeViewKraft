# Recon: TradingView (public surfaces only)

Scope: features and flows relevant to the v1 scope (charting, data, watchlist, indicators, drawings, layouts, alerts,
sync, themes). Sources: the public web app's unauthenticated surfaces, the public help center ("Charting", "Alerts",
"Watchlists", "Layouts", "Mobile apps" sections) and public product walkthroughs. Nothing behind a login, no internal
data feed, no source code, no assets. This document records *what the product does*, not how it is implemented.

## Screens and flows (desktop "Supercharts")

| # | Screen / flow | What the user sees and does | v1 |
| --- | --- | --- | --- |
| S1 | Chart workspace | Top toolbar (symbol, timeframe, chart type, indicators, alerts, layout, save), left drawing rail, main chart with legend (OHLC, change, indicator values), right price scale, bottom time scale, right panel (watchlist, alerts) | in scope |
| S2 | Symbol search | Modal with text input, filter tabs (All, Stocks, Crypto, Forex, Indices, Futures…), exchange prefix (`BINANCE:BTCUSDT`), results with description, exchange, type | in scope (crypto/stocks/metals filters) |
| S3 | Timeframe picker | Quick buttons (1m, 5m, 15m, 1h, 4h, D, W) and a grouped menu (minutes/hours/days); favorites | in scope (favorites fixed) |
| S4 | Chart types | Bars, candles, hollow candles, Heikin Ashi, line, area, baseline, Renko, Kagi… | in scope: candles, bars, line, area, Heikin Ashi |
| S5 | Indicators dialog | Search; built-ins (MA, EMA, VWAP, BB, RSI, MACD, Volume …); community/Pine scripts | in scope: 7 built-ins; Pine out of scope |
| S6 | Indicator settings | Inputs (length, source), style (color, width), visibility toggle, remove from legend | in scope (length/mult/color, hide, remove) |
| S7 | Drawing tools | Trend line, ray, horizontal line, rectangle, Fibonacci retracement, text and many more; select/move/handles; delete; magnet | in scope: 6 tools, select/move/handles/delete; magnet out |
| S8 | Price scale | Auto / log / percent; drag to scale; "scroll to realtime" button | in scope: auto, log |
| S9 | Crosshair / legend | Crosshair with axis labels; legend shows hovered bar OHLC and change | in scope |
| S10 | Multi-chart layouts | 1–8 chart grids; sync symbol/interval/crosshair across charts (optional); each chart independent | in scope: 1/2/4 grids, independent charts; sync options out |
| S11 | Save / load layout | Named layouts, autosave, rename, delete, cloud-synced | in scope |
| S12 | Watchlist panel | Lists; rows with symbol, last, change, change %; add via search; flags/sections | in scope (sections/flags out) |
| S13 | Alerts | Create from chart (bell) or right panel; conditions crossing / crossing up / down / greater / less; frequency once / every time; message; notifications (push, email, popup, sound); alert log | in scope: conditions, frequency, message, popup + system notification + sound while app open; email/push out |
| S14 | Themes | Dark / light toggle | in scope |
| S15 | Account / settings | Sign-in, synced settings, chart defaults | in scope: magic-link sign-in, defaults, notifications |
| S16 | Pine editor, strategy tester, ideas, news, screeners, broker panel, replay | — | out of scope |

## Mobile (iPhone / iPad) layouts

| # | Element | Behaviour | v1 |
| --- | --- | --- | --- |
| M1 | Bottom tab bar (phone) | Watchlist · Chart · Ideas/News · Alerts · Menu | in scope: Chart · Draw · Watchlist · Alerts · Settings |
| M2 | Chart header (phone) | Symbol button, interval button, chart type, indicators, compact | in scope |
| M3 | Gestures | Pinch to zoom, drag to pan, long-press for crosshair/measure, tap-tap or drag for drawings | in scope: pinch, drag, tap-tap and drag drawing; measure out |
| M4 | Drawing on touch | Tool strip, Pencil supported, handles enlarged | in scope |
| M5 | Multi-chart (phone) | Single chart; quick switch between saved charts | in scope: chart strip when a layout has >1 chart |
| M6 | iPad | Desktop-like workspace with side panel; 2-chart layouts common | in scope (2/4 grids, 260 px panel) |
| M7 | Sheets | Full-height bottom sheets for symbol search, indicators, alerts, settings | in scope |

## Component inventory (observed, mapped to our names)

| TradingView surface | Our component |
| --- | --- |
| Header toolbar | `TopBar` + per-chart `chart-toolbar` in `ChartPanel` |
| Symbol search modal | `SymbolSearchSheet` |
| Interval menu | `tf-quick` + `tf-more` menu |
| Chart type menu | `chart-type` menu |
| Indicators dialog | `IndicatorsSheet` |
| Legend with indicator rows | `chart-legend` |
| Drawing rail | `DrawingToolbar` + `DrawingOverlay` |
| Layout grid picker | `grid-picker` (TopBar) and `LayoutsSheet` |
| Watchlist panel | `Watchlist` |
| Alerts panel + create dialog | `AlertsPanel` + `AlertSheet` |
| Settings / account | `SettingsSheet` + `AuthSheet` |
| Toast / popup notification | `Toasts` |
| Status: connecting / delayed | `feed-status` badge + chart banners |

## States catalogued

Loading (chart spinner, "Searching…"), empty (empty watchlist, no alerts, no results), error (chart load failure
with retry and change-symbol), disconnected (banner + badge, auto-reconnect), stale (badge), market closed (badge with
session label; stocks and metals), limited (free-plan limit reached; polling fallback), offline-ready (toast).

## Explicitly out of scope (v1)

Pine Script and the editor, strategies/backtesting, ideas/social/comments, news, screeners, heatmaps, broker
integration and trading panel, options data, bar replay, server-side alerts while the app is closed, email/push
delivery, symbol sync across charts, hollow/Renko/Kagi/baseline chart types, measure tool, magnet mode.
