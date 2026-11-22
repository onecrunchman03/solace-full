fn main() {
    // Declaring app commands here generates their allow-* permissions, which
    // capabilities/default.json grants to the remote site (solace.zone).
    tauri_build::try_build(
        tauri_build::Attributes::new()
            .app_manifest(tauri_build::AppManifest::new().commands(&[
                "open_popout",
                "get_autostart",
                "set_autostart",
                "set_badge",
                "set_display_mode",
                "notify",
                "open_external",
            ])),
    )
    .expect("failed to run tauri-build");
}
