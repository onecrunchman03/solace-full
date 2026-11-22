fn main() {
    // Declaring app commands here generates their allow-* permissions, which
    // capabilities/default.json grants to the panel window (the desktop
    // shell's pattern).
    tauri_build::try_build(
        tauri_build::Attributes::new()
            .app_manifest(tauri_build::AppManifest::new().commands(&[
                "get_autostart",
                "set_autostart",
                "open_data_dir",
                "check_update",
                "install_update",
            ])),
    )
    .expect("failed to run tauri-build");
}
