// Solace Satellite — the desktop app around the daemon (FEDERATION.md).
//
// The window is a control panel; the real work happens in the bundled
// `satellited` sidecar (a self-contained Node SEA build of
// src/satellite/main.ts), spawned here in `serve` mode: the rendezvous
// link plus a localhost-only control API the panel talks to over fetch.
// TRAY-RESIDENT since 0.3.0: closing the window hides to the tray and the
// community stays online; only Quit (tray menu) or app exit kills the
// daemon — and the stdin pipe still guarantees no orphan on a force-kill.
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use std::process::{Child, Command};
use std::sync::Mutex;
use tauri::{
    menu::{Menu, MenuItem},
    tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
    Manager, RunEvent, WindowEvent,
};
use tauri_plugin_autostart::ManagerExt;
use tauri_plugin_updater::UpdaterExt;

struct Daemon(Mutex<Option<Child>>);

/// Bring the panel back from the tray.
fn show_main(app: &tauri::AppHandle) {
    if let Some(w) = app.get_webview_window("main") {
        let _ = w.show();
        let _ = w.unminimize();
        let _ = w.set_focus();
    }
}

// LAUNCH ON STARTUP (F4 Settings card) — the desktop shell's exact pattern:
// the page owns the toggle, the plugin owns the registry entry, uninstalling
// the app takes the entry with it.
#[tauri::command]
fn get_autostart(app: tauri::AppHandle) -> bool {
    app.autolaunch().is_enabled().unwrap_or(false)
}

#[tauri::command]
fn set_autostart(app: tauri::AppHandle, on: bool) -> Result<bool, String> {
    let mgr = app.autolaunch();
    let r = if on { mgr.enable() } else { mgr.disable() };
    r.map_err(|e| e.to_string())?;
    Ok(mgr.is_enabled().unwrap_or(on))
}

// AUTO-UPDATE (F4). The endpoint is identity-gated — the panel fetches a
// signed token from the daemon and hands it here; the builder overrides the
// conf endpoint with the tokenized URL. NSIS updates install and the app
// restarts itself into the new version.
fn tokened_updater(
    app: &tauri::AppHandle,
    url: &str,
) -> Result<tauri_plugin_updater::Updater, String> {
    if !url.starts_with("https://") && !url.starts_with("http://127.0.0.1") && !url.starts_with("http://localhost") {
        return Err("bad_url".into());
    }
    let parsed: tauri::Url = url.parse().map_err(|e| format!("{e}"))?;
    app.updater_builder()
        .endpoints(vec![parsed])
        .map_err(|e| e.to_string())?
        .build()
        .map_err(|e| e.to_string())
}

#[tauri::command]
async fn check_update(app: tauri::AppHandle, url: String) -> Result<Option<String>, String> {
    let updater = tokened_updater(&app, &url)?;
    match updater.check().await.map_err(|e| e.to_string())? {
        Some(u) => Ok(Some(u.version.clone())),
        None => Ok(None),
    }
}

#[tauri::command]
async fn install_update(app: tauri::AppHandle, url: String) -> Result<(), String> {
    let updater = tokened_updater(&app, &url)?;
    if let Some(u) = updater.check().await.map_err(|e| e.to_string())? {
        u.download_and_install(|_, _| {}, || {}).await.map_err(|e| e.to_string())?;
        app.restart();
    }
    Ok(())
}

/// Open the community's data folder (backups live here) in Explorer.
#[tauri::command]
fn open_data_dir() -> Result<(), String> {
    let base = std::env::var("APPDATA").map_err(|e| e.to_string())?;
    let dir = std::path::Path::new(&base).join("SolaceSatellite");
    std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    Command::new("explorer").arg(dir).spawn().map_err(|e| e.to_string())?;
    Ok(())
}

fn spawn_daemon() -> Option<Child> {
    let exe = std::env::current_exe().ok()?;
    let dir = exe.parent()?;
    let name = if cfg!(windows) { "satellited.exe" } else { "satellited" };
    let path = dir.join(name);
    if !path.exists() {
        eprintln!("[satellite-app] daemon not found at {:?}", path);
        return None;
    }
    let mut cmd = Command::new(path);
    // --watch-stdin: the daemon holds our stdin pipe and exits when it
    // closes — i.e. when THIS process dies for any reason, force-kill and
    // crashes included. RunEvent::Exit's kill() covers the polite path;
    // the pipe covers every other one (no orphan daemon squatting on the
    // control port after a task-manager kill).
    // --voice: the app opts the daemon into hosting the bundled LiveKit SFU
    // (F5b); the Settings card's toggle still rules inside that.
    cmd.args(["serve", "--watch-stdin", "--voice"]);
    cmd.stdin(std::process::Stdio::piped());
    // No console window flashing up behind the panel.
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        cmd.creation_flags(0x0800_0000); // CREATE_NO_WINDOW
    }
    cmd.spawn().ok()
}

