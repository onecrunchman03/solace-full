// Solace desktop shell.
//
// A thin native window whose webview lives on https://solace.zone — the app
// itself always comes from the server, so every deploy reaches desktop users
// automatically and this shell only changes when shell features change.
//
// Shell behaviors:
//   - close-to-tray: the X hides the window; voice + notifications keep
//     running. Tray left-click or "Open Solace" brings it back; Quit exits.
//   - single instance: launching the app again focuses the existing window.
//   - self-update: on startup, check solace.zone/desktop/latest.json for a
//     newer *shell* (rare); download, install, and relaunch silently.

#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use tauri::{
    menu::{Menu, MenuItem},
    tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
    Manager, WebviewUrl, WebviewWindowBuilder, WindowEvent,
};
use tauri_plugin_autostart::ManagerExt;
use tauri_plugin_global_shortcut::{GlobalShortcutExt, ShortcutState};
use tauri_plugin_updater::UpdaterExt;

/// The global push-to-talk hotkey. Registered system-wide (works while
/// gaming/unfocused); the page only ACTS on it when the user has enabled
/// push-to-talk in the voice settings, so for everyone else the only cost
/// is that this one combo is reserved while Solace runs.
const PTT_SHORTCUT: &str = "CommandOrControl+Shift+Space";

/// Where the window sat before it went borderless — (x, y, w, h) in physical
/// pixels. Borderless resizes the window to the whole monitor, so without this
/// "back to windowed" would hand back a monitor-sized undecorated-shaped
/// window and the player would have to drag it small again.
static LAST_WINDOWED: std::sync::Mutex<Option<(i32, i32, u32, u32)>> =
    std::sync::Mutex::new(None);

fn show_main(app: &tauri::AppHandle) {
    if let Some(w) = app.get_webview_window("main") {
        let _ = w.show();
        let _ = w.unminimize();
        let _ = w.set_focus();
    }
}

/// Closing the app LEAVES cleanly (Josh's rule): the page stands up from
/// voice + any game seat (session kept — next launch is still signed in),
/// then the process exits. No more lurking in the tray after an X.
fn graceful_exit(app: &tauri::AppHandle) {
    if let Some(w) = app.get_webview_window("main") {
        let _ = w.eval("window.__solaceExit && window.__solaceExit()");
    }
    let app = app.clone();
    std::thread::spawn(move || {
        // Give the beacon + voice leave a beat to fire, then go.
        std::thread::sleep(std::time::Duration::from_millis(700));
        app.exit(0);
        // On macOS app.exit from a worker thread has been seen to stall with
        // the window hidden — the app lived on in the Dock with no way back
        // (Josh's report). If we're still alive shortly after, force it.
        std::thread::sleep(std::time::Duration::from_millis(600));
        std::process::exit(0);
    });
}

/// Open a stream pop-out: a real native window (drag to any monitor, snap,
/// maximize, fullscreen) pointed at the site's #popout page, which runs its
/// own subscribe-only LiveKit connection. Only solace.zone URLs are allowed —
/// the page can't use this to spawn windows onto arbitrary sites.
///
/// MUST be async: a sync command runs on the main thread inside the IPC
/// handler, and creating a webview window there fails/deadlocks on Windows
/// (the documented wry re-entrancy issue — this was the v0.3.0 pop-out bug).
#[tauri::command]
async fn open_popout(app: tauri::AppHandle, url: String) -> Result<(), String> {
    if !url.starts_with("https://solace.zone/") {
        return Err("bad url".into());
    }
    let parsed: tauri::Url = url.parse().map_err(|_| "bad url".to_string())?;
    let label = format!(
        "popout-{}",
        std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .map(|d| d.as_millis())
            .unwrap_or(0)
    );
    WebviewWindowBuilder::new(&app, label, WebviewUrl::External(parsed))
        .title("Solace — Stream")
        .inner_size(980.0, 620.0)
        .min_inner_size(360.0, 240.0)
        .build()
        .map_err(|e| e.to_string())?;
    Ok(())
}

