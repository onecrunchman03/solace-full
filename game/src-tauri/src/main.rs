// SolaceBackrooms — the packaged game.
//
// Unlike the Solace desktop shell (a thin window around the remote site),
// the GAME is fully bundled: the built client ships inside the installer and
// talks to https://solace.zone over CORS-allowlisted calls + /ws-game. No
// tray, no updater (v1 — updates ship as new installers), no custom IPC:
// the webview is the whole app.

#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    tauri::Builder::default()
        .run(tauri::generate_context!())
        .expect("error while running SolaceBackrooms");
}