fn main() {
    let app = tauri::Builder::default()
        // One instance ever: a second launch (double-click, autostart racing
        // a manual open) just surfaces the existing window — two daemons
        // fighting over the control port was the alternative.
        .plugin(tauri_plugin_single_instance::init(|app, _args, _cwd| {
            show_main(app);
        }))
        .plugin(tauri_plugin_autostart::init(
            tauri_plugin_autostart::MacosLauncher::LaunchAgent,
            None,
        ))
        // The OS folder picker for the storage/backup location settings —
        // a file dialog is the one legitimate native dialog (the house
        // no-browser-dialogs rule is about confirms, not pickers).
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .invoke_handler(tauri::generate_handler![
            get_autostart, set_autostart, open_data_dir, check_update, install_update
        ])
        .setup(|app| {
            app.manage(Daemon(Mutex::new(spawn_daemon())));
            // TRAY-RESIDENT HOSTING (Josh, Sep 2026): closing the window no
            // longer takes the community offline — the app hides to the tray
            // and the daemon keeps holding the line. Quit lives in the tray
            // menu; only quitting (or a machine shutdown) goes dark.
            let open = MenuItem::with_id(app, "open", "Open Solace Satellite", true, None::<&str>)?;
            let quit = MenuItem::with_id(app, "quit", "Quit — take the community offline", true, None::<&str>)?;
            let menu = Menu::with_items(app, &[&open, &quit])?;
            TrayIconBuilder::with_id("main")
                .icon(app.default_window_icon().unwrap().clone())
                .tooltip("Solace Satellite — your community is online while this runs")
                .menu(&menu)
                .show_menu_on_left_click(false)
                .on_menu_event(|app, event| match event.id.as_ref() {
                    "open" => show_main(app),
                    "quit" => app.exit(0), // RunEvent::Exit kills the daemon
                    _ => {}
                })
                .on_tray_icon_event(|tray, event| {
                    if let TrayIconEvent::Click {
                        button: MouseButton::Left,
                        button_state: MouseButtonState::Up,
                        ..
                    } = event
                    {
                        show_main(tray.app_handle());
                    }
                })
                .build(app)?;
            Ok(())
        })
        .on_window_event(|window, event| {
            // X = hide to tray; the daemon (and the community) stays up.
            if let WindowEvent::CloseRequested { api, .. } = event {
                if window.label() == "main" {
                    api.prevent_close();
                    let _ = window.hide();
                }
            }
        })
        .build(tauri::generate_context!())
        .expect("error while building Solace Satellite");

    app.run(|handle, event| {
        if let RunEvent::Exit = event {
            if let Some(daemon) = handle.try_state::<Daemon>() {
                if let Some(mut child) = daemon.0.lock().unwrap().take() {
                    // Close OUR end of the stdin pipe first: the daemon's
                    // --watch-stdin sees EOF and exits ITSELF, which runs its
                    // exit handlers — the ones that kill the bundled
                    // livekit-server. A bare kill() here is TerminateProcess:
                    // the daemon dies with no handlers, the SFU survives
                    // holding :7880, and the NEXT launch's SFU loses the port
                    // race forever. So: polite first, kill as the backstop.
                    // 8s, not 3: the daemon's remaining synchronous windows
                    // (VACUUM INTO a big db, the move's swap) can hold the
                    // event loop past 3s on slow disks, and tripping the
                    // backstop there re-creates the orphan this exists to
                    // prevent. The copies themselves yield per-file now.
                    drop(child.stdin.take());
                    let mut waited = 0u32;
                    loop {
                        match child.try_wait() {
                            Ok(Some(_)) => break,
                            _ if waited >= 8000 => break,
                            _ => {
                                std::thread::sleep(std::time::Duration::from_millis(100));
                                waited += 100;
                            }
                        }
                    }
                    let _ = child.kill();
                }
            }
        }
    });
}