/// LAUNCH ON STARTUP (Josh's alert list): the page owns the toggle, the shell
/// owns the registry entry. Reported and set through the autostart plugin, so
/// uninstalling the app takes the entry with it.
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

/// DISPLAY MODE (Josh, Aug 2026) — the three a game offers, from one command
/// rather than eight granted window setters:
///   · "fullscreen"  exclusive fullscreen (the compositor's own)
///   · "borderless"  fullscreen WINDOWED: chrome off, covering the whole
///                   monitor — alt-tab stays instant and an overlay can sit
///                   on top, which exclusive fullscreen fights
///   · "windowed"    decorations back, restored to its old size
///
/// Borderless is done by MEASURING the monitor the window is on and sizing to
/// it in PHYSICAL pixels — not by maximizing, which stops at the work area and
/// leaves the taskbar over the game. Leaving it restores the pre-borderless
/// size and position, so a round trip puts the window back where it was.
#[tauri::command]
fn set_display_mode(app: tauri::AppHandle, mode: String) -> Result<String, String> {
    let Some(w) = app.get_webview_window("main") else {
        return Err("no window".into());
    };
    match mode.as_str() {
        "fullscreen" => {
            let _ = w.set_decorations(true);
            w.set_fullscreen(true).map_err(|e| e.to_string())?;
        }
        "borderless" => {
            w.set_fullscreen(false).map_err(|e| e.to_string())?;
            // Remember where the window was so "windowed" can put it back.
            if !w.is_decorated().unwrap_or(true) {
                // already borderless — leave the remembered geometry alone
            } else if let (Ok(pos), Ok(size)) = (w.outer_position(), w.outer_size()) {
                let mut last = LAST_WINDOWED.lock().unwrap();
                *last = Some((pos.x, pos.y, size.width, size.height));
            }
            let mon = w
                .current_monitor()
                .map_err(|e| e.to_string())?
                .ok_or_else(|| "no monitor".to_string())?;
            w.set_decorations(false).map_err(|e| e.to_string())?;
            let _ = w.set_position(tauri::PhysicalPosition::new(
                mon.position().x,
                mon.position().y,
            ));
            let _ = w.set_size(tauri::PhysicalSize::new(
                mon.size().width,
                mon.size().height,
            ));
        }
        "windowed" => {
            w.set_fullscreen(false).map_err(|e| e.to_string())?;
            w.set_decorations(true).map_err(|e| e.to_string())?;
            let last = *LAST_WINDOWED.lock().unwrap();
            if let Some((x, y, cw, ch)) = last {
                let _ = w.set_size(tauri::PhysicalSize::new(cw, ch));
                let _ = w.set_position(tauri::PhysicalPosition::new(x, y));
            }
        }
        _ => return Err("bad mode".into()),
    }
    let _ = w.set_focus();
    Ok(mode)
}

/// NATIVE NOTIFICATIONS (v0.3.5). The webview's own `Notification` API is a
/// dead end in the shell — WebView2 auto-denies `requestPermission` unless
/// the host handles it, and WKWebView has no implementation at all, so the
/// site's toggle "did nothing" on desktop (Josh's report). The site now
/// detects SolaceShell/0.3.5+ and invokes this instead: the notification
/// plugin posts a real OS notification (Action Center / Notification Center),
/// no permission dance involved.
#[tauri::command]
fn notify(app: tauri::AppHandle, title: String, body: String) -> Result<(), String> {
    use tauri_plugin_notification::NotificationExt;
    app.notification()
        .builder()
        .title(&title)
        .body(&body)
        .show()
        .map_err(|e| e.to_string())
}

