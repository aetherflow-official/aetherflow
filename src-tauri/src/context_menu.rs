use std::ffi::OsStr;
use std::os::windows::ffi::OsStrExt;
use windows_sys::Win32::System::Registry::*;
use windows_sys::Win32::UI::Shell::{SHChangeNotify, SHCNE_ASSOCCHANGED, SHCNF_IDLIST};

fn to_wide(s: &str) -> Vec<u16> {
    OsStr::new(s).encode_wide().chain(std::iter::once(0)).collect()
}

/// Helper to set a REG_SZ value under HKEY_CURRENT_USER
fn set_hkcu_str(sub_key: &str, value_name: Option<&str>, value_data: &str) -> bool {
    unsafe {
        let wide_sub_key = to_wide(sub_key);
        let mut hkey: HKEY = std::ptr::null_mut();
        let status = RegCreateKeyExW(
            HKEY_CURRENT_USER,
            wide_sub_key.as_ptr(),
            0,
            std::ptr::null(),
            REG_OPTION_NON_VOLATILE,
            KEY_ALL_ACCESS,
            std::ptr::null(),
            &mut hkey,
            std::ptr::null_mut(),
        );
        if status != 0 {
            return false;
        }

        let wide_data = to_wide(value_data);
        let wide_name = value_name.map(to_wide);
        let name_ptr = wide_name
            .as_ref()
            .map(|w| w.as_ptr())
            .unwrap_or(std::ptr::null());

        let set_status = RegSetValueExW(
            hkey,
            name_ptr,
            0,
            REG_SZ,
            wide_data.as_ptr() as *const u8,
            (wide_data.len() * 2) as u32,
        );
        RegCloseKey(hkey);
        set_status == 0
    }
}

/// Helper to check if a key exists under HKEY_CURRENT_USER
fn key_exists_hkcu(sub_key: &str) -> bool {
    unsafe {
        let wide_sub_key = to_wide(sub_key);
        let mut hkey: HKEY = std::ptr::null_mut();
        let status = RegOpenKeyExW(
            HKEY_CURRENT_USER,
            wide_sub_key.as_ptr(),
            0,
            KEY_READ,
            &mut hkey,
        );
        if status == 0 {
            RegCloseKey(hkey);
            true
        } else {
            false
        }
    }
}

/// Helper to delete a key tree under HKEY_CURRENT_USER
fn delete_key_tree_hkcu(sub_key: &str) {
    unsafe {
        let wide_sub_key = to_wide(sub_key);
        RegDeleteTreeW(HKEY_CURRENT_USER, wide_sub_key.as_ptr());
    }
}

/// Notify Windows Shell (Explorer) that associations / context menu verbs changed
pub fn flush_shell_cache() {
    unsafe {
        SHChangeNotify(SHCNE_ASSOCCHANGED as i32, SHCNF_IDLIST, std::ptr::null(), std::ptr::null());
    }
}

/// Check if AetherFlow desktop context menu is registered in HKCU
pub fn is_desktop_context_menu_registered() -> bool {
    key_exists_hkcu(r"Software\Classes\DesktopBackground\Shell\AetherFlow")
        || key_exists_hkcu(r"Software\Classes\Directory\Background\shell\AetherFlow")
}

/// Register desktop background cascading context menu in HKCU (Zero elevation / UAC needed)
pub fn register_desktop_context_menu(exe_path: &str) -> Result<(), String> {
    // Unquoted exe path for Icon, quoted for command invocation
    let raw_icon = exe_path;
    let quoted_exe = format!("\"{}\"", exe_path);

    // Clean legacy / existing keys to ensure no stale values remain
    delete_key_tree_hkcu(r"Software\Classes\DesktopBackground\Shell\AetherFlow");
    delete_key_tree_hkcu(r"Software\Classes\Directory\Background\shell\AetherFlow");
    delete_key_tree_hkcu(r"Software\Classes\Directory\ContextMenus\AetherFlow");

    let targets = [
        r"Software\Classes\DesktopBackground\Shell\AetherFlow",
        r"Software\Classes\Directory\Background\shell\AetherFlow",
    ];

    for &root_path in &targets {
        // Direct context menu item with direct command subkey for reliable Windows Explorer support
        set_hkcu_str(root_path, None, "Open AetherFlow");
        set_hkcu_str(root_path, Some("MUIVerb"), "Open AetherFlow");
        set_hkcu_str(root_path, Some("Icon"), raw_icon);
        set_hkcu_str(root_path, Some("Position"), "Bottom");

        // Direct command key (supported across Windows 10 and Windows 11 without HKLM CommandStore)
        set_hkcu_str(&format!(r"{}\command", root_path), None, &format!("{} --open", quoted_exe));
    }

    flush_shell_cache();
    Ok(())
}

/// Remove desktop background context menu from HKCU
pub fn unregister_desktop_context_menu() -> Result<(), String> {
    delete_key_tree_hkcu(r"Software\Classes\DesktopBackground\Shell\AetherFlow");
    delete_key_tree_hkcu(r"Software\Classes\Directory\Background\shell\AetherFlow");
    delete_key_tree_hkcu(r"Software\Classes\Directory\ContextMenus\AetherFlow");
    flush_shell_cache();
    Ok(())
}

