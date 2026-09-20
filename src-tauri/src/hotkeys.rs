use std::collections::HashMap;
use std::str::FromStr;
use std::sync::{LazyLock, Mutex};
use tauri::{AppHandle, Emitter, Manager};
use tauri_plugin_global_shortcut::{GlobalShortcutExt, Shortcut};

pub static HOTKEY_MAPPINGS: LazyLock<Mutex<HashMap<String, String>>> =
    LazyLock::new(|| Mutex::new(HashMap::new()));

pub fn handle_hotkey_press(app: &AppHandle, shortcut: &Shortcut) {
    let shortcut_str = shortcut.to_string().to_lowercase();

    // Check action registered for this shortcut string
    let action_opt = if let Ok(map) = HOTKEY_MAPPINGS.lock() {
        map.get(&shortcut_str).cloned()
    } else {
        None
    };

    if let Some(action) = action_opt {
        crate::log_msg(&format!(
            "[HOTKEY] Triggered '{}' via shortcut '{}'",
            action, shortcut_str
        ));
        dispatch_action(app, &action);
    }
}

pub fn dispatch_action(app: &AppHandle, action: &str) {
    match action {
        "nextWallpaper" => {
            let _ = app.emit("aether:shortcut:next", ());
        }
        "prevWallpaper" => {
            let _ = app.emit("aether:shortcut:prev", ());
        }
        "togglePause" => {
            crate::do_toggle_wallpaper_pause(app.clone());
        }
        "toggleMute" => {
            crate::do_toggle_wallpaper_mute(app.clone());
        }
        "toggleIcons" => {
            let _ = crate::do_toggle_desktop_icons(app.clone());
        }
        "screensaver" => {
            let _ = crate::trigger_screensaver(app.clone(), Some(true));
        }
        "openApp" => {
            if let Some(win) = app.get_webview_window("main") {
                let _ = win.unminimize();
                let _ = win.show();
                let _ = win.set_focus();
            }
            #[cfg(windows)]
            if let Some(main_h) = crate::get_main_hwnd() {
                unsafe {
                    windows_sys::Win32::UI::WindowsAndMessaging::ShowWindow(main_h, 9);
                    windows_sys::Win32::UI::WindowsAndMessaging::SetForegroundWindow(main_h);
                }
            }
        }
        _ => {}
    }
}

pub fn update_registered_hotkeys(
    app: &AppHandle,
    bindings: HashMap<String, String>,
) -> Result<(), String> {
    let global_shortcut = app.global_shortcut();
    let _ = global_shortcut.unregister_all();

    let mut new_map = HashMap::new();

    for (action, key_combo) in bindings {
        let trimmed = key_combo.trim();
        if trimmed.is_empty() {
            continue;
        }

        match Shortcut::from_str(trimmed) {
            Ok(sc) => {
                if let Err(e) = global_shortcut.register(sc) {
                    crate::log_msg(&format!(
                        "[HOTKEY] Failed to register shortcut '{}': {:?}",
                        trimmed, e
                    ));
                } else {
                    let key_str = sc.to_string().to_lowercase();
                    new_map.insert(key_str, action);
                    crate::log_msg(&format!(
                        "[HOTKEY] Successfully registered '{}' for action",
                        trimmed
                    ));
                }
            }
            Err(e) => {
                crate::log_msg(&format!(
                    "[HOTKEY] Invalid shortcut string '{}': {:?}",
                    trimmed, e
                ));
            }
        }
    }

    if let Ok(mut map) = HOTKEY_MAPPINGS.lock() {
        *map = new_map;
    }

    Ok(())
}