/// OPEN A LINK IN THE USER'S REAL BROWSER (v0.3.6).
///
/// The webview has no second window and `target="_blank"` inside it is a link
/// that silently does nothing — which is exactly what the Exchange's news tape
/// looked like from the outside: a headline you could click forever. This is
/// the one way out of the shell.
///
/// THE SCHEME IS THE WHOLE SECURITY QUESTION, and it is checked HERE rather
/// than trusted from the page. This command is granted to the remote origin,
/// and the URLs it is handed are vendor news links — so a hostile or merely
/// sloppy one must not be able to reach the OS. On Windows the underlying
/// call is ShellExecute, which will happily launch any registered protocol
/// handler: `file:` opens Explorer, `ms-settings:`, `steam:` and a hundred
/// other schemes start programs. Only http and https get through, the URL has
/// to parse, and it has to have a host — so `https:///` and scheme-only
/// strings are refused too.
/// The guard, split out so it can be TESTED. The security of this whole
/// command is one string check, and a string check nobody runs is a comment.
fn vet_external_url(url: &str) -> Result<String, String> {
    if url.len() > 2048 {
        return Err("url too long".into());
    }
    let parsed: tauri::Url = url.parse().map_err(|_| "bad url".to_string())?;
    if !matches!(parsed.scheme(), "http" | "https") {
        return Err("only http(s) links open".into());
    }
    if parsed.host_str().unwrap_or("").is_empty() {
        return Err("bad url".into());
    }
    // Return the PARSED url, not the caller's string: anything the parser
    // normalised away cannot then be re-interpreted downstream.
    Ok(parsed.to_string())
}

#[tauri::command]
fn open_external(app: tauri::AppHandle, url: String) -> Result<(), String> {
    use tauri_plugin_opener::OpenerExt;
    let safe = vet_external_url(&url)?;
    app.opener()
        .open_url(safe, None::<&str>)
        .map_err(|e| e.to_string())
}

#[cfg(test)]
mod tests {
    use super::vet_external_url;

    #[test]
    fn ordinary_web_links_open() {
        assert!(vet_external_url("https://www.benzinga.com/markets/tech/story").is_ok());
        assert!(vet_external_url("http://example.com/a?b=c#d").is_ok());
        // Normalised on the way through, so what opens is what we parsed.
        assert_eq!(vet_external_url("https://example.com").unwrap(), "https://example.com/");
    }

    #[test]
    fn every_other_scheme_is_refused() {
        // On Windows the call underneath is ShellExecute, which launches any
        // registered protocol handler. None of these may reach it.
        for bad in [
            "file:///C:/Windows/System32",
            "javascript:alert(1)",
            "ms-settings:privacy",
            "steam://run/440",
            "data:text/html,<script>1</script>",
            "vbscript:msgbox",
            "smb://host/share",
            "chrome://settings",
        ] {
            assert!(vet_external_url(bad).is_err(), "{bad} should be refused");
        }
    }

    #[test]
    fn junk_is_refused() {
        assert!(vet_external_url("").is_err());
        assert!(vet_external_url("not a url").is_err());
        assert!(vet_external_url("https://").is_err()); // no host
        assert!(vet_external_url(&format!("https://e.com/{}", "a".repeat(3000))).is_err());
    }
}

/// The taskbar/dock unread count. macOS and Linux take a real badge; Windows
/// has no per-icon number without an overlay image, so there the count goes
/// on the window title + tray tooltip — visible in the taskbar preview and on
/// hover, which is what the dot is for.
#[tauri::command]
fn set_badge(app: tauri::AppHandle, count: i64) -> Result<(), String> {
    if let Some(w) = app.get_webview_window("main") {
        let _ = w.set_badge_count(if count > 0 { Some(count) } else { None });
        let title = if count > 0 {
            format!("Solace ({count})")
        } else {
            "Solace".to_string()
        };
        let _ = w.set_title(&title);
    }
    if let Some(tray) = app.tray_by_id("main") {
        let _ = tray.set_tooltip(Some(if count > 0 {
            format!("Solace — {count} waiting")
        } else {
            "Solace".to_string()
        }));
    }
    Ok(())
}

fn check_for_shell_update(app: tauri::AppHandle) {
    tauri::async_runtime::spawn(async move {
        let Ok(updater) = app.updater() else { return };
        let Ok(Some(update)) = updater.check().await else { return };
        // A newer shell exists — install it quietly and relaunch.
        if update.download_and_install(|_, _| {}, || {}).await.is_ok() {
            app.restart();
        }
    });
}

