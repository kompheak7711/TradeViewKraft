# TradingViewKraft for macOS (Tauri 2)

This package wraps the shared web frontend (`apps/web`) in a native macOS window. It is **not** a
wrapper around the Vercel URL: the production build bundles the Vite output and ships it inside the app.

## Why Tauri

- One codebase: the same React/Vite build runs in the browser, as a PWA and in the Mac app.
- Native HTTP from Rust (`tauri-plugin-http`) so exchange REST calls never hit CORS and never leave the user's machine
  (Binance returns HTTP 451 to datacenter IPs, so a relay is not an option for it).
- Native notifications for price alerts via `tauri-plugin-notification`.
- ~10 MB bundle instead of an Electron-sized one. No blocking limitation was found, so Electron is not used.

## Prerequisites (on your Mac)

- Xcode Command Line Tools: `xcode-select --install`
- Rust: `curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh`
- Node 22 + pnpm 10

## Run in development

```bash
pnpm install
pnpm desktop:dev        # starts Vite on :5173 and opens the native window
```

## Build the .app / .dmg

```bash
cp apps/desktop/.env.example apps/web/.env.desktop   # then set VITE_RELAY_BASE to your Vercel URL
pnpm --filter @tvk/desktop icons                     # one-time: generates icon.icns/.ico from icons/icon.png
pnpm desktop:build                                   # output: apps/desktop/src-tauri/target/release/bundle/
```

The first `tauri build` needs `icons/icon.icns` and `icons/icon.ico`; `pnpm --filter @tvk/desktop icons`
creates them from the 1024px PNG. Unsigned builds run locally after right-click → Open.