/// Check if file explorer context menu is registered in HKCU
pub fn is_file_context_menu_registered() -> bool {
    key_exists_hkcu(r"Software\Classes\*\shell\AetherFlow")
        || key_exists_hkcu(r"Software\Classes\SystemFileAssociations\.mp4\shell\AetherFlow")
}

/// Register File Explorer context menu for videos and images
pub fn register_file_context_menu(exe_path: &str) -> Result<(), String> {
    let raw_icon = exe_path;
    let quoted_exe = format!("\"{}\"", exe_path);
    let command_str = format!("{} --apply-file \"%1\"", quoted_exe);

    // 1. Modern AQS AppliesTo rule under *\shell\AetherFlow (works across all Windows 10/11 Explorer views)
    let star_root = r"Software\Classes\*\shell\AetherFlow";
    let applies_to = "System.FileExtension:=.mp4 OR System.FileExtension:=.webm OR System.FileExtension:=.mkv OR System.FileExtension:=.avi OR System.FileExtension:=.mov OR System.FileExtension:=.png OR System.FileExtension:=.jpg OR System.FileExtension:=.jpeg OR System.FileExtension:=.webp OR System.FileExtension:=.gif OR System.FileExtension:=.bmp";

    set_hkcu_str(star_root, None, "Set as AetherFlow Wallpaper");
    set_hkcu_str(star_root, Some("MUIVerb"), "Set as AetherFlow Wallpaper");
    set_hkcu_str(star_root, Some("Icon"), raw_icon);
    set_hkcu_str(star_root, Some("AppliesTo"), applies_to);
    set_hkcu_str(&format!(r"{}\command", star_root), None, &command_str);

    // 2. Also register in SystemFileAssociations for maximum shell compatibility
    let file_targets = [
        r"Software\Classes\SystemFileAssociations\.mp4\shell\AetherFlow",
        r"Software\Classes\SystemFileAssociations\.webm\shell\AetherFlow",
        r"Software\Classes\SystemFileAssociations\.mkv\shell\AetherFlow",
        r"Software\Classes\SystemFileAssociations\.avi\shell\AetherFlow",
        r"Software\Classes\SystemFileAssociations\.mov\shell\AetherFlow",
        r"Software\Classes\SystemFileAssociations\video\shell\AetherFlow",
        r"Software\Classes\SystemFileAssociations\.png\shell\AetherFlow",
        r"Software\Classes\SystemFileAssociations\.jpg\shell\AetherFlow",
        r"Software\Classes\SystemFileAssociations\.jpeg\shell\AetherFlow",
        r"Software\Classes\SystemFileAssociations\.webp\shell\AetherFlow",
        r"Software\Classes\SystemFileAssociations\.gif\shell\AetherFlow",
        r"Software\Classes\SystemFileAssociations\.bmp\shell\AetherFlow",
        r"Software\Classes\SystemFileAssociations\image\shell\AetherFlow",
    ];

    for &target in &file_targets {
        set_hkcu_str(target, None, "Set as AetherFlow Wallpaper");
        set_hkcu_str(target, Some("MUIVerb"), "Set as AetherFlow Wallpaper");
        set_hkcu_str(target, Some("Icon"), raw_icon);
        set_hkcu_str(&format!(r"{}\command", target), None, &command_str);
    }

    flush_shell_cache();
    Ok(())
}

/// Remove File Explorer context menu from HKCU
pub fn unregister_file_context_menu() -> Result<(), String> {
    delete_key_tree_hkcu(r"Software\Classes\*\shell\AetherFlow");

    let file_targets = [
        r"Software\Classes\SystemFileAssociations\.mp4\shell\AetherFlow",
        r"Software\Classes\SystemFileAssociations\.webm\shell\AetherFlow",
        r"Software\Classes\SystemFileAssociations\.mkv\shell\AetherFlow",
        r"Software\Classes\SystemFileAssociations\.avi\shell\AetherFlow",
        r"Software\Classes\SystemFileAssociations\.mov\shell\AetherFlow",
        r"Software\Classes\SystemFileAssociations\video\shell\AetherFlow",
        r"Software\Classes\SystemFileAssociations\.png\shell\AetherFlow",
        r"Software\Classes\SystemFileAssociations\.jpg\shell\AetherFlow",
        r"Software\Classes\SystemFileAssociations\.jpeg\shell\AetherFlow",
        r"Software\Classes\SystemFileAssociations\.webp\shell\AetherFlow",
        r"Software\Classes\SystemFileAssociations\.gif\shell\AetherFlow",
        r"Software\Classes\SystemFileAssociations\.bmp\shell\AetherFlow",
        r"Software\Classes\SystemFileAssociations\image\shell\AetherFlow",
    ];

    for &target in &file_targets {
        delete_key_tree_hkcu(target);
    }

    flush_shell_cache();
    Ok(())
}
