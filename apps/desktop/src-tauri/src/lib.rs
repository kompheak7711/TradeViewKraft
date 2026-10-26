//! TradingViewKraft desktop shell.
//!
//! The frontend is the same Vite build as the web/PWA app. The Rust side exists to:
//! - perform exchange REST calls natively (tauri-plugin-http) so there is no CORS and no relay
//!   for crypto exchanges (Binance blocks datacenter IPs, so traffic must come from the user's machine),
//! - deliver price alerts to macOS Notification Center (tauri-plugin-notification),
//! - expose a tiny `app_info` command the UI can use to label the platform.

#[tauri::command]
fn app_info() -> serde_json::Value {
    serde_json::json!({
        "name": "TradingViewKraft",
        "version": env!("CARGO_PKG_VERSION"),
        "platform": std::env::consts::OS,
        "arch": std::env::consts::ARCH,
    })
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_http::init())
        .plugin(tauri_plugin_notification::init())
        .plugin(tauri_plugin_os::init())
        .invoke_handler(tauri::generate_handler![app_info])
        .run(tauri::generate_context!())
        .expect("error while running TradingViewKraft");
}