fn main() {
    tauri::Builder::default()
        .plugin(tauri_plugin_single_instance::init(|app, _args, _cwd| {
            show_main(app);
        }))
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_notification::init())
        .plugin(tauri_plugin_opener::init())
        // Launch-on-login is OFF until the user asks for it in Settings; the
        // shell starts minimized-to-tray-ish (the window still shows, but
        // --hidden is what a login launch passes).
        .plugin(tauri_plugin_autostart::init(
            tauri_plugin_autostart::MacosLauncher::LaunchAgent,
            Some(vec!["--autostart"]),
        ))
        .plugin(
            tauri_plugin_global_shortcut::Builder::new()
                .with_handler(|app, _shortcut, event| {
                    // Global push-to-talk: forward press/release into the
                    // page. The page ignores it unless PTT mode is on.
                    let down = matches!(event.state(), ShortcutState::Pressed);
                    if let Some(w) = app.get_webview_window("main") {
                        let _ = w.eval(&format!(
                            "window.__solacePTT && window.__solacePTT({down})"
                        ));
                    }
                })
                .build(),
        )
        .setup(|app| {
            let open = MenuItem::with_id(app, "open", "Open Solace", true, None::<&str>)?;
            let quit = MenuItem::with_id(app, "quit", "Quit Solace", true, None::<&str>)?;
            let menu = Menu::with_items(app, &[&open, &quit])?;
            TrayIconBuilder::with_id("main")
                .icon(app.default_window_icon().unwrap().clone())
                .tooltip("Solace")
                .menu(&menu)
                .show_menu_on_left_click(false)
                .on_menu_event(|app, event| match event.id.as_ref() {
                    "open" => show_main(app),
                    "quit" => graceful_exit(app),
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
            if let Err(e) = app.global_shortcut().register(PTT_SHORTCUT) {
                // Another app owns the combo — Solace still works, just no PTT.
                eprintln!("push-to-talk hotkey unavailable: {e}");
            }
            // macOS: a View menu with real reload accelerators (Cmd+R /
            // Cmd+Shift+R) — WKWebView ships none, and Josh asked what the
            // hard-refresh equivalent was. (The site also handles these keys
            // itself, so older shells reload too; the menu is the native,
            // discoverable path.) Appended to Tauri's default menu so Edit's
            // copy/paste stays intact.
            #[cfg(target_os = "macos")]
            {
                use tauri::menu::Submenu;
                if let Some(menu) = app.menu() {
                    let reload = MenuItem::with_id(app, "reload", "Reload", true, Some("Cmd+R"))?;
                    let force =
                        MenuItem::with_id(app, "force-reload", "Force Reload", true, Some("Cmd+Shift+R"))?;
                    let view = Submenu::with_items(app.handle(), "View", true, &[&reload, &force])?;
                    let _ = menu.append(&view);
                }
                app.on_menu_event(|app, event| {
                    if event.id() == "reload" || event.id() == "force-reload" {
                        if let Some(w) = app.get_webview_window("main") {
                            let _ = w.eval("window.location.reload()");
                        }
                    }
                });
            }
            check_for_shell_update(app.handle().clone());
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            open_popout,
            get_autostart,
            set_autostart,
            set_badge,
            set_display_mode,
            notify,
            open_external
        ])
        .on_window_event(|window, event| {
            // X on the main window = a REAL close: leave voice + game seats
            // gracefully, then exit (close-to-tray retired by request; the
            // tray icon still works while the app runs). Pop-outs just close.
            if let WindowEvent::CloseRequested { api, .. } = event {
                if window.label() == "main" {
                    api.prevent_close(); // we exit ourselves after the cleanup beat
                    let _ = window.hide(); // instant feedback while the beacon fires
                    graceful_exit(&window.app_handle());
                }
            }
        })
        .build(tauri::generate_context!())
        .expect("error while building Solace")
        .run(|app, event| {
            // macOS: clicking the Dock icon with no visible window sends
            // Reopen — without this handler the app just sat there and the
            // only way back in was quit + relaunch (Josh's Mac report).
            #[cfg(target_os = "macos")]
            if let tauri::RunEvent::Reopen { .. } = event {
                show_main(app);
            }
            #[cfg(not(target_os = "macos"))]
            let _ = (app, &event);
        });
}
