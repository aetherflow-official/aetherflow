// Prevents additional console window on Windows in release
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use tauri::{
    AppHandle, Emitter, Manager, WebviewWindowBuilder, WebviewUrl,
    menu::{Menu, MenuItem},
    tray::{MouseButton, TrayIconBuilder, TrayIconEvent},
    window::Color,
};

#[cfg(windows)]
use windows_sys::Win32::Foundation::{HWND, LPARAM, RECT, POINT};
#[cfg(windows)]
use windows_sys::Win32::UI::WindowsAndMessaging::{
    EnumWindows, FindWindowW, FindWindowExW, SendMessageW, SendMessageTimeoutW, SetParent, SMTO_NORMAL, GetShellWindow,
    SetWindowPos, HWND_BOTTOM, SWP_SHOWWINDOW, ShowWindow, DestroyWindow, IsWindow, IsWindowVisible, GetParent,
    GetWindowLongW, SetWindowLongW, GWL_STYLE, GWL_EXSTYLE, WS_CHILD, WS_POPUP,
    WS_VISIBLE, WS_THICKFRAME, WS_CAPTION, WS_BORDER,
    SWP_NOACTIVATE, SWP_FRAMECHANGED, SWP_NOMOVE, SWP_NOSIZE, SWP_NOZORDER,
    GetClassNameW,
    WS_EX_LAYERED, SetLayeredWindowAttributes, LWA_ALPHA,
    GetSystemMetrics, SM_XVIRTUALSCREEN, SM_YVIRTUALSCREEN,
    GetWindowRect, GetClientRect,
    WS_EX_TOOLWINDOW, WS_EX_NOACTIVATE,
    SystemParametersInfoW, SPI_SETDESKWALLPAPER, SPIF_UPDATEINIFILE, SPIF_SENDCHANGE,
    GetForegroundWindow, SetForegroundWindow, IsIconic,
    IsZoomed, GetWindowThreadProcessId,
    GetAncestor, GetWindowTextW, GA_ROOT, GA_ROOTOWNER,
};
#[cfg(windows)]
use windows_sys::Win32::Graphics::Gdi::{
    MonitorFromWindow, MonitorFromPoint, GetMonitorInfoW, MONITORINFO, MONITORINFOEXW, MONITOR_DEFAULTTONEAREST, MONITOR_DEFAULTTONULL,
    MapWindowPoints, InvalidateRect, UpdateWindow, RedrawWindow,
    RDW_INVALIDATE, RDW_UPDATENOW, RDW_ERASE, RDW_ALLCHILDREN,
    SetWindowRgn,
};
#[cfg(windows)]
use windows_sys::Win32::Graphics::Dwm::{DwmSetWindowAttribute, DwmGetWindowAttribute};
#[cfg(windows)]
use std::os::windows::process::CommandExt;

#[cfg(windows)]
mod thumbnail_extractor;
#[cfg(windows)]
mod context_menu;
mod hotkeys;

#[repr(C)]
#[derive(Debug, Copy, Clone)]
struct SystemPowerStatus {
    ac_line_status: u8,
    battery_flag: u8,
    battery_life_percent: u8,
    system_status_flag: u8,
    battery_life_time: u32,
    battery_full_life_time: u32,
}

#[repr(C)]
#[derive(Debug, Copy, Clone)]
#[allow(non_snake_case)]
pub struct LASTINPUTINFO {
    pub cbSize: u32,
    pub dwTime: u32,
}

#[cfg(windows)]
extern "system" {
    fn GetSystemPowerStatus(lpSystemPowerStatus: *mut SystemPowerStatus) -> i32;
    fn GetLastInputInfo(plii: *mut LASTINPUTINFO) -> i32;
    fn GetTickCount() -> u32;
    fn LockWorkStation() -> i32;
}

#[cfg(windows)]
pub fn get_system_idle_millis() -> u64 {
    unsafe {
        let mut lii = LASTINPUTINFO {
            cbSize: std::mem::size_of::<LASTINPUTINFO>() as u32,
            dwTime: 0,
        };
        if GetLastInputInfo(&mut lii) != 0 {
            let tick = GetTickCount();
            let elapsed = tick.wrapping_sub(lii.dwTime);
            return elapsed as u64;
        }
    }
    0
}

#[cfg(not(windows))]
pub fn get_system_idle_millis() -> u64 {
    0
}

use std::sync::Mutex;
use std::collections::HashMap;

fn default_true() -> bool {
    true
}

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ScreensaverSettings {
    pub enabled: bool,
    #[serde(alias = "idle_timeout_mins")]
    pub idle_timeout_mins: u32,
    pub mode: String,
    #[serde(alias = "specific_engine")]
    pub specific_engine: Option<String>,
    #[serde(alias = "specific_config")]
    pub specific_config: Option<serde_json::Value>,
    #[serde(alias = "fade_in_secs")]
    pub fade_in_secs: f64,
    #[serde(alias = "lock_on_resume")]
    pub lock_on_resume: bool,
    #[serde(alias = "grace_period_secs")]
    pub grace_period_secs: u32,
    #[serde(alias = "mute_audio")]
    pub mute_audio: bool,
    #[serde(default = "default_true", alias = "inhibit_fullscreen")]
    pub inhibit_fullscreen: bool,
    #[serde(default = "default_true", alias = "inhibit_maximized")]
    pub inhibit_maximized: bool,
    #[serde(default = "default_true", alias = "inhibit_audio")]
    pub inhibit_audio: bool,
}

static SCREENSAVER_SETTINGS: Mutex<ScreensaverSettings> = Mutex::new(ScreensaverSettings {
    enabled: false,
    idle_timeout_mins: 5,
    mode: String::new(),
    specific_engine: None,
    specific_config: None,
    fade_in_secs: 1.0,
    lock_on_resume: false,
    grace_period_secs: 5,
    mute_audio: true,
    inhibit_fullscreen: true,
    inhibit_maximized: true,
    inhibit_audio: true,
});

static SCREENSAVER_ACTIVE: Mutex<bool> = Mutex::new(false);
static SCREENSAVER_ACTIVATED_AT: Mutex<Option<std::time::Instant>> = Mutex::new(None);
static SCREENSAVER_IS_PREVIEW: Mutex<bool> = Mutex::new(false);

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub struct MonitorGridReport {
    pub label: String,
    pub width: i32,
    pub height: i32,
    pub covered_tiles: u32,
    pub total_tiles: u32,
    pub coverage_percent: f64,
    pub is_occluded: bool,
    pub tiles: Vec<bool>,
}

static LATEST_GRID_REPORTS: Mutex<Vec<MonitorGridReport>> = Mutex::new(Vec::new());

#[cfg(windows)]
#[allow(dead_code)]
pub fn is_system_audio_active() -> bool {
    use windows_sys::Win32::System::Com::*;
    use windows_sys::core::GUID;
    use std::ffi::c_void;

    // CLSID_MMDeviceEnumerator: {BCDE0395-E52F-467C-8E3D-C4579291692E}
    const CLSID_MM_DEVICE_ENUMERATOR: GUID = GUID {
        data1: 0xBCDE0395,
        data2: 0xE52F,
        data3: 0x467C,
        data4: [0x8E, 0x3D, 0xC4, 0x57, 0x92, 0x91, 0x69, 0x2E],
    };

    // IID_IMMDeviceEnumerator: {A95664D2-9614-4F35-A746-DE8DB63617E6}
    const IID_IMM_DEVICE_ENUMERATOR: GUID = GUID {
        data1: 0xA95664D2,
        data2: 0x9614,
        data3: 0x4F35,
        data4: [0xA7, 0x46, 0xDE, 0x8D, 0xB6, 0x36, 0x17, 0xE6],
    };

    // IID_IAudioMeterInformation: {C02216F6-8C67-4B5B-9D00-D008E73E0064}
    const IID_IAUDIO_METER_INFORMATION: GUID = GUID {
        data1: 0xC02216F6,
        data2: 0x8C67,
        data3: 0x4B5B,
        data4: [0x9D, 0x00, 0xD0, 0x08, 0xE7, 0x3E, 0x00, 0x64],
    };

    #[repr(C)]
    struct IMMDeviceEnumeratorVtbl {
        query_interface: unsafe extern "system" fn(*mut c_void, *const GUID, *mut *mut c_void) -> i32,
        add_ref: unsafe extern "system" fn(*mut c_void) -> u32,
        release: unsafe extern "system" fn(*mut c_void) -> u32,
        enum_audio_endpoints: unsafe extern "system" fn(*mut c_void, i32, u32, *mut *mut c_void) -> i32,
        get_default_audio_endpoint: unsafe extern "system" fn(*mut c_void, i32, i32, *mut *mut c_void) -> i32,
    }

    #[repr(C)]
    struct IMMDeviceVtbl {
        query_interface: unsafe extern "system" fn(*mut c_void, *const GUID, *mut *mut c_void) -> i32,
        add_ref: unsafe extern "system" fn(*mut c_void) -> u32,
        release: unsafe extern "system" fn(*mut c_void) -> u32,
        activate: unsafe extern "system" fn(*mut c_void, *const GUID, u32, *const c_void, *mut *mut c_void) -> i32,
    }

    #[repr(C)]
    struct IAudioMeterInformationVtbl {
        query_interface: unsafe extern "system" fn(*mut c_void, *const GUID, *mut *mut c_void) -> i32,
        add_ref: unsafe extern "system" fn(*mut c_void) -> u32,
        release: unsafe extern "system" fn(*mut c_void) -> u32,
        get_peak_value: unsafe extern "system" fn(*mut c_void, *mut f32) -> i32,
    }

    unsafe {
        let _ = CoInitializeEx(std::ptr::null(), COINIT_MULTITHREADED as u32);

        let mut enumerator_ptr: *mut c_void = std::ptr::null_mut();
        let hr = CoCreateInstance(
            &CLSID_MM_DEVICE_ENUMERATOR,
            std::ptr::null_mut(),
            CLSCTX_ALL,
            &IID_IMM_DEVICE_ENUMERATOR,
            &mut enumerator_ptr,
        );
        if hr != 0 || enumerator_ptr.is_null() {
            return false;
        }

        let enumerator_vtbl = *(enumerator_ptr as *mut *mut IMMDeviceEnumeratorVtbl);
        let mut device_ptr: *mut c_void = std::ptr::null_mut();
        let hr2 = ((*enumerator_vtbl).get_default_audio_endpoint)(enumerator_ptr, 0, 1, &mut device_ptr);
        ((*enumerator_vtbl).release)(enumerator_ptr);

        if hr2 != 0 || device_ptr.is_null() {
            return false;
        }

        let device_vtbl = *(device_ptr as *mut *mut IMMDeviceVtbl);
        let mut meter_ptr: *mut c_void = std::ptr::null_mut();
        let hr3 = ((*device_vtbl).activate)(device_ptr, &IID_IAUDIO_METER_INFORMATION, CLSCTX_ALL, std::ptr::null(), &mut meter_ptr);
        ((*device_vtbl).release)(device_ptr);

        if hr3 != 0 || meter_ptr.is_null() {
            return false;
        }

        let meter_vtbl = *(meter_ptr as *mut *mut IAudioMeterInformationVtbl);
        let mut peak: f32 = 0.0;
        let hr4 = ((*meter_vtbl).get_peak_value)(meter_ptr, &mut peak);
        ((*meter_vtbl).release)(meter_ptr);

        hr4 == 0 && peak > 0.0005
    }
}

#[cfg(not(windows))]
pub fn is_system_audio_active() -> bool {
    false
}

#[cfg(windows)]
pub fn is_presentation_or_d3d_fullscreen() -> bool {
    use windows_sys::Win32::UI::Shell::*;
    let mut state = 0;
    let hr = unsafe { SHQueryUserNotificationState(&mut state) };
    if hr == 0 {
        // QUNS_BUSY = 2, QUNS_RUNNING_D3D_FULL_SCREEN = 3, QUNS_PRESENTATION_MODE = 4, QUNS_APP = 7
        state == 2 || state == 3 || state == 4 || state == 7
    } else {
        false
    }
}

#[cfg(not(windows))]
pub fn is_presentation_or_d3d_fullscreen() -> bool {
    false
}

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub struct PerformanceSettings {
    pub pause_on_battery: bool,
    pub pause_on_fullscreen: bool,
    pub pause_on_maximized: bool,
    pub multi_monitor_pause_mode: String,
    pub audio_playback_rule: String,
    pub preferred_audio_monitor: Option<String>,
    #[serde(default)]
    pub wallpaper_sync_on_resume: bool,
}

static PERFORMANCE_SETTINGS: Mutex<PerformanceSettings> = Mutex::new(PerformanceSettings {
    pause_on_battery: true,
    pause_on_fullscreen: true,
    pause_on_maximized: true,
    multi_monitor_pause_mode: String::new(),
    audio_playback_rule: String::new(),
    preferred_audio_monitor: None,
    wallpaper_sync_on_resume: true,
});

static IS_SYSTEM_PAUSED: Mutex<bool> = Mutex::new(false);
static CURRENT_PAUSED_MONITORS: std::sync::LazyLock<Mutex<std::collections::HashSet<String>>> =
    std::sync::LazyLock::new(|| Mutex::new(std::collections::HashSet::new()));
static MONITOR_SYNC_REQUESTED: std::sync::atomic::AtomicBool = std::sync::atomic::AtomicBool::new(false);

fn is_monitor_currently_paused(label: &str) -> bool {
    if let Ok(guard) = CURRENT_PAUSED_MONITORS.lock() {
        if guard.contains(label) || guard.contains("*") {
            return true;
        }
        let safe_lbl = label.trim_start_matches("wallpaper_").trim_start_matches('_');
        for p in guard.iter() {
            let safe_p = p.trim_start_matches("wallpaper_").trim_start_matches('_');
            if safe_p.eq_ignore_ascii_case(safe_lbl) || p == "*" {
                return true;
            }
        }
    }
    false
}


#[derive(Clone, serde::Serialize, serde::Deserialize)]
pub struct ActiveWallpaperState {
    pub engine_id: String,
    pub config: serde_json::Value,
    pub opacity: f64,
    pub brightness: f64,
}

static ACTIVE_WALLPAPERS: Mutex<Option<HashMap<String, ActiveWallpaperState>>> = Mutex::new(None);

pub mod mpv;
pub mod taskbar;
static MPV_PLAYERS: Mutex<Option<HashMap<String, mpv::MpvProcess>>> = Mutex::new(None);
static MONITOR_APPLY_TICKETS: std::sync::LazyLock<Mutex<HashMap<String, u64>>> =
    std::sync::LazyLock::new(|| Mutex::new(HashMap::new()));

fn next_apply_ticket(label: &str) -> u64 {
    if let Ok(mut tickets) = MONITOR_APPLY_TICKETS.lock() {
        let entry = tickets.entry(label.to_string()).or_insert(0);
        *entry += 1;
        *entry
    } else {
        0
    }
}

fn get_apply_ticket(label: &str) -> u64 {
    if let Ok(tickets) = MONITOR_APPLY_TICKETS.lock() {
        tickets.get(label).copied().unwrap_or(0)
    } else {
        0
    }
}

fn invalidate_all_apply_tickets() {
    if let Ok(mut tickets) = MONITOR_APPLY_TICKETS.lock() {
        for v in tickets.values_mut() {
            *v += 1;
        }
    }
}

// ─── Main AetherFlow Window Protection & HWND Identity ───────────────────────────
static MAIN_HWND: Mutex<Option<usize>> = Mutex::new(None);
static TRAY_HOLDER: Mutex<Option<tauri::tray::TrayIcon>> = Mutex::new(None);
static ACTIVE_OAUTH_PORT: Mutex<Option<u16>> = Mutex::new(None);

#[cfg(windows)]
pub fn set_main_hwnd(hwnd: HWND) {
    if let Ok(mut guard) = MAIN_HWND.lock() {
        *guard = Some(hwnd as usize);
        let msg = format!("[DIAG 1] Main AetherFlow HWND registered: 0x{:X}", hwnd as usize);
        log_msg(&msg);
        println!("{}", msg);
    }
}

#[cfg(windows)]
pub fn get_main_hwnd() -> Option<HWND> {
    if let Ok(guard) = MAIN_HWND.lock() {
        guard.map(|h| h as HWND)
    } else {
        None
    }
}


#[cfg(windows)]
pub fn is_main_hwnd(hwnd: HWND) -> bool {
    if let Some(main_h) = get_main_hwnd() {
        main_h == hwnd
    } else {
        false
    }
}

#[cfg(windows)]
pub fn set_hwnd_opacity(hwnd: HWND, opacity: f64) {
    unsafe {
        if hwnd.is_null() || IsWindow(hwnd) == 0 {
            return;
        }
        let ex = GetWindowLongW(hwnd, GWL_EXSTYLE) as u32;
        if (ex & WS_EX_LAYERED) == 0 {
            SetWindowLongW(hwnd, GWL_EXSTYLE, (ex | WS_EX_LAYERED) as i32);
        }
        let alpha = (opacity.max(0.05).min(1.0) * 255.0).round() as u8;
        SetLayeredWindowAttributes(hwnd, 0, alpha, LWA_ALPHA);
    }
}

#[cfg(windows)]
pub fn is_running_on_battery() -> bool {
    let mut sps = SystemPowerStatus {
        ac_line_status: 255,
        battery_flag: 255,
        battery_life_percent: 255,
        system_status_flag: 0,
        battery_life_time: 0,
        battery_full_life_time: 0,
    };
    let ret = unsafe { GetSystemPowerStatus(&mut sps) };
    if ret != 0 {
        // ac_line_status: 0 = Offline (battery power), 1 = Online (AC), 255 = Unknown
        sps.ac_line_status == 0
    } else {
        false
    }
}

#[cfg(not(windows))]
pub fn is_running_on_battery() -> bool {
    false
}

#[derive(Debug, Clone, Default)]
pub struct MonitorOcclusionStatus {
    pub is_fullscreen: bool,
    pub is_maximized: bool,
    pub coverage_ratio: f32,
}

#[cfg(windows)]
pub fn is_foreground_window_fullscreen() -> bool {
    unsafe {
        let fg_hwnd = GetForegroundWindow();
        if fg_hwnd.is_null() {
            return false;
        }

        let shell_hwnd = GetShellWindow();
        if fg_hwnd == shell_hwnd || is_main_hwnd(fg_hwnd) {
            return false;
        }

        let mut class_buf = [0u16; 256];
        let len = GetClassNameW(fg_hwnd, class_buf.as_mut_ptr(), 256);
        if len > 0 {
            let class_name = String::from_utf16_lossy(&class_buf[..len as usize]);
            if class_name == "WorkerW"
                || class_name == "Progman"
                || class_name == "Shell_TrayWnd"
                || class_name == "Shell_SecondaryTrayWnd"
            {
                return false;
            }
        }

        if IsWindowVisible(fg_hwnd) == 0 || IsIconic(fg_hwnd) != 0 {
            return false;
        }

        let style = GetWindowLongW(fg_hwnd, GWL_STYLE) as u32;
        if (style & WS_CAPTION) == WS_CAPTION {
            return false;
        }

        let monitor = MonitorFromWindow(fg_hwnd, MONITOR_DEFAULTTONEAREST);
        if monitor.is_null() {
            return false;
        }

        let mut mi: MONITORINFO = std::mem::zeroed();
        mi.cbSize = std::mem::size_of::<MONITORINFO>() as u32;
        if GetMonitorInfoW(monitor, &mut mi) == 0 {
            return false;
        }

        let mut wr: RECT = std::mem::zeroed();
        if GetWindowRect(fg_hwnd, &mut wr) == 0 {
            return false;
        }

        wr.left <= mi.rcMonitor.left
            && wr.top <= mi.rcMonitor.top
            && wr.right >= mi.rcMonitor.right
            && wr.bottom >= mi.rcMonitor.bottom
    }
}

#[cfg(not(windows))]
pub fn is_foreground_window_fullscreen() -> bool {
    false
}

#[derive(Clone, Debug)]
pub struct MonitorGrid {
    pub left: i32,
    pub top: i32,
    pub width: i32,
    pub height: i32,
    pub tiles: u128, // 16 columns x 8 rows = 128 tiles bitmask
}

impl MonitorGrid {
    pub fn new(left: i32, top: i32, width: i32, height: i32) -> Self {
        Self {
            left,
            top,
            width: width.max(1),
            height: height.max(1),
            tiles: 0,
        }
    }

    pub fn mark_window(&mut self, wr: &RECT) {
        // Intersection of window rect with monitor bounds
        let inter_left = wr.left.max(self.left);
        let inter_top = wr.top.max(self.top);
        let inter_right = wr.right.min(self.left.saturating_add(self.width));
        let inter_bottom = wr.bottom.min(self.top.saturating_add(self.height));

        if inter_right <= inter_left || inter_bottom <= inter_top {
            return;
        }

        // Ignore tiny fragments or invisible shadow borders under 30x30
        if (inter_right - inter_left) < 30 || (inter_bottom - inter_top) < 30 {
            return;
        }

        let rel_left = (inter_left - self.left) as i64;
        let rel_right = (inter_right - self.left) as i64;
        let rel_top = (inter_top - self.top) as i64;
        let rel_bottom = (inter_bottom - self.top) as i64;

        let w = self.width as i64;
        let h = self.height as i64;

        let col_start = ((rel_left * 16) / w).clamp(0, 15) as usize;
        let col_end = (((rel_right * 16 + w - 1) / w).clamp(1, 16) - 1) as usize;

        let row_start = ((rel_top * 8) / h).clamp(0, 7) as usize;
        let row_end = (((rel_bottom * 8 + h - 1) / h).clamp(1, 8) - 1) as usize;

        for r in row_start..=row_end {
            for c in col_start..=col_end {
                let bit_idx = r * 16 + c;
                if bit_idx < 128 {
                    self.tiles |= 1u128 << bit_idx;
                }
            }
        }
    }

    pub fn coverage_ratio(&self) -> f32 {
        self.tiles.count_ones() as f32 / 128.0
    }
}

struct OcclusionEnumState {
    shell_hwnd: HWND,
    self_pid: u32,
    progman: HWND,
    workerw: HWND,
    mpv_pids: Vec<u32>,
    mpv_hwnds: Vec<usize>,
    wallpaper_hwnds: Vec<usize>,
    monitor_map: HashMap<String, MonitorOcclusionStatus>,
    grid_map: HashMap<String, MonitorGrid>,
    visible_inspected: usize,
}

#[cfg(windows)]
unsafe extern "system" fn enum_occlusion_proc(hwnd: HWND, lparam: LPARAM) -> i32 {
    let state = &mut *(lparam as *mut OcclusionEnumState);

    // 1. Quick visibility & minimized check
    if IsWindowVisible(hwnd) == 0 || IsIconic(hwnd) != 0 {
        return 1;
    }

    // 2. Shell window & desktop checks
    if (!state.shell_hwnd.is_null() && hwnd == state.shell_hwnd)
        || (!state.progman.is_null() && hwnd == state.progman)
        || (!state.workerw.is_null() && hwnd == state.workerw)
    {
        return 1;
    }

    // 3. Check known HWNDs (main window, wallpaper webviews, MPV video engines)
    let hwnd_val = hwnd as usize;
    if state.wallpaper_hwnds.contains(&hwnd_val) || state.mpv_hwnds.contains(&hwnd_val) {
        return 1;
    }

    // 4. Process ID check: ignore ALL windows belonging to AetherFlow or MPV child processes
    let mut pid: u32 = 0;
    GetWindowThreadProcessId(hwnd, &mut pid);
    if pid == state.self_pid || state.mpv_pids.contains(&pid) {
        return 1;
    }

    // 5. Parent & ancestor check: ignore any window attached to Progman, WorkerW, or Shell
    let parent = GetParent(hwnd);
    if !parent.is_null() {
        if (!state.progman.is_null() && parent == state.progman)
            || (!state.workerw.is_null() && parent == state.workerw)
            || (!state.shell_hwnd.is_null() && parent == state.shell_hwnd)
        {
            return 1;
        }
    }
    let root = GetAncestor(hwnd, GA_ROOTOWNER);
    if !root.is_null() && root != hwnd {
        if (!state.progman.is_null() && root == state.progman)
            || (!state.workerw.is_null() && root == state.workerw)
            || (!state.shell_hwnd.is_null() && root == state.shell_hwnd)
        {
            return 1;
        }
    }
    let parent_root = GetAncestor(hwnd, GA_ROOT);
    if !parent_root.is_null() && parent_root != hwnd {
        if (!state.progman.is_null() && parent_root == state.progman)
            || (!state.workerw.is_null() && parent_root == state.workerw)
            || (!state.shell_hwnd.is_null() && parent_root == state.shell_hwnd)
        {
            return 1;
        }
    }

    // 6. Cloaked check (virtual desktop / background UWP app)
    let mut cloaked: u32 = 0;
    let dwm_res = DwmGetWindowAttribute(
        hwnd,
        14, // DWMWA_CLOAKED
        &mut cloaked as *mut _ as _,
        std::mem::size_of::<u32>() as u32,
    );
    if dwm_res == 0 && cloaked != 0 {
        return 1;
    }

    // 7. Skip tool windows and transparent click-through overlays
    let ex_style = GetWindowLongW(hwnd, GWL_EXSTYLE) as u32;
    if (ex_style & WS_EX_TOOLWINDOW) != 0 || (ex_style & 0x00000020 /* WS_EX_TRANSPARENT */) != 0 {
        return 1;
    }

    // 8. Skip desktop, taskbar, shell flyouts, and video engine classes
    let mut class_buf = [0u16; 64];
    let len = GetClassNameW(hwnd, class_buf.as_mut_ptr(), 64);
    let class_name = if len > 0 {
        String::from_utf16_lossy(&class_buf[..len as usize])
    } else {
        String::new()
    };
    if class_name == "WorkerW"
        || class_name == "Progman"
        || class_name == "SHELLDLL_DefView"
        || class_name == "SysListView32"
        || class_name == "Shell_TrayWnd"
        || class_name == "Shell_SecondaryTrayWnd"
        || class_name == "Windows.UI.Core.CoreWindow"
        || class_name == "mpv"
        || class_name == "SideBar_HTMLHostWindow"
        || class_name == "Dwm"
    {
        return 1;
    }

    // 9. Ignore tiny windows / widgets (< 160x160)
    let mut wr: RECT = std::mem::zeroed();
    if GetWindowRect(hwnd, &mut wr) == 0 {
        return 1;
    }
    let w = wr.right - wr.left;
    let h = wr.bottom - wr.top;
    if w < 160 || h < 160 {
        return 1;
    }

    state.visible_inspected += 1;
    if state.visible_inspected > 120 {
        return 0; // Stop enumeration after 120 candidate visible windows
    }

    // Mark tiles for each monitor this window intersects (Grid Pause Algorithm)
    for grid in state.grid_map.values_mut() {
        grid.mark_window(&wr);
    }

    let monitor = MonitorFromWindow(hwnd, MONITOR_DEFAULTTONULL);
    if !monitor.is_null() {
        let mut mi: MONITORINFOEXW = std::mem::zeroed();
        mi.monitorInfo.cbSize = std::mem::size_of::<MONITORINFOEXW>() as u32;
        if GetMonitorInfoW(monitor, &mut mi as *mut _ as *mut MONITORINFO) != 0 {
            let nul_idx = mi.szDevice.iter().position(|&c| c == 0).unwrap_or(32);
            let dev_name = String::from_utf16_lossy(&mi.szDevice[..nul_idx]);
            let label = get_monitor_label(&dev_name);

            // Fullscreen check: covers physical monitor screen (including taskbar)
            // Tolerance of 10px handles multi-monitor coordinates, DPI scaling margins, and invisible borders
            let covers_monitor = wr.left <= (mi.monitorInfo.rcMonitor.left + 10)
                && wr.top <= (mi.monitorInfo.rcMonitor.top + 10)
                && wr.right >= (mi.monitorInfo.rcMonitor.right - 10)
                && wr.bottom >= (mi.monitorInfo.rcMonitor.bottom - 10);

            // Maximized check: standard Win32 IsZoomed OR covers work area
            let is_zoomed = IsZoomed(hwnd) != 0;
            let covers_work = wr.left <= (mi.monitorInfo.rcWork.left + 15)
                && wr.top <= (mi.monitorInfo.rcWork.top + 15)
                && wr.right >= (mi.monitorInfo.rcWork.right - 15)
                && wr.bottom >= (mi.monitorInfo.rcWork.bottom - 15);

            let is_maximized = is_zoomed || covers_work || covers_monitor;

            if covers_monitor || is_maximized {
                let entry = state.monitor_map.entry(label.clone()).or_default();
                if covers_monitor {
                    entry.is_fullscreen = true;
                }
                if is_maximized {
                    entry.is_maximized = true;
                }
                let mut title_buf = [0u16; 128];
                let tlen = GetWindowTextW(hwnd, title_buf.as_mut_ptr(), 128);
                let title = if tlen > 0 {
                    String::from_utf16_lossy(&title_buf[..tlen as usize])
                } else {
                    String::new()
                };
                log_msg(&format!(
                    "[OCCLUSION DETECTED] HWND=0x{:X} pid={} class='{}' title='{}' monitor='{}' (fs={}, max={})",
                    hwnd_val, pid, class_name, title, label, covers_monitor, is_maximized
                ));
            }
        }
    }

    1
}

#[cfg(windows)]
pub fn inspect_monitor_occlusion_states(app: &AppHandle) -> (HashMap<String, MonitorOcclusionStatus>, bool) {
    let monitor_map: HashMap<String, MonitorOcclusionStatus> = HashMap::new();
    let mut is_app_focused = false;
    let self_pid = std::process::id();

    let mut mpv_pids: Vec<u32> = Vec::new();
    let mut mpv_hwnds: Vec<usize> = Vec::new();
    if let Ok(guard) = MPV_PLAYERS.lock() {
        if let Some(ref map) = *guard {
            for proc in map.values() {
                mpv_pids.push(proc.child.id());
                if proc.hwnd != 0 {
                    mpv_hwnds.push(proc.hwnd);
                }
            }
        }
    }

    let mut wallpaper_hwnds: Vec<usize> = Vec::new();
    for (label, win) in app.webview_windows() {
        if label.starts_with("wallpaper_") || label == "main" {
            if let Ok(h) = win.hwnd() {
                wallpaper_hwnds.push(h.0 as usize);
            }
        }
    }

    unsafe {
        let shell_hwnd = GetShellWindow();
        let progman_class = [80, 114, 111, 103, 109, 97, 110, 0]; // "Progman\0"
        let progman = FindWindowW(progman_class.as_ptr(), std::ptr::null());
        let worker_class = [87, 111, 114, 107, 101, 114, 87, 0]; // "WorkerW\0"
        let workerw = FindWindowW(worker_class.as_ptr(), std::ptr::null());

        let fg_hwnd = GetForegroundWindow();
        if !fg_hwnd.is_null() && fg_hwnd != shell_hwnd && fg_hwnd != progman && fg_hwnd != workerw {
            let fg_val = fg_hwnd as usize;
            let mut fg_pid: u32 = 0;
            GetWindowThreadProcessId(fg_hwnd, &mut fg_pid);
            if fg_pid != self_pid && !mpv_pids.contains(&fg_pid) && !wallpaper_hwnds.contains(&fg_val) && !mpv_hwnds.contains(&fg_val) {
                let mut class_buf = [0u16; 64];
                let len = GetClassNameW(fg_hwnd, class_buf.as_mut_ptr(), 64);
                let class_name = if len > 0 {
                    String::from_utf16_lossy(&class_buf[..len as usize])
                } else {
                    String::new()
                };
                if class_name != "WorkerW"
                    && class_name != "Progman"
                    && class_name != "SHELLDLL_DefView"
                    && class_name != "SysListView32"
                    && class_name != "Shell_TrayWnd"
                    && class_name != "Shell_SecondaryTrayWnd"
                    && class_name != "mpv"
                    && class_name != "Windows.UI.Core.CoreWindow"
                    && class_name != "SideBar_HTMLHostWindow"
                    && class_name != "Dwm"
                {
                    is_app_focused = true;
                }
            }
        }

        let mut grid_map: HashMap<String, MonitorGrid> = HashMap::new();
        if let Ok(monitors) = app.available_monitors() {
            for m in monitors {
                if let Some(name) = m.name() {
                    let label = get_monitor_label(name);
                    let pos = m.position();
                    let size = m.size();
                    grid_map.insert(label, MonitorGrid::new(pos.x, pos.y, size.width as i32, size.height as i32));
                }
            }
        }

        let mut state = OcclusionEnumState {
            shell_hwnd,
            self_pid,
            progman,
            workerw,
            mpv_pids,
            mpv_hwnds,
            wallpaper_hwnds,
            monitor_map,
            grid_map,
            visible_inspected: 0,
        };

        EnumWindows(Some(enum_occlusion_proc), &mut state as *mut _ as LPARAM);

        let mut reports = Vec::new();
        // Evaluate Grid Pause Algorithm: if collectively occluded tiles exceed 85%, mark display as maximized/covered
        for (label, grid) in &state.grid_map {
            let ratio = grid.coverage_ratio();
            let entry = state.monitor_map.entry(label.clone()).or_default();
            entry.coverage_ratio = ratio;
            if ratio >= 0.85 {
                entry.is_maximized = true;
                log_msg(&format!(
                    "[GRID OCCLUSION] monitor='{}' coverage={:.1}% ({}/128 tiles occluded) -> marked as covered",
                    label, ratio * 100.0, grid.tiles.count_ones()
                ));
            }

            let mut bool_tiles = Vec::with_capacity(128);
            for r in 0..8 {
                for c in 0..16 {
                    let idx = r * 16 + c;
                    let is_set = (grid.tiles & (1u128 << idx)) != 0;
                    bool_tiles.push(is_set);
                }
            }
            reports.push(MonitorGridReport {
                label: label.clone(),
                width: grid.width,
                height: grid.height,
                covered_tiles: grid.tiles.count_ones(),
                total_tiles: 128,
                coverage_percent: (ratio as f64) * 100.0,
                is_occluded: ratio >= 0.85,
                tiles: bool_tiles,
            });
        }

        if let Ok(mut guard) = LATEST_GRID_REPORTS.lock() {
            *guard = reports;
        }

        (state.monitor_map, is_app_focused)
    }
}

#[cfg(not(windows))]
pub fn inspect_monitor_occlusion_states(_app: &AppHandle) -> (HashMap<String, MonitorOcclusionStatus>, bool) {
    (HashMap::new(), false)
}

fn extract_youtube_id(url: &str) -> Option<String> {
    if !mpv::is_youtube_url(url) {
        return None;
    }
    if let Some(pos) = url.find("v=") {
        let after_v = &url[pos + 2..];
        let id: String = after_v.chars().take_while(|c| c.is_alphanumeric() || *c == '-' || *c == '_').collect();
        if !id.is_empty() {
            return Some(id);
        }
    }
    for prefix in &["youtu.be/", "/embed/", "/live/"] {
        if let Some(pos) = url.find(prefix) {
            let after = &url[pos + prefix.len()..];
            let id: String = after.chars().take_while(|c| c.is_alphanumeric() || *c == '-' || *c == '_').collect();
            if !id.is_empty() {
                return Some(id);
            }
        }
    }
    None
}

fn is_same_wallpaper_source(path_a: &str, path_b: &str) -> bool {
    if path_a.is_empty() || path_b.is_empty() {
        return false;
    }
    if path_a == path_b {
        return true;
    }
    let norm_a = path_a.trim().replace('\\', "/").to_lowercase();
    let norm_b = path_b.trim().replace('\\', "/").to_lowercase();
    if norm_a == norm_b {
        return true;
    }
    if let (Some(id_a), Some(id_b)) = (extract_youtube_id(path_a), extract_youtube_id(path_b)) {
        return id_a == id_b;
    }
    false
}

static LAST_POST_START_SYNC: Mutex<Option<(String, std::time::Instant)>> = Mutex::new(None);

fn trigger_post_start_sync_align(_app: AppHandle, source: String, target_label: String, my_ticket: u64) {
    std::thread::spawn(move || {
        let is_yt = mpv::is_youtube_url(&source);
        let initial_delay_ms = if is_yt { 4500 } else { 2000 };
        std::thread::sleep(std::time::Duration::from_millis(initial_delay_ms));

        // Verify ticket has not been superseded
        if get_apply_ticket(&target_label) != my_ticket {
            return;
        }

        // Check if sync is enabled
        let sync_enabled = if let Ok(guard) = PERFORMANCE_SETTINGS.lock() {
            guard.wallpaper_sync_on_resume
        } else {
            false
        };
        if !sync_enabled {
            return;
        }

        // Retry loop: up to 3 attempts, spaced by 2.5 seconds, in case streams are still buffering
        for attempt in 1..=3 {
            if get_apply_ticket(&target_label) != my_ticket {
                return;
            }

            // Debounce: If another thread already synced this source within the last 4 seconds, skip
            if let Ok(last_guard) = LAST_POST_START_SYNC.lock() {
                if let Some((ref last_src, ref last_time)) = *last_guard {
                    if is_same_wallpaper_source(&source, last_src) && last_time.elapsed() < std::time::Duration::from_millis(4000) {
                        return;
                    }
                }
            }

            // Gather active matching MPV players
            let players = {
                let guard = match MPV_PLAYERS.lock() {
                    Ok(g) => g,
                    Err(_) => return,
                };
                let map = match *guard {
                    Some(ref m) => m,
                    None => return,
                };
                let mut list = Vec::new();
                for (lbl, proc) in map {
                    if is_same_wallpaper_source(&source, &proc.video_path) {
                        list.push((lbl.clone(), proc.pipe_name.clone()));
                    }
                }
                list
            };

            if players.len() < 2 {
                return;
            }

            // Reference monitor: prefer DISPLAY1 or primary, else first in list
            let ref_idx = players
                .iter()
                .position(|(lbl, _)| lbl.ends_with("DISPLAY1") || lbl.contains("primary"))
                .unwrap_or(0);
            let (ref_label, ref_pipe) = &players[ref_idx];

            let ref_time_opt = mpv::query_ipc_property(ref_pipe, "time-pos")
                .or_else(|| mpv::query_ipc_property(ref_pipe, "playback-time"))
                .and_then(|v| v.as_f64());

            let ref_time = match ref_time_opt {
                Some(t) if t >= 0.0 => t,
                _ => {
                    log_msg(&format!(
                        "[POST-START-SYNC] Attempt {}/3: Ref '{}' not ready yet, retrying in 2.5s...",
                        attempt, ref_label
                    ));
                    std::thread::sleep(std::time::Duration::from_millis(2500));
                    continue;
                }
            };

            let duration_opt = mpv::query_ipc_property(ref_pipe, "duration").and_then(|v| v.as_f64());
            if is_yt {
                match duration_opt {
                    Some(d) if d > 0.0 && !d.is_nan() && !d.is_infinite() => {}
                    _ => {
                        log_msg(&format!(
                            "[POST-START-SYNC] YouTube stream on '{}' has no valid duration (live stream). Skipping.",
                            ref_label
                        ));
                        return;
                    }
                }
            }

            let mut all_ready = true;
            let mut sync_performed = false;

            for (other_label, other_pipe) in &players {
                if other_label == ref_label {
                    continue;
                }

                let other_time_opt = mpv::query_ipc_property(other_pipe, "time-pos")
                    .or_else(|| mpv::query_ipc_property(other_pipe, "playback-time"))
                    .and_then(|v| v.as_f64());

                let other_time = match other_time_opt {
                    Some(t) if t >= 0.0 => t,
                    _ => {
                        all_ready = false;
                        break;
                    }
                };

                // Re-query reference time to minimize delta error
                let current_ref_time = mpv::query_ipc_property(ref_pipe, "time-pos")
                    .or_else(|| mpv::query_ipc_property(ref_pipe, "playback-time"))
                    .and_then(|v| v.as_f64())
                    .unwrap_or(ref_time);

                let is_other_paused = mpv::query_ipc_property(other_pipe, "pause").and_then(|v| v.as_bool()).unwrap_or(false);
                if is_other_paused {
                    log_msg(&format!(
                        "[POST-START-SYNC] Monitor '{}' is currently paused (occluded). Skipping post-start alignment.",
                        other_label
                    ));
                    continue;
                }

                let is_ref_paused = mpv::query_ipc_property(ref_pipe, "pause").and_then(|v| v.as_bool()).unwrap_or(false);
                if is_ref_paused {
                    log_msg(&format!(
                        "[POST-START-SYNC] Reference '{}' is currently paused (occluded). Skipping post-start alignment.",
                        ref_label
                    ));
                    continue;
                }

                let delta = (current_ref_time - other_time).abs();
                log_msg(&format!(
                    "[POST-START-SYNC] Comparing '{}' (at {:.2}s) with ref '{}' (at {:.2}s), delta={:.3}s",
                    other_label, other_time, ref_label, current_ref_time, delta
                ));

                // Threshold: If difference is > 80ms, synchronize
                if delta >= 0.080 {
                    let target_pos = match duration_opt {
                        Some(d) if d > 0.0 => {
                            let mut p = current_ref_time % d;
                            if p < 0.0 { p = 0.0; }
                            p.min((d - 0.05).max(0.0))
                        }
                        _ => current_ref_time.max(0.0),
                    };

                    log_msg(&format!(
                        "[POST-START-SYNC] Seamlessly seeking '{}' to target {:.2}s (ref '{:.2}s', delta={:.3}s)",
                        other_label, target_pos, current_ref_time, delta
                    ));

                    // Seek directly to exact target frame while playing
                    let _ = mpv::send_ipc_cmd(other_pipe, serde_json::json!({
                        "command": ["seek", target_pos, "absolute+exact"]
                    }));

                    sync_performed = true;

                    // 5. Verify sync accuracy after 250ms
                    let pipe_ver = other_pipe.clone();
                    let ref_pipe_ver = ref_pipe.clone();
                    let lbl_ver = other_label.clone();
                    let ref_lbl_ver = ref_label.clone();
                    std::thread::spawn(move || {
                        std::thread::sleep(std::time::Duration::from_millis(250));
                        let t_other = mpv::query_ipc_property(&pipe_ver, "time-pos").and_then(|v| v.as_f64());
                        let t_ref = mpv::query_ipc_property(&ref_pipe_ver, "time-pos").and_then(|v| v.as_f64());
                        if let (Some(to), Some(tr)) = (t_other, t_ref) {
                            let diff = (tr - to).abs();
                            let msg = format!(
                                "[POST-START-SYNC-VERIFIED] monitor='{}' ({:.3}s) ref='{}' ({:.3}s) post_delta={:.3}s",
                                lbl_ver, to, ref_lbl_ver, tr, diff
                            );
                            log_msg(&msg);
                            println!("{}", msg);
                        }
                    });
                } else {
                    log_msg(&format!(
                        "[POST-START-SYNC] Monitor '{}' already in sync with ref '{}' (delta={:.3}s < 80ms)",
                        other_label, ref_label, delta
                    ));
                }
            }

            if !all_ready {
                log_msg(&format!(
                    "[POST-START-SYNC] Attempt {}/3: Not all monitors ready, retrying in 2.5s...",
                    attempt
                ));
                std::thread::sleep(std::time::Duration::from_millis(2500));
                continue;
            }

            if sync_performed {
                if let Ok(mut last_guard) = LAST_POST_START_SYNC.lock() {
                    *last_guard = Some((source.clone(), std::time::Instant::now()));
                }
                log_msg("[POST-START-SYNC] Post-start synchronization cycle completed successfully.");
            }
            break;
        }
    });
}

fn maybe_sync_mpv_on_resume(
    resuming_label: &str,
    target_paused_monitors: &std::collections::HashSet<String>,
) {
    let sync_enabled = if let Ok(guard) = PERFORMANCE_SETTINGS.lock() {
        guard.wallpaper_sync_on_resume
    } else {
        false
    };
    if !sync_enabled {
        return;
    }

    // Step 2 & 6: Inspect MPV_PLAYERS briefly to identify resuming process and active reference
    let (resuming_pipe, resuming_video, ref_pipe, ref_label) = {
        let mpv_guard = match MPV_PLAYERS.lock() {
            Ok(g) => g,
            Err(_) => return,
        };
        let map = match *mpv_guard {
            Some(ref m) => m,
            None => return,
        };

        let resuming_proc = match map.get(resuming_label) {
            Some(p) => p,
            None => return,
        };

        let resuming_video = resuming_proc.video_path.clone();
        let resuming_pipe = resuming_proc.pipe_name.clone();

        // Search for an active, currently playing reference monitor with matching source
        let mut best_ref: Option<(String, String)> = None;
        for (other_label, other_proc) in map {
            if other_label == resuming_label {
                continue;
            }
            if target_paused_monitors.contains(other_label) {
                continue; // Cannot be reference if covered / paused
            }
            if !is_same_wallpaper_source(&resuming_video, &other_proc.video_path) {
                continue; // Different content: do NOT synchronize (STEP 6)
            }
            // Prefer primary monitor if available, else first active matching monitor
            let is_primary = other_label.ends_with("DISPLAY1") || other_label.contains("primary");
            if best_ref.is_none() || is_primary {
                best_ref = Some((other_proc.pipe_name.clone(), other_label.clone()));
            }
        }

        match best_ref {
            Some((pipe, label)) => (resuming_pipe, resuming_video, pipe, label),
            None => {
                log_msg(&format!(
                    "[RESUME-SYNC] No active playing reference found for monitor '{}' with matching source '{}'. Resuming normally.",
                    resuming_label, resuming_video
                ));
                return;
            }
        }
    };

    let is_yt = mpv::is_youtube_url(&resuming_video);

    // 1. Verify media is seekable (STEP 2)
    let is_seekable = mpv::query_ipc_property(&resuming_pipe, "seekable")
        .and_then(|v| v.as_bool())
        .unwrap_or(true);
    if !is_seekable {
        log_msg(&format!(
            "[RESUME-SYNC] Media on '{}' is not seekable. Resuming normally without seeking.",
            resuming_label
        ));
        return;
    }

    // 2. Query reference position (STEP 2)
    let ref_time_opt = mpv::query_ipc_property(&ref_pipe, "time-pos")
        .or_else(|| mpv::query_ipc_property(&ref_pipe, "playback-time"))
        .and_then(|v| v.as_f64());

    let ref_time = match ref_time_opt {
        Some(t) if t >= 0.0 => t,
        _ => {
            log_msg(&format!(
                "[RESUME-SYNC] Reference '{}' has unavailable/invalid playback position. Resuming normally.",
                ref_label
            ));
            return;
        }
    };

    // 3. Query duration
    let duration_opt = mpv::query_ipc_property(&ref_pipe, "duration")
        .or_else(|| mpv::query_ipc_property(&resuming_pipe, "duration"))
        .and_then(|v| v.as_f64());

    // 4. Protect YouTube Live streams: must have valid positive duration (STEP 5)
    if is_yt {
        match duration_opt {
            Some(d) if d > 0.0 && !d.is_nan() && !d.is_infinite() => {
                // Seekable YouTube VOD
            }
            _ => {
                log_msg(&format!(
                    "[RESUME-SYNC] YouTube stream on '{}' has no valid finite duration (live stream). Skipping sync seek.",
                    resuming_label
                ));
                return;
            }
        }
    }

    // 5. Calculate target position respecting duration for looping videos (STEP 4)
    let target_pos = match duration_opt {
        Some(d) if d > 0.0 => {
            let mut pos = ref_time % d;
            if pos < 0.0 {
                pos = 0.0;
            }
            pos.min((d - 0.05).max(0.0))
        }
        _ => ref_time.max(0.0),
    };

    // 6. Perform seek on resuming player while paused (STEP 3)
    if let Err(e) = mpv::send_ipc_cmd(&resuming_pipe, serde_json::json!({
        "command": ["seek", target_pos, "absolute+exact"]
    })) {
        log_msg(&format!(
            "[RESUME-SYNC WARN] Failed to seek '{}' to {:.2}s: {}. Continuing resume.",
            resuming_label, target_pos, e
        ));
    } else {
        let msg = format!(
            "[RESUME-SYNC] Catch-up seek applied for monitor '{}' to target {:.2}s (ref '{}' at {:.2}s, duration {:?})",
            resuming_label, target_pos, ref_label, ref_time, duration_opt
        );
        log_msg(&msg);
        println!("{}", msg);
    }
}

fn measure_resume_sync(app: &AppHandle, resuming_label: &str) {
    let sync_enabled = if let Ok(guard) = PERFORMANCE_SETTINGS.lock() {
        guard.wallpaper_sync_on_resume
    } else {
        false
    };
    if !sync_enabled {
        return;
    }

    let (resuming_pipe, ref_pipe, ref_label) = {
        let mpv_guard = match MPV_PLAYERS.lock() {
            Ok(g) => g,
            Err(_) => return,
        };
        let map = match *mpv_guard {
            Some(ref m) => m,
            None => return,
        };
        let resuming_proc = match map.get(resuming_label) {
            Some(p) => p,
            None => return,
        };
        let resuming_video = resuming_proc.video_path.clone();
        let resuming_pipe = resuming_proc.pipe_name.clone();

        let mut found_ref = None;
        for (other_label, other_proc) in map {
            if other_label == resuming_label {
                continue;
            }
            if is_same_wallpaper_source(&resuming_video, &other_proc.video_path) {
                found_ref = Some((other_proc.pipe_name.clone(), other_label.clone()));
                break;
            }
        }
        match found_ref {
            Some((rpipe, rlabel)) => (resuming_pipe, rpipe, rlabel),
            None => return,
        }
    };

    let resumed_pos = mpv::query_ipc_property(&resuming_pipe, "time-pos").and_then(|v| v.as_f64());
    let ref_pos = mpv::query_ipc_property(&ref_pipe, "time-pos").and_then(|v| v.as_f64());
    let duration = mpv::query_ipc_property(&ref_pipe, "duration").and_then(|v| v.as_f64()).unwrap_or(0.0);

    let diff = match (ref_pos, resumed_pos) {
        (Some(r), Some(res)) => {
            let eff_r = if duration > 0.0 { r % duration } else { r };
            Some((res - eff_r).abs())
        }
        _ => None,
    };

    let report = format!(
        "[RESUME-SYNC MEASUREMENT] monitor='{}' ref='{}' ref_pos={:?} resumed_pos={:?} difference={:?} duration={}",
        resuming_label, ref_label, ref_pos, resumed_pos, diff, duration
    );
    log_msg(&report);
    println!("{}", report);

    let _ = app.emit("aether:resume-sync", serde_json::json!({
        "monitor": resuming_label,
        "reference": ref_label,
        "ref_pos": ref_pos,
        "resumed_pos": resumed_pos,
        "difference": diff,
    }));
}

pub fn start_system_state_monitor(app: AppHandle) {
    std::thread::spawn(move || {
        // Wait for startup to settle
        std::thread::sleep(std::time::Duration::from_millis(2500));
        let mut paused_monitors: std::collections::HashSet<String> = std::collections::HashSet::new();
        let mut audio_muted_by_policy = false;
        let mut taskbar_tick = 0u32;
        let mut sleep_interval_ms: u64 = 750;

        loop {
            // Adaptive sleep: chunked into 250ms slices so any immediate monitor sync request or state transition wakes up promptly
            let slices = (sleep_interval_ms / 250).max(1);
            for _ in 0..slices {
                std::thread::sleep(std::time::Duration::from_millis(250));
                if MONITOR_SYNC_REQUESTED.load(std::sync::atomic::Ordering::Relaxed) {
                    break;
                }
            }

            // Periodically maintain taskbar style against Explorer resets (every ~3s)
            taskbar_tick = taskbar_tick.wrapping_add(1);
            if taskbar_tick % 4 == 0 {
                taskbar::maintain_taskbar_style();
            }

            let force_sync = MONITOR_SYNC_REQUESTED.swap(false, std::sync::atomic::Ordering::SeqCst);

            let (pause_on_battery, pause_on_fullscreen, pause_on_maximized, multi_monitor_pause_mode, audio_playback_rule) = {
                if let Ok(guard) = PERFORMANCE_SETTINGS.lock() {
                    let mode = if guard.multi_monitor_pause_mode.is_empty() {
                        "per-display".to_string()
                    } else {
                        guard.multi_monitor_pause_mode.clone()
                    };
                    let rule = if guard.audio_playback_rule.is_empty() {
                        "always".to_string()
                    } else {
                        guard.audio_playback_rule.clone()
                    };
                    (
                        guard.pause_on_battery,
                        guard.pause_on_fullscreen,
                        guard.pause_on_maximized,
                        mode,
                        rule,
                    )
                } else {
                    (true, true, true, "per-display".to_string(), "always".to_string())
                }
            };

            let on_battery = pause_on_battery && is_running_on_battery();
            let (occlusion_map, is_app_focused) = inspect_monitor_occlusion_states(&app);

            // ── Screensaver Idle Detection, Smart Inhibition & Input Wakeup ─────────────────
            let is_screensaver_active = SCREENSAVER_ACTIVE.lock().map(|g| *g).unwrap_or(false);
            let screensaver_cfg = SCREENSAVER_SETTINGS.lock().map(|g| g.clone()).unwrap_or_else(|_| ScreensaverSettings {
                enabled: false,
                idle_timeout_mins: 5,
                mode: String::new(),
                specific_engine: None,
                specific_config: None,
                fade_in_secs: 1.0,
                lock_on_resume: false,
                grace_period_secs: 5,
                mute_audio: true,
                inhibit_fullscreen: true,
                inhibit_maximized: true,
                inhibit_audio: true,
            });

            #[cfg(windows)]
            {
                let idle_ms = get_system_idle_millis();
                if screensaver_cfg.enabled && !is_screensaver_active {
                    let timeout_ms = (screensaver_cfg.idle_timeout_mins as u64).max(1) * 60 * 1000;

                    let any_fullscreen = occlusion_map.values().any(|s| s.is_fullscreen) || is_presentation_or_d3d_fullscreen();
                    let any_maximized = occlusion_map.values().any(|s| s.is_maximized);
                    let is_audio_playing = is_system_audio_active();

                    let suppress_fullscreen = screensaver_cfg.inhibit_fullscreen && any_fullscreen;
                    let suppress_maximized = screensaver_cfg.inhibit_maximized && any_maximized;
                    let suppress_audio = screensaver_cfg.inhibit_audio && is_audio_playing && (is_app_focused || any_fullscreen || any_maximized || audio_muted_by_policy);

                    let is_suppressed = suppress_fullscreen || suppress_maximized || suppress_audio;

                    if idle_ms >= timeout_ms {
                        if is_suppressed {
                            if taskbar_tick % 8 == 0 {
                                let reason = if suppress_fullscreen {
                                    "fullscreen app / presentation active"
                                } else if suppress_maximized {
                                    "maximized window active"
                                } else {
                                    "active media / audio playback detected"
                                };
                                let msg = format!(
                                    "[SCREENSAVER] Idle timeout reached ({}ms >= {}ms), but screensaver suppressed: {}",
                                    idle_ms, timeout_ms, reason
                                );
                                log_msg(&msg);
                                println!("{}", msg);
                            }
                        } else {
                            let msg = format!(
                                "[SCREENSAVER] System idle: {}ms >= {}ms. Triggering screensaver.",
                                idle_ms, timeout_ms
                            );
                            log_msg(&msg);
                            println!("{}", msg);
                            let _ = trigger_screensaver(app.clone(), Some(false));
                        }
                    }
                } else if is_screensaver_active {
                    let elapsed = SCREENSAVER_ACTIVATED_AT.lock().ok()
                        .and_then(|g| g.as_ref().map(|t| t.elapsed()))
                        .unwrap_or(std::time::Duration::from_secs(999));
                    let is_preview = SCREENSAVER_IS_PREVIEW.lock().map(|g| *g).unwrap_or(false);

                    let min_grace_ms = if is_preview { 4000 } else { 1500 };
                    let max_idle_ms = if is_preview { 120 } else { 300 };

                    if elapsed >= std::time::Duration::from_millis(min_grace_ms) && idle_ms < max_idle_ms {
                        log_msg("[SCREENSAVER] User input detected via GetLastInputInfo. Dismissing screensaver.");
                        println!("[SCREENSAVER] User input detected. Dismissing screensaver.");
                        let _ = dismiss_screensaver(app.clone());
                    }
                }
            }

            if is_screensaver_active {
                std::thread::sleep(std::time::Duration::from_millis(150));
                continue;
            }

            // Collect active wallpaper window labels
            let windows = app.webview_windows();
            let mut wallpaper_labels: Vec<String> = Vec::new();
            for (label, _) in &windows {
                if label.starts_with("wallpaper_") {
                    wallpaper_labels.push(label.clone());
                }
            }

            // Fallback: if no webview wallpaper windows exist yet, check MPV players
            if let Ok(mpv_guard) = MPV_PLAYERS.lock() {
                if let Some(ref map) = *mpv_guard {
                    for label in map.keys() {
                        if !wallpaper_labels.contains(label) {
                            wallpaper_labels.push(label.clone());
                        }
                    }
                }
            }

            // Fallback: check available system monitors
            if wallpaper_labels.is_empty() {
                if let Ok(monitors) = app.available_monitors() {
                    for m in monitors {
                        if let Some(name) = m.name() {
                            wallpaper_labels.push(get_monitor_label(name));
                        }
                    }
                }
            }

            let mut target_paused_monitors: std::collections::HashSet<String> = std::collections::HashSet::new();
            let mut physically_covered_monitors: std::collections::HashSet<String> = std::collections::HashSet::new();
            let mut any_monitor_pause_triggered = false;

            for label in &wallpaper_labels {
                let status = occlusion_map.get(label).cloned().unwrap_or_default();

                // Physical occlusion (fullscreen or maximized window on this monitor)
                if status.is_fullscreen || status.is_maximized {
                    physically_covered_monitors.insert(label.clone());
                }

                let is_fs = pause_on_fullscreen && status.is_fullscreen;
                let is_max = pause_on_maximized && status.is_maximized;
                let should_pause = is_fs || is_max;

                if should_pause {
                    any_monitor_pause_triggered = true;
                }
                if on_battery || should_pause {
                    target_paused_monitors.insert(label.clone());
                }
            }

            // Global mode: if any monitor triggers pause, pause all
            if multi_monitor_pause_mode == "all-displays" && any_monitor_pause_triggered {
                for label in &wallpaper_labels {
                    target_paused_monitors.insert(label.clone());
                }
            }

            // User manual pause: if manually paused, force all wallpapers to pause
            if USER_MANUALLY_PAUSED.load(std::sync::atomic::Ordering::Relaxed) {
                for label in &wallpaper_labels {
                    target_paused_monitors.insert(label.clone());
                }
            }

            let any_monitor_physically_covered = !physically_covered_monitors.is_empty();

            // Identify which display is the active audio emitter
            let target_audio_pref = get_target_audio_monitor_label(&app);
            let audio_source_label = target_audio_pref
                .filter(|p| wallpaper_labels.contains(p))
                .or_else(|| {
                    let mut found = None;
                    if let Ok(guard) = MPV_PLAYERS.lock() {
                        if let Some(ref map) = *guard {
                            if map.len() == 1 {
                                found = map.keys().next().cloned();
                            } else if map.len() > 1 {
                                let primary = get_primary_monitor_label(&app);
                                if let Some(ref p) = primary {
                                    if map.contains_key(p) {
                                        found = Some(p.clone());
                                    }
                                }
                                if found.is_none() {
                                    found = map.keys().next().cloned();
                                }
                            }
                        }
                    }
                    found.or_else(|| get_primary_monitor_label(&app))
                         .or_else(|| wallpaper_labels.first().cloned())
                });

            // Audio playback policy evaluation:
            let all_paused = target_paused_monitors.len() >= wallpaper_labels.len() && !wallpaper_labels.is_empty();
            let should_mute_audio = if all_paused {
                // All active wallpapers are paused
                true
            } else if audio_playback_rule == "mute-focused" {
                is_app_focused
            } else if audio_playback_rule == "mute-covered" {
                if multi_monitor_pause_mode == "all-displays" {
                    any_monitor_physically_covered
                } else {
                    // In Isolated (per-display) mode:
                    // Mute if all displays are covered/paused, or if the active audio source screen is covered/paused
                    let all_covered = physically_covered_monitors.len() >= wallpaper_labels.len() && !wallpaper_labels.is_empty();
                    let audio_source_covered = match audio_source_label {
                        Some(ref src) => physically_covered_monitors.contains(src) || target_paused_monitors.contains(src),
                        None => any_monitor_physically_covered,
                    };
                    all_covered || audio_source_covered
                }
            } else {
                // "always": only mute if all are paused
                false
            };

            // 1. Process pause state transitions per monitor
            for label in &wallpaper_labels {
                let was_p = paused_monitors.contains(label);
                let should_p = target_paused_monitors.contains(label);

                if was_p != should_p || force_sync {
                    let is_resuming = was_p && !should_p;
                    if is_resuming {
                        maybe_sync_mpv_on_resume(label, &target_paused_monitors);
                    }

                    set_mpv_pause(Some(label.clone()), should_p);
                    if wallpaper_labels.len() <= 1 {
                        set_mpv_pause(None, should_p);
                    }

                    if is_resuming {
                        let label_cloned = label.clone();
                        let app_cloned = app.clone();
                        std::thread::spawn(move || {
                            std::thread::sleep(std::time::Duration::from_millis(100));
                            measure_resume_sync(&app_cloned, &label_cloned);
                        });
                    }

                    let event_name = if should_p { "aether:pause" } else { "aether:resume" };
                    let legacy_event = if should_p { "aura:pause" } else { "aura:resume" };
                    if let Some(win) = app.get_webview_window(label.as_str()) {
                        #[cfg(windows)]
                        if !should_p {
                            if let Ok(hwnd) = win.hwnd() {
                                unsafe {
                                    InvalidateRect(hwnd.0 as HWND, std::ptr::null(), 1);
                                    UpdateWindow(hwnd.0 as HWND);
                                }
                            }
                        }
                        let _ = win.emit_to(label.as_str(), event_name, serde_json::json!({ "target": label }));
                        let _ = win.emit_to(label.as_str(), legacy_event, serde_json::json!({ "target": label }));
                    }
                    let _ = app.emit(event_name, serde_json::json!({ "target": label }));
                    let _ = app.emit(legacy_event, serde_json::json!({ "target": label }));
                    if wallpaper_labels.len() <= 1 {
                        let _ = app.emit(event_name, serde_json::json!({ "target": "*" }));
                        let _ = app.emit(legacy_event, serde_json::json!({ "target": "*" }));
                    }

                    let state_str = if should_p { "PAUSED" } else { "RESUMED" };
                    let msg = format!("[SYSTEM MONITOR] Display '{}' state -> {} (force_sync={})", label, state_str, force_sync);
                    log_msg(&msg);
                    println!("{}", msg);
                }
            }

            // 2. Process audio mute/unmute policy transitions
            if should_mute_audio != audio_muted_by_policy || force_sync {
                audio_muted_by_policy = should_mute_audio;
                set_mpv_mute(app.clone(), None, should_mute_audio);
                let mute_event = if should_mute_audio { "aether:mute" } else { "aether:unmute" };
                let legacy_mute_event = if should_mute_audio { "aura:mute" } else { "aura:unmute" };
                for (label, win) in &windows {
                    if label.starts_with("wallpaper_") {
                        let is_target = match audio_source_label {
                            Some(ref src) => src == label,
                            None => true,
                        };
                        let win_event = if should_mute_audio || !is_target { "aether:mute" } else { "aether:unmute" };
                        let legacy_win_event = if should_mute_audio || !is_target { "aura:mute" } else { "aura:unmute" };
                        let _ = win.emit_to(label.as_str(), win_event, serde_json::json!({ "target": label }));
                        let _ = win.emit_to(label.as_str(), legacy_win_event, serde_json::json!({ "target": label }));
                    }
                }
                let _ = app.emit(mute_event, serde_json::json!({ "target": "*" }));
                let _ = app.emit(legacy_mute_event, serde_json::json!({ "target": "*" }));
                let msg = format!("[SYSTEM MONITOR] Audio policy transition -> muted: {} (rule: {}, audio_src: {:?}, force_sync={})", should_mute_audio, audio_playback_rule, audio_source_label, force_sync);
                log_msg(&msg);
                println!("{}", msg);
            }

            if taskbar_tick % 8 == 0 || force_sync {
                let diag = format!(
                    "[SYSTEM MONITOR DIAG] displays={:?} paused={:?} covered={:?} audio_src={:?} mode={} fs_rule={} max_rule={} rule={} muted={}",
                    wallpaper_labels,
                    target_paused_monitors,
                    physically_covered_monitors,
                    audio_source_label,
                    multi_monitor_pause_mode,
                    pause_on_fullscreen,
                    pause_on_maximized,
                    audio_playback_rule,
                    audio_muted_by_policy
                );
                log_msg(&diag);
            }

            // 3. Update global tracking
            let is_any_paused = !target_paused_monitors.is_empty();
            if let Ok(mut p_guard) = IS_SYSTEM_PAUSED.lock() {
                *p_guard = is_any_paused;
            }
            if let Ok(mut cpm_guard) = CURRENT_PAUSED_MONITORS.lock() {
                *cpm_guard = target_paused_monitors.clone();
            }
            paused_monitors = target_paused_monitors;

            // 4. Playlist Auto-Rotation Background Trigger
            if !is_screensaver_active {
                if let Ok(timers) = PLAYLIST_TIMERS.lock() {
                    if !timers.is_empty() {
                        let mut last_ticks = PLAYLIST_LAST_TICK.lock().unwrap_or_else(|e| e.into_inner());
                        let now = std::time::Instant::now();
                        for timer in timers.iter() {
                            if !timer.enabled || timer.interval_secs == 0 {
                                continue;
                            }

                            // Do NOT rotate wallpaper while this monitor (or all monitors) are paused by maximized/fullscreen windows or battery
                            let is_scope_paused = if timer.monitor_scope == "*" {
                                if multi_monitor_pause_mode == "all-displays" {
                                    !paused_monitors.is_empty()
                                } else {
                                    paused_monitors.len() >= wallpaper_labels.len() && !wallpaper_labels.is_empty()
                                }
                            } else {
                                paused_monitors.contains(&timer.monitor_scope)
                                    || paused_monitors.contains(&format!("wallpaper_{}", timer.monitor_scope.trim_start_matches("wallpaper_").trim_start_matches('_')))
                            };

                            if is_scope_paused {
                                // Skip rotation while occluded/paused so we don't rotate wallpapers behind maximized/fullscreen windows.
                                // The timer remains eligible and will trigger rotation as soon as the desktop is uncovered!
                                continue;
                            }

                            let key = format!("{}:{}", timer.monitor_scope, timer.playlist_id);
                            let should_fire = match last_ticks.get(&key) {
                                Some(last) => now.duration_since(*last).as_secs() >= timer.interval_secs,
                                None => {
                                    last_ticks.insert(key.clone(), now);
                                    false
                                }
                            };
                            if should_fire {
                                last_ticks.insert(key, now);
                                let payload = serde_json::json!({
                                    "monitor_scope": timer.monitor_scope,
                                    "playlist_id": timer.playlist_id
                                });
                                log_msg(&format!("[PLAYLIST] Rotation timer triggered: {:?}", payload));
                                let _ = app.emit("aether:playlist-rotate-trigger", payload);
                            }
                        }
                    }
                }
            }

            // 5. Watch Folder Periodic Scan (every ~6 ticks = 4.5s)
            if taskbar_tick % 6 == 0 && WATCH_FOLDER_ENABLED.load(std::sync::atomic::Ordering::Relaxed) {
                let _ = scan_watch_folder(app.clone());
            }

            // 6. Adaptive Occlusion Polling Interval:
            // When all active wallpapers are paused by fullscreen/maximized apps or battery,
            // or when no wallpaper is running at all (tray/idle), throttle Win32 window enumeration
            // and tile-grid occlusion checks from 750ms to 2500-4000ms.
            // This drops background idle/paused CPU from ~2-3% to <0.3%, while the 250ms slice check
            // guarantees rapid responsiveness (<250ms) whenever windows move or change.
            let has_active_monitors = !wallpaper_labels.is_empty();
            let all_are_paused = has_active_monitors && paused_monitors.len() >= wallpaper_labels.len();
            let no_wallpapers = !has_active_monitors || {
                let mpv_empty = MPV_PLAYERS.lock().map(|g| g.as_ref().map(|m| m.is_empty()).unwrap_or(true)).unwrap_or(true);
                let active_empty = ACTIVE_WALLPAPERS.lock().map(|g| g.as_ref().map(|m| m.is_empty()).unwrap_or(true)).unwrap_or(true);
                mpv_empty && active_empty
            };

            sleep_interval_ms = if no_wallpapers {
                4000
            } else if all_are_paused {
                2500
            } else {
                750
            };
        }
    });
}

// ─── PROGMAN / WorkerW trick ─────────────────────────────────────────────────

struct DesktopWindows {
    shell: HWND,
    workerw: HWND,
}

#[cfg(windows)]
unsafe extern "system" fn enum_window(window: HWND, lparam: LPARAM) -> i32 {
    let state = &mut *(lparam as *mut DesktopWindows);
    let shell_class: Vec<u16> = "SHELLDLL_DefView\0".encode_utf16().collect();
    let worker_class: Vec<u16> = "WorkerW\0".encode_utf16().collect();
    
    let mut cls_buf = [0u16; 256];
    let cls_len = GetClassNameW(window, cls_buf.as_mut_ptr(), 256);
    let cls = String::from_utf16_lossy(&cls_buf[..cls_len as usize]);
    
    if cls == "WorkerW" {
        log_msg(&format!("[AetherFlow Enum] Found WorkerW: 0x{:X}", window as usize));
    }

    let shell = FindWindowExW(window, std::ptr::null_mut(), shell_class.as_ptr(), std::ptr::null());
    if !shell.is_null() {
        log_msg(&format!("[AetherFlow Enum] Found SHELLDLL_DefView inside 0x{:X}", window as usize));
        state.shell = shell; // Found the shell view (the icons)
        let worker = FindWindowExW(std::ptr::null_mut(), window, worker_class.as_ptr(), std::ptr::null());
        if !worker.is_null() {
            log_msg(&format!("[AetherFlow Enum] Found sibling WorkerW: 0x{:X}", worker as usize));
            state.workerw = worker;
        }
    }
    1 // TRUE — keep enumerating
}

#[cfg(windows)]
pub unsafe extern "system" fn borderless_wallpaper_subclass_proc(
    hwnd: HWND,
    msg: u32,
    wparam: windows_sys::Win32::Foundation::WPARAM,
    lparam: windows_sys::Win32::Foundation::LPARAM,
    _uid_subclass: usize,
    _ref_data: usize,
) -> windows_sys::Win32::Foundation::LRESULT {
    const WM_NCCALCSIZE: u32 = 0x0083;
    const WM_NCPAINT: u32 = 0x0085;
    const WM_NCACTIVATE: u32 = 0x0086;

    match msg {
        WM_NCCALCSIZE => {
            if wparam != 0 {
                // Return 0: entire window rectangle is the client area.
                // ZERO pixels for title bar, ZERO pixels for borders.
                return 0;
            }
        }
        WM_NCPAINT => {
            // Return 0: suppress all non-client painting (no title bar, no borders drawn).
            return 0;
        }
        WM_NCACTIVATE => {
            // Return 1: suppress active/inactive caption changes.
            return 1;
        }
        _ => {}
    }
    windows_sys::Win32::UI::Shell::DefSubclassProc(hwnd, msg, wparam, lparam)
}

fn log_msg(msg: &str) {
    use std::io::Write;
    if let Ok(mut file) = std::fs::OpenOptions::new().create(true).append(true).open("desktop_debug.log") {
        let _ = writeln!(file, "{}", msg);
    }
}

fn log_lifecycle(event: &str, details: &str) {
    let now = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap_or_default();
    let secs = now.as_secs();
    let millis = now.subsec_millis();
    let msg = format!("[LIFECYCLE {}.{:03}] {:<24} | {}", secs, millis, event, details);
    log_msg(&msg);
    println!("{}", msg);
}

/// Pin a native window handle into the WorkerW layer so it renders
/// behind desktop icons but above the bare wallpaper bitmap.
///
/// Does NOT accept x/y/w/h — it queries MonitorFromWindow + GetMonitorInfoW for
/// the exact screen rect, then uses MapWindowPoints to convert to parent-client
/// coordinates after SetParent.  This avoids every coordinate-system assumption
/// (virtual-desktop origin, DPI scaling, primary-monitor bias) that caused the
/// left-gap / second-monitor spill in earlier attempts.
#[cfg(windows)]
fn pin_hwnd_as_wallpaper(hwnd: HWND, target_bounds: Option<(i32, i32, i32, i32)>) -> bool {
    if is_main_hwnd(hwnd) {
        let err = format!("[DIAG 10 CRITICAL REJECT] pin_hwnd_as_wallpaper was called with MAIN_HWND 0x{:X}! Aborting!", hwnd as usize);
        log_msg(&err);
        eprintln!("{}", err);
        return false;
    }

    unsafe {
        // Ensure thread is attached to interactive desktop (WinSta0\Default)
        // especially when called from background Tokio worker threads
        use windows_sys::Win32::System::StationsAndDesktops::{OpenDesktopW, SetThreadDesktop};
        const DESKTOP_ALL_ACCESS: u32 = 0x01FF;
        let default_name: Vec<u16> = "Default\0".encode_utf16().collect();
        let hdesk = OpenDesktopW(default_name.as_ptr(), 0, 0, DESKTOP_ALL_ACCESS);
        if !hdesk.is_null() {
            let ok = SetThreadDesktop(hdesk);
            log_msg(&format!("[AetherFlow WP] SetThreadDesktop: {}", ok != 0));
        }

        log_msg(&format!("\n--- [AetherFlow WP] pin_hwnd_as_wallpaper called: hwnd=0x{:X} ---",
            hwnd as usize));
        mpv::dump_window_diagnostics("PIN_ENTRY", hwnd);

        // ── Step 1: exact monitor bounds from target_bounds or Win32 ─────────
        let (mon_screen_x, mon_screen_y, mon_w, mon_h) = if let Some(bounds) = target_bounds {
            log_msg(&format!(
                "[AetherFlow WP] Using target monitor bounds: ({},{}) {}x{}",
                bounds.0, bounds.1, bounds.2, bounds.3
            ));
            bounds
        } else {
            let monitor_handle = MonitorFromWindow(hwnd, MONITOR_DEFAULTTONEAREST);
            let mut minfo: MONITORINFO = std::mem::zeroed();
            minfo.cbSize = std::mem::size_of::<MONITORINFO>() as u32;
            GetMonitorInfoW(monitor_handle, &mut minfo);

            let rc = minfo.rcMonitor;
            let x = rc.left;
            let y = rc.top;
            let w = rc.right  - rc.left;
            let h = rc.bottom - rc.top;
            log_msg(&format!(
                "[AetherFlow WP] Monitor rcMonitor: left={} top={} right={} bottom={} ({}x{})",
                x, y, rc.right, rc.bottom, w, h
            ));
            (x, y, w, h)
        };

        let vscreen_x = GetSystemMetrics(SM_XVIRTUALSCREEN);
        let vscreen_y = GetSystemMetrics(SM_YVIRTUALSCREEN);

        log_msg(&format!(
            "[AetherFlow WP] Monitor screen bounds: ({},{}) {}x{}",
            mon_screen_x, mon_screen_y, mon_w, mon_h
        ));
        log_msg(&format!("[AetherFlow WP] Virtual desktop origin: ({},{})", vscreen_x, vscreen_y));

        // Log HWND rect before any reparenting
        let mut hwnd_rect: RECT = std::mem::zeroed();
        GetWindowRect(hwnd, &mut hwnd_rect);
        log_msg(&format!(
            "[AetherFlow WP] HWND rect BEFORE SetParent: ({},{}) ({},{})",
            hwnd_rect.left, hwnd_rect.top, hwnd_rect.right, hwnd_rect.bottom
        ));

        // ── Step 2: find Progman and spawn WorkerW ────────────────────────────────
        let mut state = DesktopWindows {
            shell: std::ptr::null_mut(),
            workerw: std::ptr::null_mut(),
        };

        let progman_class: Vec<u16> = "Progman\0".encode_utf16().collect();
        let progman_title: Vec<u16> = "Program Manager\0".encode_utf16().collect();
        let mut progman = FindWindowW(progman_class.as_ptr(), progman_title.as_ptr());
        if progman.is_null() {
            progman = FindWindowW(progman_class.as_ptr(), std::ptr::null());
        }
        if progman.is_null() {
            progman = GetShellWindow();
        }

        if progman.is_null() {
            log_msg("[AetherFlow WP] Progman not ready on first attempt (cold boot / reboot). Waiting for Explorer...");
            for attempt in 0..10 {
                std::thread::sleep(std::time::Duration::from_millis(100));
                progman = FindWindowW(progman_class.as_ptr(), progman_title.as_ptr());
                if progman.is_null() {
                    progman = FindWindowW(progman_class.as_ptr(), std::ptr::null());
                }
                if progman.is_null() {
                    progman = GetShellWindow();
                }
                if !progman.is_null() {
                    log_msg(&format!("[AetherFlow WP] Found Progman on retry #{} ({}ms): 0x{:X}", attempt + 1, (attempt + 1) * 100, progman as usize));
                    break;
                }
            }
        }

        let progman = if !progman.is_null() {
            progman
        } else {
            log_msg("[AetherFlow WP] CRITICAL: Cannot find Progman or ShellWindow! Hiding window to prevent black desktop overlay.");
            ShowWindow(hwnd, 0); // SW_HIDE
            return false;
        };
        
        log_msg(&format!("[AetherFlow WP] Using progman HWND = 0x{:X}", progman as usize));

        let shell_class: Vec<u16> = "SHELLDLL_DefView\0".encode_utf16().collect();
        let worker_class: Vec<u16> = "WorkerW\0".encode_utf16().collect();

        // Check if Progman has WS_EX_NOREDIRECTIONBITMAP (Windows 11 raised desktop mode)
        let prog_ex = GetWindowLongW(progman, GWL_EXSTYLE) as u32;
        let is_raised_desktop = (prog_ex & 0x00200000) != 0;
        log_msg(&format!("[AetherFlow WP] Progman exStyle=0x{:08X}, is_raised_desktop={}", prog_ex, is_raised_desktop));

        // Always send 0x052C to progman on Windows so Explorer splits the desktop layer on cold boot
        log_msg("[AetherFlow WP] Sending 0x052C to progman (wParam=0x0D lParam=0x1)...");
        SendMessageTimeoutW(progman, 0x052C, 0x0D, 0x1, SMTO_NORMAL, 1000, std::ptr::null_mut());
        std::thread::sleep(std::time::Duration::from_millis(100));

        let progman_shell = FindWindowExW(progman, std::ptr::null_mut(), shell_class.as_ptr(), std::ptr::null());
        log_msg(&format!("[AetherFlow WP] SHELLDLL_DefView under Progman = 0x{:X}", progman_shell as usize));
        if !progman_shell.is_null() {
            state.shell = progman_shell;
        } else {
            for attempt in 0..5usize {
                EnumWindows(Some(enum_window), &mut state as *mut DesktopWindows as LPARAM);
                if !state.shell.is_null() {
                    log_msg(&format!("[AetherFlow WP] SHELLDLL_DefView found on attempt {}", attempt + 1));
                    break;
                }
                if attempt < 4 {
                    std::thread::sleep(std::time::Duration::from_millis(80));
                }
            }
        }

        // In Windows 11 raised desktop, WorkerW is created as a child of Progman
        let child_workerw = FindWindowExW(progman, std::ptr::null_mut(), worker_class.as_ptr(), std::ptr::null());
        if !child_workerw.is_null() {
            state.workerw = child_workerw;
            log_msg(&format!("[AetherFlow WP] Found child WorkerW under Progman: 0x{:X}", child_workerw as usize));
            // Move child WorkerW to HWND_BOTTOM so Explorer's static wallpaper never draws over our live wallpaper
            SetWindowPos(child_workerw, 1 as HWND, 0, 0, 0, 0, SWP_NOMOVE | SWP_NOSIZE | SWP_NOACTIVATE);
        }

        log_msg(&format!("[AetherFlow WP] After enum: workerw=0x{:X} shell=0x{:X}",
            state.workerw as usize, state.shell as usize));

        use windows_sys::Win32::UI::WindowsAndMessaging::{GetLayeredWindowAttributes, WS_MINIMIZE};
        
        // Attach borderless subclass to suppress WM_NCCALCSIZE, WM_NCPAINT, WM_NCACTIVATE
        windows_sys::Win32::UI::Shell::SetWindowSubclass(
            hwnd,
            Some(borderless_wallpaper_subclass_proc),
            1001,
            0,
        );

        let style = GetWindowLongW(hwnd, GWL_STYLE) as u32;
        let new_style = (style | WS_CHILD) & !(WS_POPUP | WS_CAPTION | WS_THICKFRAME | WS_BORDER | 0x00400000 /* WS_DLGFRAME */ | 0x00080000 /* WS_SYSMENU */ | 0x00020000 /* WS_MINIMIZEBOX */ | 0x00010000 /* WS_MAXIMIZEBOX */ | WS_MINIMIZE | 0x10000000 /* WS_VISIBLE */);
        SetWindowLongW(hwnd, GWL_STYLE, new_style as i32);
        
        let ex_style = GetWindowLongW(hwnd, GWL_EXSTYLE) as u32;
        // Strip 3D non-client borders and frames, and strip WS_EX_APPWINDOW (0x00040000) so wallpaper never appears in Taskbar/Alt+Tab
        let new_ex_style = (ex_style | WS_EX_LAYERED | WS_EX_TOOLWINDOW | WS_EX_NOACTIVATE | 0x00000020 /* WS_EX_TRANSPARENT */) & !(0x00000100 | 0x00000200 | 0x00000001 | 0x00020000 | 0x00040000);
        SetWindowLongW(hwnd, GWL_EXSTYLE, new_ex_style as i32);

        // Detect if window is already layered and staged transparent (alpha = 0)
        let mut cr_key = 0u32;
        let mut current_alpha = 0u8;
        let mut lwa_flags = 0u32;
        let is_already_layered = GetLayeredWindowAttributes(hwnd, &mut cr_key, &mut current_alpha, &mut lwa_flags) != 0;
        let is_staged_transparent = is_already_layered && current_alpha == 0;

        // ── DWM non-client, border, and corner removal ────────────────────────
        // Disables the invisible 9px DWM drop-shadow frame that causes the left gap and right spill
        let ncr_disabled: u32 = 1; // DWMNCRP_DISABLED
        DwmSetWindowAttribute(
            hwnd,
            2, // DWMWA_NCRENDERING_POLICY
            &ncr_disabled as *const u32 as *const _,
            std::mem::size_of::<u32>() as u32,
        );
        // Disable Windows 11 rounded window corners
        let do_not_round: u32 = 1; // DWMWCP_DONOTROUND
        DwmSetWindowAttribute(
            hwnd,
            33, // DWMWA_WINDOW_CORNER_PREFERENCE
            &do_not_round as *const u32 as *const _,
            std::mem::size_of::<u32>() as u32,
        );
        // Kill Windows 11 1-pixel active/accent window border (DWMWA_BORDER_COLOR = 34)
        let border_none: u32 = 0xFFFFFFFE; // DWMWA_COLOR_NONE
        DwmSetWindowAttribute(
            hwnd,
            34, // DWMWA_BORDER_COLOR
            &border_none as *const u32 as *const _,
            std::mem::size_of::<u32>() as u32,
        );
        
        log_msg(&format!("[AetherFlow WP] Set GWL_STYLE: 0x{:08X} -> 0x{:08X}, added WS_EX_LAYERED, DWM border killed, DWM frame disabled", style, new_style));

        let parent_hwnd = if is_raised_desktop || !progman_shell.is_null() {
            log_msg(&format!("[AetherFlow WP] MODE: Raised Desktop — parent = Progman 0x{:X}", progman as usize));
            progman
        } else if !state.workerw.is_null() {
            log_msg(&format!("[AetherFlow WP] MODE: Standard Desktop — parent = WorkerW 0x{:X}", state.workerw as usize));
            state.workerw
        } else {
            log_msg(&format!("[AetherFlow WP] MODE: Fallback — parent = Progman 0x{:X}", progman as usize));
            progman
        };

        // Log the parent's client rect before SetParent
        let mut parent_client: RECT = std::mem::zeroed();
        GetClientRect(parent_hwnd, &mut parent_client);
        log_msg(&format!(
            "[AetherFlow WP] Parent client rect: ({},{}) ({},{})",
            parent_client.left, parent_client.top,
            parent_client.right, parent_client.bottom
        ));

        mpv::dump_window_diagnostics("PIN_BEFORE_SET_PARENT", hwnd);
        SetParent(hwnd, parent_hwnd);
        let style_after = GetWindowLongW(hwnd, GWL_STYLE) as u32;
        let clean_style_after = (style_after | WS_CHILD | WS_VISIBLE) & !(WS_POPUP | WS_CAPTION | WS_THICKFRAME | WS_BORDER | 0x00400000 /* WS_DLGFRAME */ | 0x00080000 /* WS_SYSMENU */ | 0x00020000 /* WS_MINIMIZEBOX */ | 0x00010000 /* WS_MAXIMIZEBOX */ | WS_MINIMIZE);
        SetWindowLongW(hwnd, GWL_STYLE, clean_style_after as i32);

        // Re-attach subclass to guarantee non-client messages are trapped
        windows_sys::Win32::UI::Shell::SetWindowSubclass(
            hwnd,
            Some(borderless_wallpaper_subclass_proc),
            1001,
            0,
        );
        SetWindowPos(hwnd, std::ptr::null_mut(), 0, 0, 0, 0, SWP_NOMOVE | SWP_NOSIZE | SWP_NOZORDER | SWP_NOACTIVATE | SWP_FRAMECHANGED);
        mpv::dump_window_diagnostics("PIN_AFTER_SET_PARENT", hwnd);

        let mut hwnd_rect_after: RECT = std::mem::zeroed();
        GetWindowRect(hwnd, &mut hwnd_rect_after);
        log_msg(&format!(
            "[AetherFlow WP] HWND rect AFTER SetParent: ({},{}) ({},{})",
            hwnd_rect_after.left, hwnd_rect_after.top, hwnd_rect_after.right, hwnd_rect_after.bottom
        ));

        // Convert monitor screen top-left to parent client coordinates.
        // MapWindowPoints(NULL=HWND_DESKTOP, parent, pts, 1) is the authoritative
        // way to convert screen coords → parent-client coords on any DPI/layout.
        let mut pts = [POINT { x: mon_screen_x, y: mon_screen_y }];
        MapWindowPoints(std::ptr::null_mut(), parent_hwnd, pts.as_mut_ptr(), 1);
        let client_x = pts[0].x;
        let client_y = pts[0].y;

        log_msg(&format!(
            "[AetherFlow WP] Monitor screen ({},{}) → parent client ({},{})",
            mon_screen_x, mon_screen_y, client_x, client_y
        ));

        // ── Measure the non-client frame insets dynamically ─────────────────
        // We map the client area's (0,0) to screen coordinates and compare with
        // the outer window rect to determine the exact top, left, right, bottom padding.
        let mut pre_wr: RECT = std::mem::zeroed();
        let mut pre_cr: RECT = std::mem::zeroed();
        GetWindowRect(hwnd, &mut pre_wr);
        GetClientRect(hwnd, &mut pre_cr);

        let mut client_origin = [POINT { x: 0, y: 0 }];
        MapWindowPoints(hwnd, std::ptr::null_mut(), client_origin.as_mut_ptr(), 1);

        let left_frame = client_origin[0].x - pre_wr.left;
        let top_frame = client_origin[0].y - pre_wr.top;
        let right_frame = pre_wr.right - (client_origin[0].x + pre_cr.right);
        let bottom_frame = pre_wr.bottom - (client_origin[0].y + pre_cr.bottom);

        log_msg(&format!(
            "[AetherFlow WP] Measured frame insets: left={}, top={}, right={}, bottom={}",
            left_frame, top_frame, right_frame, bottom_frame
        ));
        log_msg(&format!(
            "[AetherFlow WP] Pre-positioning: WinRect=({},{})-({},{}) [{}x{}], ClientScreen=({},{})",
            pre_wr.left, pre_wr.top, pre_wr.right, pre_wr.bottom,
            pre_wr.right - pre_wr.left, pre_wr.bottom - pre_wr.top,
            client_origin[0].x, client_origin[0].y
        ));

        // ── Step 3: Exact Monitor Assignment ────────────────────────────────
        // Invariant: The wallpaper window must cover the exact physical monitor rectangle
        // without arbitrary padding or blind inflation. Window region clipping (SetWindowRgn)
        // causes DWM to render hard boundary artifacts at multi-monitor seams and must not be used.
        let adj_x = client_x;
        let adj_y = client_y;
        let adj_w = mon_w;
        let adj_h = mon_h;

        log_msg(&format!(
            "[AetherFlow WP] Exact monitor assignment: Target pos=({},{}) size={}x{} -> HWND pos=({},{}) size={}x{}",
            client_x, client_y, mon_w, mon_h,
            adj_x, adj_y, adj_w, adj_h
        ));

        // ── Z-Order Management ───────────────────────────────────────────────
        // The wallpaper must be BEHIND desktop icons (SHELLDLL_DefView) but
        // ABOVE the bare desktop wallpaper background.
        // If parent is Progman and state.shell is SHELLDLL_DefView, placing our
        // window behind state.shell (hWndInsertAfter = state.shell) guarantees
        // icons remain in front of the live wallpaper.
        let insert_after = if !state.shell.is_null() && parent_hwnd == progman {
            log_msg(&format!("[AetherFlow WP] Z-order: placing directly behind SHELLDLL_DefView 0x{:X}", state.shell as usize));
            state.shell
        } else {
            log_msg("[AetherFlow WP] Z-order: using HWND_BOTTOM");
            HWND_BOTTOM
        };

        use windows_sys::Win32::Foundation::GetLastError;
        use windows_sys::Win32::UI::WindowsAndMessaging::MoveWindow;

        let swp_res = SetWindowPos(
            hwnd,
            insert_after,
            adj_x, adj_y,
            adj_w, adj_h,
            SWP_NOACTIVATE | SWP_SHOWWINDOW | SWP_FRAMECHANGED,
        );
        let err = GetLastError();
        log_msg(&format!(
            "[AetherFlow WP] SetWindowPos with insert_after 0x{:X} pos=({},{}) size={}x{}: result={}, err={}",
            insert_after as usize, adj_x, adj_y, adj_w, adj_h, swp_res, err
        ));

        if swp_res == 0 {
            let swp_retry = SetWindowPos(
                hwnd,
                HWND_BOTTOM,
                adj_x, adj_y,
                adj_w, adj_h,
                SWP_NOACTIVATE | SWP_SHOWWINDOW | SWP_FRAMECHANGED,
            );
            log_msg(&format!(
                "[AetherFlow WP] SetWindowPos fallback to HWND_BOTTOM: result={}, err={}",
                swp_retry, GetLastError()
            ));
        }

        let mw_res = MoveWindow(hwnd, adj_x, adj_y, adj_w, adj_h, 1);
        log_msg(&format!(
            "[AetherFlow WP] MoveWindow: pos=({},{}) size={}x{}: result={}, err={}",
            adj_x, adj_y, adj_w, adj_h, mw_res, GetLastError()
        ));

        mpv::dump_window_diagnostics("PIN_AFTER_SET_WINDOW_POS", hwnd);

        // Ensure no leftover window region is clipping the window or creating DWM seam outlines
        SetWindowRgn(hwnd, std::ptr::null_mut(), 1);

        // Ensure child WorkerW (if present under Progman) stays at HWND_BOTTOM
        // so Explorer's static wallpaper bitmap never draws over our live wallpaper!
        if !state.workerw.is_null() && parent_hwnd == progman {
            SetWindowPos(
                state.workerw,
                1 as HWND, // HWND_BOTTOM
                0, 0, 0, 0,
                SWP_NOMOVE | SWP_NOSIZE | SWP_NOACTIVATE,
            );
        }

        // For non-staged windows (such as newly spawned WebViews), initialize alpha to 255 now that
        // the window is safely reparented behind desktop icons. Staged windows (like MPV) remain at
        // alpha = 0 until the caller performs the atomic swap.
        if !is_staged_transparent {
            SetLayeredWindowAttributes(hwnd, 0, 255, LWA_ALPHA);
        }

        // Force immediate DWM composition update and desktop client area invalidation
        InvalidateRect(hwnd, std::ptr::null(), 1);
        UpdateWindow(hwnd);
        RedrawWindow(
            hwnd,
            std::ptr::null(),
            std::ptr::null_mut(),
            RDW_INVALIDATE | RDW_UPDATENOW | RDW_ERASE | RDW_ALLCHILDREN,
        );

        // Verification log: measure resulting client screen coordinates
        let mut final_wr: RECT = std::mem::zeroed();
        let mut final_cr: RECT = std::mem::zeroed();
        GetWindowRect(hwnd, &mut final_wr);
        GetClientRect(hwnd, &mut final_cr);
        let mut final_client_screen = [POINT { x: 0, y: 0 }];
        MapWindowPoints(hwnd, std::ptr::null_mut(), final_client_screen.as_mut_ptr(), 1);

        log_msg(&format!(
            "[AetherFlow WP] POST-POSITION HWND WinRect: ({},{})-({},{}) [{}x{}]",
            final_wr.left, final_wr.top, final_wr.right, final_wr.bottom,
            final_wr.right - final_wr.left, final_wr.bottom - final_wr.top
        ));
        log_msg(&format!(
            "[AetherFlow WP] POST-POSITION ClientRect: [{}x{}], ScreenOrigin: ({},{}) vs MonitorOrigin: ({},{})",
            final_cr.right, final_cr.bottom,
            final_client_screen[0].x, final_client_screen[0].y,
            mon_screen_x, mon_screen_y
        ));
        log_msg("[AetherFlow WP] pin_hwnd_as_wallpaper complete.");
        let host_summary = format!(
            "[WALLPAPER HOST]\nparent HWND: 0x{:X}\nWebView controller created: true\nattached to WorkerW: 0x{:X}\nSetWindowPos: ({}, {}) [{} x {}]\nshown: true",
            parent_hwnd as usize,
            parent_hwnd as usize,
            adj_x, adj_y, adj_w, adj_h
        );
        log_msg(&host_summary);
        println!("{}", host_summary);

        // Reassert main window visibility so it is never obscured by the desktop wallpaper
        if let Some(main_h) = get_main_hwnd() {
            if IsWindow(main_h) != 0 && IsWindowVisible(main_h) != 0 {
                SetWindowPos(main_h, 0 as HWND, 0, 0, 0, 0, SWP_NOMOVE | SWP_NOSIZE | SWP_NOACTIVATE);
            }
        }
        if !hdesk.is_null() {
            windows_sys::Win32::System::StationsAndDesktops::CloseDesktop(hdesk);
        }
        true
    }
}

// ─── Helper: open or create the wallpaper window ─────────────────────────────

fn get_monitor_label(name: &str) -> String {
    format!("wallpaper_{}", name.replace("\\", "").replace(".", "_").replace(" ", "_"))
}

fn get_primary_monitor_label(app: &AppHandle) -> Option<String> {
    let monitors = app.available_monitors().unwrap_or_default();
    // 1. Position (0, 0) is always the Win32 Primary Display
    if let Some(pm) = monitors.iter().find(|m| m.position().x == 0 && m.position().y == 0) {
        if let Some(name) = pm.name() {
            return Some(get_monitor_label(name));
        }
    }
    // 2. Tauri primary_monitor query fallback
    if let Some(name) = app.primary_monitor().ok().flatten().and_then(|m| m.name().map(|n| n.to_string())) {
        return Some(get_monitor_label(&name));
    }
    // 3. First available monitor fallback
    monitors.first().and_then(|m| m.name().map(|n| get_monitor_label(n)))
}

fn get_target_audio_monitor_label(app: &AppHandle) -> Option<String> {
    if let Ok(guard) = PERFORMANCE_SETTINGS.lock() {
        if let Some(ref pref) = guard.preferred_audio_monitor {
            if !pref.is_empty() && pref != "auto" {
                return Some(pref.clone());
            }
        }
    }
    get_primary_monitor_label(app)
}

#[derive(Clone, PartialEq, Eq, Debug)]
struct MonSnapshot {
    name: String,
    x: i32,
    y: i32,
    w: u32,
    h: u32,
}

fn get_monitors_snapshot(app: &AppHandle) -> Vec<MonSnapshot> {
    app.available_monitors()
        .unwrap_or_default()
        .into_iter()
        .filter_map(|m| {
            m.name().map(|name| MonSnapshot {
                name: name.to_string(),
                x: m.position().x,
                y: m.position().y,
                w: m.size().width,
                h: m.size().height,
            })
        })
        .collect()
}

fn log_wallpaper_state(app: &AppHandle, monitor_count: usize) {
    let mut wallpaper_windows = Vec::new();
    for (label, win) in app.webview_windows() {
        if label.starts_with("wallpaper_") {
            wallpaper_windows.push((label, win));
        }
    }
    let host_count = wallpaper_windows.len();

    let mut state_log = format!(
        "\n[WALLPAPER STATE]\nmonitor count = {}\nwallpaper host count = {}",
        monitor_count, host_count
    );

    #[cfg(windows)]
    for (label, win) in &wallpaper_windows {
        if let Ok(hwnd) = win.hwnd() {
            let raw_hwnd = hwnd.0 as HWND;
            unsafe {
                let mut wr: RECT = std::mem::zeroed();
                GetWindowRect(raw_hwnd, &mut wr);
                let parent = GetParent(raw_hwnd);
                let is_vis = IsWindowVisible(raw_hwnd) != 0;

                state_log.push_str(&format!(
                    "\nHWND = 0x{:X}\nmonitor ID = {}\nGetWindowRect = left={} top={} right={} bottom={} ({}x{})\nparent HWND = 0x{:X}\nvisible = {}",
                    raw_hwnd as usize,
                    label,
                    wr.left, wr.top, wr.right, wr.bottom,
                    wr.right - wr.left, wr.bottom - wr.top,
                    parent as usize,
                    is_vis
                ));
            }
        }
    }

    log_msg(&state_log);
    println!("{}", state_log);

    if monitor_count != host_count {
        let warn_msg = format!(
            "[WALLPAPER STATE WARNING] Invariant violated: monitor count ({}) != wallpaper host count ({})",
            monitor_count, host_count
        );
        log_msg(&warn_msg);
        eprintln!("{}", warn_msg);
    } else {
        log_msg("[WALLPAPER STATE] Invariant verified: wallpaper host count == monitor count.");
        println!("[WALLPAPER STATE] Invariant verified: wallpaper host count == monitor count.");
    }
}

static YT_WALLPAPER_INIT_SCRIPT: &str = r#"
(function() {
    // 1. Safe neutralization of MediaSession actions to suppress Windows SMTC
    try {
        if (typeof window !== 'undefined') {
            if (window.MediaSession && window.MediaSession.prototype) {
                try {
                    window.MediaSession.prototype.setActionHandler = function() {};
                } catch(eProto) {}
            }
            if (window.navigator && window.navigator.mediaSession) {
                try {
                    window.navigator.mediaSession.setActionHandler = function() {};
                } catch(eNav) {}
            }
        }
    } catch (e) {}

    // 2. Hide YouTube edge controls / overlays & center play/pause bezel
    function applyHideStyles(doc) {
        if (!doc) return;
        try {
            var styleId = 'aetherflow-yt-hide-ui';
            if (!doc.getElementById(styleId)) {
                var s = doc.createElement('style');
                s.id = styleId;
                s.textContent = `
                    .ytp-bezel,
                    .ytp-bezel-icon,
                    .ytp-bezel-text,
                    .ytp-large-play-button,
                    .ytp-large-play-button-bg,
                    .ytp-pause-overlay,
                    .ytp-endscreen-content,
                    .ytp-ce-element,
                    .ytp-chrome-top,
                    .ytp-chrome-bottom,
                    .ytp-gradient-top,
                    .ytp-gradient-bottom,
                    .ytp-spinner,
                    .ytp-paid-content-overlay,
                    .ytp-ad-overlay-container,
                    .ytp-contextmenu {
                        display: none !important;
                        opacity: 0 !important;
                        visibility: hidden !important;
                        pointer-events: none !important;
                    }
                `;
                (doc.head || doc.documentElement).appendChild(s);
            }
        } catch(e) {}
    }

    function hideElements() {
        try {
            var host = window.location.hostname || '';
            if (host.includes('youtube.com') || host.includes('youtube-nocookie.com')) {
                applyHideStyles(document);
            }
            var frames = document.querySelectorAll('iframe');
            for (var i = 0; i < frames.length; i++) {
                try {
                    var fDoc = frames[i].contentDocument || (frames[i].contentWindow && frames[i].contentWindow.document);
                    if (fDoc) {
                        applyHideStyles(fDoc);
                    }
                } catch(eFrame) {}
            }
        } catch (e) {}
    }
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', hideElements);
    } else {
        hideElements();
    }
    window.addEventListener('load', hideElements);
    setInterval(hideElements, 500);
})();
"#;

fn reconcile_wallpaper_windows(app: &AppHandle) {
    let monitors = app.available_monitors().unwrap_or_default();
    let current_count = monitors.len();

    // 1. Build set of valid labels for currently connected monitors
    let mut valid_labels = std::collections::HashSet::new();
    for m in &monitors {
        if let Some(name) = m.name() {
            valid_labels.insert(get_monitor_label(name));
        }
    }

    // 2. Destroy wallpaper windows ONLY for monitors that no longer exist
    let active_windows = app.webview_windows();
    for (label, win) in active_windows {
        if label.starts_with("wallpaper_") && !valid_labels.contains(&label) {
            log_msg(&format!("[RECONCILIATION] Destroying wallpaper host for disconnected monitor: {}", label));
            println!("[RECONCILIATION] Destroying wallpaper host for disconnected monitor: {}", label);

            #[cfg(windows)]
            if let Ok(hwnd) = win.hwnd() {
                let raw_hwnd = hwnd.0 as HWND;
                unsafe {
                    if IsWindow(raw_hwnd) != 0 {
                        ShowWindow(raw_hwnd, 0); // SW_HIDE
                        SetParent(raw_hwnd, std::ptr::null_mut());
                        DestroyWindow(raw_hwnd);
                    }
                }
            }
            let _ = win.destroy();

            if let Ok(mut guard) = ACTIVE_WALLPAPERS.lock() {
                if let Some(ref mut map) = *guard {
                    map.remove(&label);
                }
            }

            if let Ok(mut mpv_guard) = MPV_PLAYERS.lock() {
                if let Some(ref mut map) = *mpv_guard {
                    if let Some(mut player) = map.remove(&label) {
                        player.terminate();
                    }
                }
            }
        }
    }

    // 3. Reconcile existing valid hosts or create new ones
    for monitor in &monitors {
        if let Some(name) = monitor.name() {
            let label = get_monitor_label(name);

            let size = monitor.size();
            let pos = monitor.position();
            let scale = monitor.scale_factor();
            let logical_w = size.width as f64 / scale;
            let logical_h = size.height as f64 / scale;
            let logical_x = pos.x as f64 / scale;
            let logical_y = pos.y as f64 / scale;

            if let Some(win) = app.get_webview_window(&label) {
                // EXISTING MONITOR: Recalculate using current rcMonitor, re-pin, update z-order & repaint
                log_msg(&format!(
                    "[RECONCILIATION] Re-aligning existing wallpaper host for {}: pos=({},{}) size={}x{}",
                    name, pos.x, pos.y, size.width, size.height
                ));
                println!(
                    "[RECONCILIATION] Re-aligning existing wallpaper host for {}: pos=({},{}) size={}x{}",
                    name, pos.x, pos.y, size.width, size.height
                );

                let _ = win.set_size(tauri::LogicalSize::new(logical_w, logical_h));
                let _ = win.set_position(tauri::LogicalPosition::new(logical_x, logical_y));

                #[cfg(windows)]
                {
                    let mut raw_hwnd_opt = None;
                    for _ in 0..20 {
                        if let Ok(hwnd) = win.hwnd() {
                            raw_hwnd_opt = Some(hwnd.0 as HWND);
                            break;
                        }
                        std::thread::sleep(std::time::Duration::from_millis(40));
                    }
                    if let Some(raw_hwnd) = raw_hwnd_opt {
                        let pinned = pin_hwnd_as_wallpaper(raw_hwnd, Some((pos.x, pos.y, size.width as i32, size.height as i32)));
                        if !pinned {
                            let _ = win.hide();
                        }
                    }
                }
            } else {
                // NEW MONITOR: Create host using the exact working startup path
                let new_mon_log = format!(
                    "\n[NEW MONITOR]\nstable ID: {}\nrcMonitor: left={} top={} right={} bottom={} ({}x{})",
                    name, pos.x, pos.y, pos.x + size.width as i32, pos.y + size.height as i32, size.width, size.height
                );
                log_msg(&new_mon_log);
                println!("{}", new_mon_log);

                let win_res = WebviewWindowBuilder::new(app, &label, WebviewUrl::App("wallpaper.html".into()))
                    .title("")
                    .decorations(false)
                    .transparent(true)
                    .visible(false)
                    .background_color(Color(0, 0, 0, 0))
                    .skip_taskbar(true)
                    .resizable(false)
                    .inner_size(logical_w, logical_h)
                    .position(logical_x, logical_y)
                    .initialization_script(YT_WALLPAPER_INIT_SCRIPT)
                    .build();

                match win_res {
                    Ok(win) => {
                        #[cfg(windows)]
                        {
                            let mut raw_hwnd_opt = None;
                            for _ in 0..25 {
                                if let Ok(hwnd) = win.hwnd() {
                                    raw_hwnd_opt = Some(hwnd.0 as HWND);
                                    break;
                                }
                                std::thread::sleep(std::time::Duration::from_millis(40));
                            }
                            if let Some(raw_hwnd) = raw_hwnd_opt {
                                let host_log = format!(
                                    "\n[WALLPAPER HOST]\nHWND created: 0x{:X}\nWebView2 created: true",
                                    raw_hwnd as usize
                                );
                                log_msg(&host_log);
                                println!("{}", host_log);

                                let pinned = pin_hwnd_as_wallpaper(raw_hwnd, Some((pos.x, pos.y, size.width as i32, size.height as i32)));
                                if pinned {
                                    let _ = win.set_ignore_cursor_events(true);
                                } else {
                                    log_msg(&format!("[WALLPAPER HOST] Window 0x{:X} failed to pin; keeping hidden.", raw_hwnd as usize));
                                    let _ = win.hide();
                                }
                            }
                        }
                    }
                    Err(err) => {
                        let err_log = format!("\n[WALLPAPER HOST] ERROR creating window for {}: {}", name, err);
                        log_msg(&err_log);
                        eprintln!("{}", err_log);
                    }
                }
            }
        }
    }

    // 4. Log verified wallpaper state
    log_wallpaper_state(app, current_count);
}

#[cfg(windows)]
fn trim_process_working_set() {
    trim_all_process_memory();
}

#[cfg(not(windows))]
fn trim_process_working_set() {}

fn schedule_post_apply_trim(delay_secs: u64) {
    #[cfg(windows)]
    {
        std::thread::spawn(move || {
            std::thread::sleep(std::time::Duration::from_secs(delay_secs));
            trim_all_process_memory();
        });
    }
}

fn ensure_wallpaper_windows(app: &AppHandle) {
    reconcile_wallpaper_windows(app);
}

// ─── Commands (callable from JS via invoke()) ─────────────────────────────────

#[tauri::command]
fn get_monitors(app: AppHandle) -> serde_json::Value {
    let monitors = app.available_monitors().unwrap_or_default();
    let mut mon_data: Vec<_> = monitors.into_iter().filter_map(|m| {
        let name = m.name()?.to_string();
        let label = get_monitor_label(&name);
        let pos = m.position();
        let size = m.size();
        let is_primary = pos.x == 0 && pos.y == 0;
        Some((name, label, size.width, size.height, pos.x, pos.y, is_primary))
    }).collect();

    // Primary monitor first, then left-to-right (x ascending), then top-to-bottom (y ascending)
    mon_data.sort_by(|a, b| {
        if a.6 != b.6 {
            b.6.cmp(&a.6) // primary first
        } else if a.4 != b.4 {
            a.4.cmp(&b.4)
        } else {
            a.5.cmp(&b.5)
        }
    });

    let mut out = Vec::new();
    for (idx, (name, label, width, height, x, y, is_primary)) in mon_data.into_iter().enumerate() {
        let display_num = idx + 1;
        let display_name = if is_primary {
            format!("Display {} (Primary)", display_num)
        } else {
            format!("Display {}", display_num)
        };

        out.push(serde_json::json!({
            "name": name,
            "label": label,
            "displayNumber": display_num,
            "displayName": display_name,
            "width": width,
            "height": height,
            "x": x,
            "y": y,
            "isPrimary": is_primary
        }));
    }
    serde_json::json!(out)
}

/// Apply a wallpaper engine: shows & pins the wallpaper window, then emits
/// 'aether:set-engine' to the wallpaper WebView so it boots the canvas engine,
/// or launches MPV for video wallpapers.
#[tauri::command]
async fn apply_wallpaper(
    app: AppHandle,
    engine_id: String,
    config: serde_json::Value,
    opacity: f64,
    brightness: f64,
    monitor_label: Option<String>,
) {
    let target = monitor_label.unwrap_or_else(|| "*".to_string());

    let resolved_engine_id = if engine_id == "video-player" || engine_id == "image-player" || engine_id == "web-stream" {
        engine_id.clone()
    } else if !engine_id.is_empty() && engine_id != "wallpaper" && engine_id != "custom" {
        engine_id.clone()
    } else if config.get("videoPath").and_then(|v| v.as_str()).is_some() {
        "video-player".to_string()
    } else if config.get("imagePath").and_then(|v| v.as_str()).is_some() {
        "image-player".to_string()
    } else if config.get("streamUrl").and_then(|v| v.as_str()).is_some() {
        "web-stream".to_string()
    } else {
        engine_id.clone()
    };

    let old_state_desc = if let Ok(guard) = ACTIVE_WALLPAPERS.lock() {
        guard.as_ref().and_then(|m| m.get(&target)).map(|s| format!("{}: {:?}", s.engine_id, s.config))
    } else {
        None
    }.unwrap_or_else(|| "none".to_string());

    log_lifecycle(
        "USER_APPLY_REQUEST",
        &format!(
            "target='{}', req_engine='{}', resolved_engine='{}', opacity={}, brightness={}, old_state='{}'",
            target, engine_id, resolved_engine_id, opacity, brightness, old_state_desc
        ),
    );

    // Record desired state per monitor for immediate recovery upon window mount
    if let Ok(mut guard) = ACTIVE_WALLPAPERS.lock() {
        let map = guard.get_or_insert_with(HashMap::new);
        map.insert(target.clone(), ActiveWallpaperState {
            engine_id: resolved_engine_id.clone(),
            config: config.clone(),
            opacity,
            brightness,
        });
    }

    #[cfg(windows)]
    let (main_h_usize, main_parent_before) = if let Some(main_h) = get_main_hwnd() {
        unsafe { (main_h as usize, GetParent(main_h) as usize) }
    } else {
        (0, 0)
    };
    #[cfg(windows)]
    {
        let msg = format!("[DIAG 1 & 4] Main AetherFlow HWND: 0x{:X}, Parent before apply: 0x{:X}", main_h_usize, main_parent_before);
        log_msg(&msg);
        println!("{}", msg);
    }

    let stream_url_opt = config.get("streamUrl").and_then(|v| v.as_str()).or_else(|| config.get("url").and_then(|v| v.as_str())).map(|s| s.to_string());
    let youtube_backend = config.get("youtubeBackend").and_then(|v| v.as_str()).unwrap_or("mpv");

    let local_video_path_opt = config.get("videoPath").and_then(|v| v.as_str()).map(|s| s.to_string());
    let is_youtube_stream = stream_url_opt.as_deref().map(mpv::is_youtube_url).unwrap_or(false)
        || local_video_path_opt.as_deref().map(mpv::is_youtube_url).unwrap_or(false);
    let use_mpv_for_youtube = is_youtube_stream && youtube_backend == "mpv";

    let video_path_opt = if use_mpv_for_youtube {
        if stream_url_opt.as_deref().map(mpv::is_youtube_url).unwrap_or(false) {
            stream_url_opt.clone()
        } else {
            local_video_path_opt.clone()
        }
    } else {
        local_video_path_opt.clone()
    };

    let wants_video = use_mpv_for_youtube || mpv::is_video_wallpaper(&resolved_engine_id, video_path_opt.as_deref());
    let is_video = wants_video && mpv::find_mpv_binary().is_ok();

    let mut monitors = app.available_monitors().unwrap_or_default();
    monitors.sort_by(|a, b| {
        let a_is_prim = a.position().x == 0 && a.position().y == 0;
        let b_is_prim = b.position().x == 0 && b.position().y == 0;
        if a_is_prim != b_is_prim {
            b_is_prim.cmp(&a_is_prim)
        } else if a.position().x != b.position().x {
            a.position().x.cmp(&b.position().x)
        } else {
            a.position().y.cmp(&b.position().y)
        }
    });
    let global_muted = config.get("muted").and_then(|v| v.as_bool()).unwrap_or(false);
    let global_volume = config.get("volume").and_then(|v| v.as_f64()).unwrap_or(50.0);

    if is_video {
        let vpath = match video_path_opt {
            Some(p) => p,
            None => {
                eprintln!("[MPV ERROR] Video or stream wallpaper requested but path/URL is missing in config");
                return;
            }
        };

        let speed_val = config.get("speedMultiplier").and_then(|v| v.as_f64()).or_else(|| config.get("speed").and_then(|v| v.as_f64())).unwrap_or(1.0);
        let is_all = target == "*"
            || target == "wallpaper_*"
            || target.trim_start_matches("wallpaper_").trim_start_matches('_') == "*";
        let is_duplicated = is_all;
        let mut audio_assigned = false;
        let target_audio_label = get_target_audio_monitor_label(&app);

        for (idx, mon) in monitors.iter().enumerate() {
            if let Some(name) = mon.name() {
                let label = get_monitor_label(name);
                let matches_target = is_all
                    || target == label
                    || target.trim_start_matches("wallpaper_").trim_start_matches('_').eq_ignore_ascii_case(label.trim_start_matches("wallpaper_").trim_start_matches('_'));
                if !matches_target {
                    continue;
                }

                // In duplicated mode, or per-screen mode with selected audio display,
                // only the target audio display plays audio.
                let is_target_audio = target_audio_label.as_deref() == Some(label.as_str()) || (idx == 0 && target_audio_label.is_none());
                let screen_muted = if global_muted {
                    true
                } else if is_duplicated {
                    if is_target_audio && !audio_assigned {
                        audio_assigned = true;
                        false
                    } else {
                        true // Secondary duplicate screen -> Mute audio!
                    }
                } else {
                    let has_explicit_pref = if let Ok(guard) = PERFORMANCE_SETTINGS.lock() {
                        guard.preferred_audio_monitor.is_some()
                    } else {
                        false
                    };
                    if has_explicit_pref {
                        !is_target_audio
                    } else {
                        false
                    }
                };
                let screen_volume = global_volume;

                let my_ticket = next_apply_ticket(&label);
                log_lifecycle(
                    "TICKET_ISSUED",
                    &format!("ticket={} monitor='{}' video='{}'", my_ticket, label, vpath),
                );

                // NOTE: We DO NOT terminate existing MPV or hide WebView2 here.
                // The visible wallpaper remains completely intact until replacement is verified ready.

                let pos = mon.position();
                let size = mon.size();

                #[cfg(windows)]
                {
                    let label_clone = label.clone();
                    let is_currently_paused = is_monitor_currently_paused(&label_clone);
                    let vpath_clone = vpath.clone();
                    let mon_x = pos.x;
                    let mon_y = pos.y;
                    let mon_w = size.width as i32;
                    let mon_h = size.height as i32;
                    let brightness_val = brightness;
                    let opacity_val = opacity;
                    let is_yt = use_mpv_for_youtube || mpv::is_youtube_url(&vpath_clone);
                    let app_handle = app.clone();

                    tauri::async_runtime::spawn_blocking(move || {
                        log_lifecycle(
                            "STAGED_MPV_SPAWN_START",
                            &format!("ticket={} monitor='{}' paused={}", my_ticket, label_clone, is_currently_paused),
                        );

                        let mut proc = match mpv::spawn_mpv_wallpaper(
                            &vpath_clone,
                            &label_clone,
                            mon_x,
                            mon_y,
                            mon_w,
                            mon_h,
                            Some(screen_volume),
                            Some(screen_muted || is_currently_paused),
                            Some(speed_val),
                            Some(brightness_val),
                            Some(opacity_val),
                            Some(my_ticket),
                            Some(is_currently_paused),
                        ) {
                            Ok(p) => p,
                            Err(err) => {
                                log_lifecycle(
                                    "STAGED_MPV_SPAWN_FAILED",
                                    &format!("ticket={} monitor='{}' error='{}'", my_ticket, label_clone, err),
                                );
                                return;
                            }
                        };

                        let hwnd = proc.hwnd as HWND;
                        if hwnd.is_null() {
                            log_lifecycle(
                                "STAGED_MPV_HWND_NULL",
                                &format!("ticket={} monitor='{}'", my_ticket, label_clone),
                            );
                            proc.terminate();
                            return;
                        }

                        log_lifecycle(
                            "STAGED_MPV_HWND_ACQUIRED",
                            &format!("ticket={} monitor='{}' HWND=0x{:X}", my_ticket, label_clone, hwnd as usize),
                        );
                        mpv::dump_window_diagnostics("MAIN_STAGED_MPV_HWND_ACQUIRED", hwnd);

                        // 1. Verify ticket is still active before beginning playback wait
                        if get_apply_ticket(&label_clone) != my_ticket {
                            log_lifecycle(
                                "STALE_TICKET_PRE_WAIT",
                                &format!("ticket={} superseded_by={}; terminating staged MPV", my_ticket, get_apply_ticket(&label_clone)),
                            );
                            proc.terminate();
                            return;
                        }

                        let max_wait_ms = if is_yt { 15000 } else { 5000 };
                        log_lifecycle(
                            "WAIT_FOR_PLAYBACK_START",
                            &format!("ticket={} monitor='{}' timeout={}ms", my_ticket, label_clone, max_wait_ms),
                        );
                        let ready = proc.wait_for_playback(max_wait_ms);
                        log_lifecycle(
                            "WAIT_FOR_PLAYBACK_RESULT",
                            &format!("ticket={} monitor='{}' ready={}", my_ticket, label_clone, ready),
                        );

                        // 2. Verify ticket is STILL active after waiting
                        if get_apply_ticket(&label_clone) != my_ticket {
                            log_lifecycle(
                                "STALE_TICKET_POST_WAIT",
                                &format!("ticket={} superseded_by={}; terminating staged MPV", my_ticket, get_apply_ticket(&label_clone)),
                            );
                            proc.terminate();
                            return;
                        }

                        // 3. Handle playback failure without dropping current wallpaper
                        if !ready {
                            log_lifecycle(
                                "PLAYBACK_FAILED_PRESERVE_CURRENT",
                                &format!("ticket={} monitor='{}'; preserving active wallpaper", my_ticket, label_clone),
                            );
                            proc.terminate();
                            return;
                        }

                        // 4. ATOMIC SWAP:
                        // First frame is decoded and ready! Pin into WorkerW behind icons
                        log_lifecycle(
                            "SWAP_PINNING_HWND",
                            &format!("ticket={} monitor='{}' HWND=0x{:X}", my_ticket, label_clone, hwnd as usize),
                        );
                        mpv::dump_window_diagnostics("MAIN_BEFORE_PIN_HWND", hwnd);
                        let pinned = pin_hwnd_as_wallpaper(hwnd, Some((mon_x, mon_y, mon_w, mon_h)));
                        if !pinned {
                            log_lifecycle(
                                "PIN_FAILED",
                                &format!("ticket={} monitor='{}' HWND=0x{:X}", my_ticket, label_clone, hwnd as usize),
                            );
                            proc.terminate();
                            return;
                        }
                        mpv::dump_window_diagnostics("MAIN_AFTER_PIN_HWND", hwnd);

                        // Set target opacity
                        let target_alpha = (opacity_val.clamp(0.05, 1.0) * 255.0).round() as u8;
                        unsafe {
                            SetLayeredWindowAttributes(hwnd, 0, target_alpha, LWA_ALPHA);
                        }
                        mpv::dump_window_diagnostics("MAIN_AFTER_TARGET_ALPHA_RESTORE", hwnd);

                        let _ = proc.set_volume(screen_volume);
                        if is_currently_paused {
                            let _ = proc.set_pause(true);
                            let _ = proc.set_mute(true);
                        } else {
                            let _ = proc.set_mute(screen_muted);
                        }

                        // Swap into MPV_PLAYERS and terminate the retired MPV instance
                        let mut old_player_to_retire = None;
                        if let Ok(mut mpv_guard) = MPV_PLAYERS.lock() {
                            let map = mpv_guard.get_or_insert_with(HashMap::new);
                            old_player_to_retire = map.insert(label_clone.clone(), proc);
                        }
                        if let Some(mut old_proc) = old_player_to_retire {
                            log_lifecycle(
                                "RETIRE_OLD_MPV",
                                &format!("ticket={} monitor='{}' old_HWND=0x{:X}", my_ticket, label_clone, old_proc.hwnd),
                            );
                            old_proc.terminate();
                        }

                        // Reconcile occlusion state immediately for the newly swapped player
                        MONITOR_SYNC_REQUESTED.store(true, std::sync::atomic::Ordering::SeqCst);

                        // Stop canvas webview rendering loop (0% CPU) without hiding its window
                        if let Some(win) = app_handle.get_webview_window(&label_clone) {
                            let _ = win.emit_to(label_clone.as_str(), "aether:stop", serde_json::json!({ "target": label_clone.clone() }));
                            let _ = win.emit_to(label_clone.as_str(), "aura:stop", serde_json::json!({ "target": label_clone.clone() }));
                        }
                        trim_process_working_set();

                        log_lifecycle(
                            "TRANSACTION_COMPLETE",
                            &format!(
                                "ticket={} monitor='{}' HWND=0x{:X} vol={} muted={} speed={} br={} op={}",
                                my_ticket, label_clone, hwnd as usize, screen_volume, screen_muted, speed_val, brightness_val, opacity_val
                            ),
                        );

                        trigger_post_start_sync_align(app_handle.clone(), vpath_clone.clone(), label_clone.clone(), my_ticket);
                    });
                }
            }
        }
    } else {
        // Invalidate in-flight MPV apply tickets so no background MPV buffers/commits over canvas
        invalidate_all_apply_tickets();
        log_lifecycle(
            "CANVAS_APPLY_START",
            &format!("target='{}' engine='{}'", target, resolved_engine_id),
        );
        ensure_wallpaper_windows(&app);
        // Canvas engine -> Route to WebView2 window
        let is_all = target == "*"
            || target == "wallpaper_*"
            || target.trim_start_matches("wallpaper_").trim_start_matches('_') == "*";
        // 1. Terminate any MPV instances
        if let Ok(mut mpv_guard) = MPV_PLAYERS.lock() {
            if let Some(ref mut map) = *mpv_guard {
                if is_all {
                    for (_, mut proc) in map.drain() {
                        proc.terminate();
                    }
                } else if let Some(mut proc) = map.remove(&target) {
                    proc.terminate();
                }
            }
        }
        if is_all {
            mpv::kill_all_mpv_processes();
        }

        let fps_val = config.get("fps").and_then(|v| v.as_f64()).unwrap_or(60.0);

        // 2. Show canvas webview windows and send engine events
        let windows = app.webview_windows();
        let mut audio_assigned = false;
        for (label, win) in windows {
            let matches_target = is_all
                || target == label
                || target.trim_start_matches("wallpaper_").trim_start_matches('_').eq_ignore_ascii_case(label.trim_start_matches("wallpaper_").trim_start_matches('_'));
            if label.starts_with("wallpaper_") && matches_target {
                #[cfg(windows)]
                let mut pinned = true;
                #[cfg(windows)]
                if let Ok(raw_hwnd) = win.hwnd() {
                    let hwnd = raw_hwnd.0 as HWND;
                    let mon_bounds = monitors.iter().find_map(|m| {
                        if let Some(name) = m.name() {
                            if get_monitor_label(name) == label {
                                let pos = m.position();
                                let size = m.size();
                                return Some((pos.x, pos.y, size.width as i32, size.height as i32));
                            }
                        }
                        None
                    });
                    log_msg(&format!(
                        "[AetherFlow WP] Re-pinning and clipping wallpaper window {} (HWND=0x{:X}) for engine: {:?}",
                        label, hwnd as usize, mon_bounds
                    ));
                    pinned = pin_hwnd_as_wallpaper(hwnd, mon_bounds);
                }

                if pinned {
                    let _ = win.set_ignore_cursor_events(true);
                    #[cfg(windows)]
                    if let Ok(raw) = win.hwnd() {
                        unsafe {
                            windows_sys::Win32::UI::WindowsAndMessaging::ShowWindow(raw.0 as HWND, windows_sys::Win32::UI::WindowsAndMessaging::SW_SHOWNOACTIVATE);
                        }
                    }
                } else {
                    let _ = win.hide();
                }

                // In duplicated / all screens mode, or per-screen mode with selected audio display,
                // only the target audio display plays audio.
                let target_audio_label = get_target_audio_monitor_label(&app);
                let is_target_audio = target_audio_label.as_deref() == Some(label.as_str())
                    || (!audio_assigned && target_audio_label.is_none());
                let is_secondary = !is_target_audio && target == "*";

                let screen_muted = if global_muted {
                    true
                } else if target == "*" {
                    if is_target_audio && !audio_assigned {
                        audio_assigned = true;
                        false
                    } else {
                        true // Secondary duplicate screen -> Mute audio!
                    }
                } else {
                    let has_explicit_pref = if let Ok(guard) = PERFORMANCE_SETTINGS.lock() {
                        guard.preferred_audio_monitor.is_some()
                    } else {
                        false
                    };
                    if has_explicit_pref {
                        !is_target_audio
                    } else {
                        global_muted
                    }
                };
                let screen_volume = global_volume;
                let is_currently_paused = is_monitor_currently_paused(&label);

                let mut win_config = config.clone();
                if let Some(obj) = win_config.as_object_mut() {
                    obj.insert("isPrimary".to_string(), serde_json::json!(is_target_audio));
                    obj.insert("isSecondary".to_string(), serde_json::json!(is_secondary));
                    obj.insert("muted".to_string(), serde_json::json!(screen_muted || is_currently_paused));
                    obj.insert("volume".to_string(), serde_json::json!(screen_volume));
                    obj.insert("isPaused".to_string(), serde_json::json!(is_currently_paused));
                }

                let payload = serde_json::json!({
                    "engineId": resolved_engine_id.clone(),
                    "config": win_config,
                    "target": label.clone(),
                });
                let _ = win.emit_to(label.as_str(), "aether:set-engine", payload.clone());
                let _ = win.emit_to(label.as_str(), "aura:set-engine", payload.clone());
                if is_currently_paused {
                    let _ = win.emit_to(label.as_str(), "aether:pause", serde_json::json!({ "target": label.clone() }));
                    let _ = win.emit_to(label.as_str(), "aura:pause", serde_json::json!({ "target": label.clone() }));
                }
                let _ = win.emit_to(label.as_str(), "aether:set-brightness", serde_json::json!({ "brightness": brightness, "target": label.clone() }));
                let _ = win.emit_to(label.as_str(), "aura:set-brightness", serde_json::json!({ "brightness": brightness, "target": label.clone() }));
                let _ = win.emit_to(label.as_str(), "aether:set-opacity", serde_json::json!({ "opacity": opacity, "target": label.clone() }));
                let _ = win.emit_to(label.as_str(), "aura:set-opacity", serde_json::json!({ "opacity": opacity, "target": label.clone() }));
                let _ = win.emit_to(label.as_str(), "aether:set-fps", serde_json::json!({ "fps": fps_val, "target": label.clone() }));
                let _ = win.emit_to(label.as_str(), "aura:set-fps", serde_json::json!({ "fps": fps_val, "target": label.clone() }));
            }
        }
    }

    // [DIAG 5] Check Main HWND parent after apply
    #[cfg(windows)]
    if let Some(main_h) = get_main_hwnd() {
        unsafe {
            let parent_after = GetParent(main_h);
            if parent_after != std::ptr::null_mut() {
                let err = format!("[DIAG 5 CRITICAL ERROR] Main HWND was reparented to 0x{:X}! Restoring to desktop root!", parent_after as usize);
                log_msg(&err);
                eprintln!("{}", err);
                SetParent(main_h, std::ptr::null_mut());
            }
        }
    }

    MONITOR_SYNC_REQUESTED.store(true, std::sync::atomic::Ordering::SeqCst);

    // Immediately schedule a delayed working set compaction after switching wallpapers,
    // plus a 10s settle compaction to evict codec DLL and GPU shader initialization pages
    // once MPV or WebView2 has completed initial decoding and buffer allocation.
    #[cfg(windows)]
    {
        std::thread::spawn(|| {
            std::thread::sleep(std::time::Duration::from_millis(600));
            trim_all_process_memory();
        });
        schedule_post_apply_trim(10);
    }
}

/// Stop the active wallpaper and clear active state.
#[tauri::command]
fn stop_wallpaper(app: AppHandle, monitor_label: Option<String>) {
    let target = monitor_label.unwrap_or_else(|| "*".to_string());
    if target == "*" {
        invalidate_all_apply_tickets();
    } else {
        next_apply_ticket(&target);
    }
    log_lifecycle("STOP_WALLPAPER", &format!("target='{}'", target));

    if let Ok(mut guard) = ACTIVE_WALLPAPERS.lock() {
        if let Some(ref mut map) = *guard {
            if target == "*" {
                map.clear();
            } else {
                map.remove(&target);
            }
        }
    }

    // Terminate any MPV instances for target monitor(s)
    if let Ok(mut mpv_guard) = MPV_PLAYERS.lock() {
        if let Some(ref mut map) = *mpv_guard {
            if target == "*" {
                for (_, mut proc) in map.drain() {
                    proc.terminate();
                }
            } else if let Some(mut proc) = map.remove(&target) {
                proc.terminate();
            }
        }
    }
    if target == "*" {
        mpv::kill_all_mpv_processes();
    }

    let windows = app.webview_windows();
    for (label, win) in windows {
        if label.starts_with("wallpaper_") && (target == "*" || target == label) {
            let payload = serde_json::json!({ "target": target.clone() });
            let _ = win.emit_to(label.as_str(), "aether:stop", payload.clone());
            let _ = win.emit_to(label.as_str(), "aura:stop", payload);
            let _ = win.hide();
        }
    }

    #[cfg(windows)]
    unsafe {
        SystemParametersInfoW(SPI_SETDESKWALLPAPER, 0, std::ptr::null_mut(), SPIF_UPDATEINIFILE | SPIF_SENDCHANGE);
    }

    #[cfg(windows)]
    if let Some(main_h) = get_main_hwnd() {
        unsafe {
            let parent_after = GetParent(main_h);
            log_msg(&format!("[DIAG 5] Main AetherFlow HWND: 0x{:X}, Parent AFTER stop: 0x{:X}", main_h as usize, parent_after as usize));
        }
    }

    MONITOR_SYNC_REQUESTED.store(true, std::sync::atomic::Ordering::SeqCst);

    #[cfg(windows)]
    trim_all_process_memory();
}

#[tauri::command]
fn set_mpv_pause(monitor_label: Option<String>, paused: bool) {
    let target = monitor_label.unwrap_or_else(|| "*".to_string());
    if let Ok(mpv_guard) = MPV_PLAYERS.lock() {
        if let Some(ref map) = *mpv_guard {
            for (label, proc) in map {
                if target == "*" || target == *label {
                    let _ = proc.set_pause(paused);
                }
            }
        }
    }
}

#[tauri::command]
fn set_mpv_volume(monitor_label: Option<String>, volume: f64) {
    let target = monitor_label.unwrap_or_else(|| "*".to_string());
    if let Ok(mpv_guard) = MPV_PLAYERS.lock() {
        if let Some(ref map) = *mpv_guard {
            for (label, proc) in map {
                if target == "*" || target == *label {
                    let _ = proc.set_volume(volume);
                }
            }
        }
    }
}

fn get_target_mon_volume(mon_lbl: &str) -> f64 {
    if let Ok(active_guard) = ACTIVE_WALLPAPERS.lock() {
        if let Some(ref m) = *active_guard {
            if let Some(vol) = m.get(mon_lbl).and_then(|s| s.config.get("volume").and_then(|v| v.as_f64())) {
                return vol;
            }
            if let Some(vol) = m.get("*").and_then(|s| s.config.get("volume").and_then(|v| v.as_f64())) {
                return vol;
            }
        }
    }
    50.0
}

#[tauri::command]
fn set_mpv_mute(app: AppHandle, monitor_label: Option<String>, muted: bool) {
    let target = monitor_label.unwrap_or_else(|| "*".to_string());
    let target_audio_label = get_target_audio_monitor_label(&app);
    if let Ok(mpv_guard) = MPV_PLAYERS.lock() {
        if let Some(ref map) = *mpv_guard {
            if target == "*" {
                if muted {
                    for (_label, proc) in map {
                        let _ = proc.set_mute(true);
                    }
                } else {
                    if map.len() == 1 {
                        for (label, proc) in map {
                            let mon_vol = get_target_mon_volume(label);
                            let _ = proc.set_volume(mon_vol);
                            let _ = proc.set_mute(false);
                        }
                    } else {
                        let target_unmute_label = if let Some(ref t) = target_audio_label {
                            if map.contains_key(t) {
                                t.clone()
                            } else {
                                map.keys().next().cloned().unwrap_or_default()
                            }
                        } else {
                            map.keys().next().cloned().unwrap_or_default()
                        };

                        for (label, proc) in map {
                            if *label == target_unmute_label {
                                let mon_vol = get_target_mon_volume(label);
                                let _ = proc.set_volume(mon_vol);
                                let _ = proc.set_mute(false);
                            } else {
                                let _ = proc.set_mute(true);
                            }
                        }
                    }
                }
            } else {
                for (label, proc) in map {
                    if target == *label {
                        if !muted {
                            let mon_vol = get_target_mon_volume(label);
                            let _ = proc.set_volume(mon_vol);
                        }
                        let _ = proc.set_mute(muted);
                    }
                }
            }
        }
    }
}

fn get_custom_wallpapers_file(app: &AppHandle) -> std::path::PathBuf {
    let base = app.path().app_data_dir().unwrap_or_else(|_| std::path::PathBuf::from("."));
    let _ = std::fs::create_dir_all(&base);
    let primary = base.join("custom_wallpapers.json");
    if primary.exists() {
        return primary;
    }

    // AppData fallback check for existing installations
    if let Ok(appdata) = std::env::var("APPDATA") {
        let appdata_path = std::path::PathBuf::from(appdata);
        let fallbacks = [
            appdata_path.join("com.aetherflow.app").join("custom_wallpapers.json"),
            appdata_path.join("com.aetherflow.dev").join("custom_wallpapers.json"),
            appdata_path.join("aetherflow").join("custom_wallpapers.json"),
            appdata_path.join("com.auraos.dev").join("custom_wallpapers.json"),
            appdata_path.join("com.auraos.app").join("custom_wallpapers.json"),
            appdata_path.join("auraos").join("custom_wallpapers.json"),
        ];
        for fb in fallbacks {
            if fb.exists() {
                return fb;
            }
        }
    }
    primary
}

fn get_wallpaper_library_dir(app: &AppHandle) -> std::path::PathBuf {
    let base = app.path().app_data_dir().unwrap_or_else(|_| std::path::PathBuf::from("."));
    let lib = base.join("library");
    let _ = std::fs::create_dir_all(&lib);
    lib
}

#[tauri::command]
fn get_wallpaper_directory(app: AppHandle) -> String {
    get_wallpaper_library_dir(&app).to_string_lossy().to_string()
}

#[tauri::command]
fn open_wallpaper_directory(app: AppHandle) -> Result<(), String> {
    let dir = get_wallpaper_library_dir(&app);
    let dir_str = dir.to_string_lossy().to_string();
    open_url(dir_str)
}

#[tauri::command]
fn import_wallpaper_media(app: AppHandle, source_path: String) -> Result<String, String> {
    let src = std::path::Path::new(&source_path);
    if !src.exists() {
        return Err(format!("Source file does not exist: {}", source_path));
    }

    let library_dir = get_wallpaper_library_dir(&app);

    // If file is already inside the library dir, keep it
    if src.starts_with(&library_dir) {
        return Ok(source_path);
    }

    let file_stem = src.file_stem().and_then(|s| s.to_str()).unwrap_or("wallpaper");
    let file_ext = src.extension().and_then(|s| s.to_str()).unwrap_or("bin");

    let sanitized_stem: String = file_stem
        .chars()
        .map(|c| if c.is_alphanumeric() || c == '-' || c == '_' || c == ' ' { c } else { '_' })
        .collect();

    let timestamp = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_secs())
        .unwrap_or(0);

    let dest_filename = format!("{}_{}.{}", timestamp, sanitized_stem.trim(), file_ext);
    let dest_path = library_dir.join(&dest_filename);

    log_msg(&format!(
        "[WALLPAPER IMPORT] Copying media to self-contained library: {:?} -> {:?}",
        src, dest_path
    ));

    match std::fs::copy(&src, &dest_path) {
        Ok(bytes) => {
            log_msg(&format!(
                "[WALLPAPER IMPORT] Successfully copied {} bytes to {:?}",
                bytes, dest_path
            ));
            Ok(dest_path.to_string_lossy().to_string())
        }
        Err(e) => {
            log_msg(&format!(
                "[WALLPAPER IMPORT] Copy failed: {}. Falling back to original path.",
                e
            ));
            Ok(source_path)
        }
    }
}

// ─── Playlists & Batch Storage Engine ──────────────────────────────────────────

#[derive(serde::Serialize, serde::Deserialize, Clone, Debug)]
pub struct FileMeta {
    pub path: String,
    pub name: String,
    pub extension: String,
    pub size_bytes: u64,
    pub is_file: bool,
    pub is_video: bool,
    pub is_image: bool,
}

#[derive(serde::Serialize, serde::Deserialize, Clone, Debug)]
pub struct BatchImportResult {
    pub original_path: String,
    pub final_path: String,
    pub name: String,
    pub storage_type: String, // "copy" or "reference"
    pub size_bytes: u64,
    pub media_type: String, // "video" or "image"
    pub thumbnail: Option<String>,
    pub success: bool,
    pub error: Option<String>,
}

#[derive(serde::Serialize, serde::Deserialize, Clone, Debug)]
pub struct LibraryStorageStats {
    pub library_dir: String,
    pub total_files: usize,
    pub total_bytes: u64,
}

#[derive(serde::Serialize, serde::Deserialize, Clone, Debug)]
pub struct PlaylistTimerConfig {
    pub monitor_scope: String,
    pub playlist_id: String,
    pub interval_secs: u64,
    pub enabled: bool,
}

static PLAYLIST_TIMERS: Mutex<Vec<PlaylistTimerConfig>> = Mutex::new(Vec::new());
static PLAYLIST_LAST_TICK: std::sync::LazyLock<Mutex<std::collections::HashMap<String, std::time::Instant>>> =
    std::sync::LazyLock::new(|| Mutex::new(std::collections::HashMap::new()));

static WATCH_FOLDER_PATH: Mutex<Option<String>> = Mutex::new(None);
static WATCH_FOLDER_ENABLED: std::sync::atomic::AtomicBool = std::sync::atomic::AtomicBool::new(false);
static SEEN_WATCH_FILES: std::sync::LazyLock<Mutex<std::collections::HashSet<String>>> =
    std::sync::LazyLock::new(|| Mutex::new(std::collections::HashSet::new()));

#[tauri::command]
async fn upload_release_asset(
    _app: AppHandle,
    token: String,
    repo: String,
    tag: String,
    file_path: Option<String>,
    file_bytes: Option<Vec<u8>>,
    asset_name: String,
    content_type: String,
) -> Result<serde_json::Value, String> {
    let parts: Vec<&str> = repo.split('/').collect();
    if parts.len() != 2 {
        return Err("Invalid repo format, expected owner/repo".to_string());
    }
    let owner = parts[0];
    let repo_name = parts[1];

    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(900))
        .build()
        .map_err(|e| format!("Failed to create HTTP client: {}", e))?;

    // 1. Get release info to locate release ID
    let release_url = format!("https://api.github.com/repos/{}/{}/releases/tags/{}", owner, repo_name, tag);
    let release_res = client
        .get(&release_url)
        .header("Authorization", format!("token {}", token))
        .header("User-Agent", "AetherFlow")
        .header("Accept", "application/vnd.github.v3+json")
        .send()
        .await
        .map_err(|e| format!("Failed to query release tag {}: {}", tag, e))?;

    if !release_res.status().is_success() {
        let status = release_res.status();
        let err_text = release_res.text().await.unwrap_or_default();
        return Err(format!("Release query failed with HTTP {}: {}", status, err_text));
    }

    let release_json: serde_json::Value = release_res
        .json()
        .await
        .map_err(|e| format!("Failed to parse release JSON: {}", e))?;

    let release_id = release_json["id"]
        .as_u64()
        .ok_or_else(|| "Missing release ID in GitHub response".to_string())?;

    // 2. Read file data from disk or direct bytes
    let data: Vec<u8> = if let Some(ref path) = file_path {
        std::fs::read(path)
            .map_err(|e| format!("Failed to read file at {}: {}", path, e))?
    } else if let Some(bytes) = file_bytes {
        bytes
    } else {
        return Err("Neither file_path nor file_bytes was provided".to_string());
    };

    let total_bytes = data.len();

    // 3. Sanitized asset name (alphanumeric, dot, underscore, dash)
    let safe_name: String = asset_name
        .chars()
        .map(|c| if c.is_ascii_alphanumeric() || c == '.' || c == '_' || c == '-' { c } else { '_' })
        .collect();

    let upload_url = format!(
        "https://uploads.github.com/repos/{}/{}/releases/{}/assets?name={}",
        owner, repo_name, release_id, safe_name
    );

    let upload_res = client
        .post(&upload_url)
        .header("Authorization", format!("token {}", token))
        .header("Content-Type", &content_type)
        .header("User-Agent", "AetherFlow")
        .header("Accept", "application/vnd.github.v3+json")
        .body(data)
        .send()
        .await
        .map_err(|e| format!("Failed to upload asset to GitHub: {}", e))?;

    let status = upload_res.status();
    let resp_text = upload_res.text().await.unwrap_or_default();

    if status.is_success() {
        let resp_json: serde_json::Value = serde_json::from_str(&resp_text).unwrap_or_else(|_| {
            serde_json::json!({
                "name": safe_name,
                "browser_download_url": format!("https://github.com/{}/{}/releases/download/{}/{}", owner, repo_name, tag, safe_name),
                "size": total_bytes
            })
        });

        let default_download = format!("https://github.com/{}/{}/releases/download/{}/{}", owner, repo_name, tag, safe_name);
        let download_url = resp_json["browser_download_url"]
            .as_str()
            .unwrap_or(&default_download)
            .to_string();

        let asset_id = resp_json["id"].as_u64().unwrap_or(0);

        Ok(serde_json::json!({
            "assetName": safe_name,
            "downloadUrl": download_url,
            "size": resp_json["size"].as_u64().unwrap_or(total_bytes as u64),
            "releaseId": release_id,
            "assetId": asset_id,
        }))
    } else {
        Err(format!("GitHub upload failed with HTTP {}: {}", status, resp_text))
    }
}

#[tauri::command]
async fn delete_release_asset(
    token: String,
    repo: String,
    asset_id: u64,
) -> Result<bool, String> {
    let parts: Vec<&str> = repo.split('/').collect();
    if parts.len() != 2 {
        return Err("Invalid repo format".to_string());
    }
    let owner = parts[0];
    let repo_name = parts[1];

    let client = reqwest::Client::builder()
        .build()
        .map_err(|e| format!("Failed to create HTTP client: {}", e))?;

    let del_url = format!("https://api.github.com/repos/{}/{}/releases/assets/{}", owner, repo_name, asset_id);
    let del_res = client
        .delete(&del_url)
        .header("Authorization", format!("token {}", token))
        .header("User-Agent", "AetherFlow")
        .header("Accept", "application/vnd.github.v3+json")
        .send()
        .await
        .map_err(|e| format!("Failed to delete asset: {}", e))?;

    Ok(del_res.status().is_success())
}

#[tauri::command]
async fn cache_community_wallpaper(
    app: AppHandle,
    url: String,
    wallpaper_id: String,
    ext: String,
) -> Result<serde_json::Value, String> {
    use std::io::Write;

    let clean_id = wallpaper_id.replace(|c: char| !c.is_ascii_alphanumeric() && c != '_' && c != '-', "_");
    let clean_ext = ext.trim_start_matches('.').to_lowercase();
    let file_name = format!("community_{}.{}", clean_id, clean_ext);

    let library_dir = get_wallpaper_library_dir(&app);
    if !library_dir.exists() {
        let _ = std::fs::create_dir_all(&library_dir);
    }
    let target_path = library_dir.join(&file_name);

    if target_path.exists() {
        if let Ok(meta) = std::fs::metadata(&target_path) {
            if meta.len() > 0 {
                return Ok(serde_json::json!({
                    "localPath": target_path.to_string_lossy().to_string(),
                    "fileSize": meta.len(),
                    "cached": true
                }));
            }
        }
    }

    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(900))
        .build()
        .map_err(|e| format!("Failed to create HTTP client: {}", e))?;

    let mut res = client
        .get(&url)
        .header("User-Agent", "AetherFlow")
        .send()
        .await
        .map_err(|e| format!("Failed to connect to media CDN: {}", e))?;

    if !res.status().is_success() {
        return Err(format!("Download failed with HTTP {}", res.status()));
    }

    let total_size = res.content_length().unwrap_or(0);
    let mut downloaded: u64 = 0;

    let temp_path = library_dir.join(format!("temp_comm_{}.part", clean_id));
    let mut file = std::fs::File::create(&temp_path)
        .map_err(|e| format!("Failed to create local destination file: {}", e))?;

    let mut last_emit = std::time::Instant::now();

    while let Some(chunk) = res.chunk().await.map_err(|e| format!("Download error: {}", e))? {
        file.write_all(&chunk)
            .map_err(|e| format!("Failed to write to local disk: {}", e))?;
        downloaded += chunk.len() as u64;

        if last_emit.elapsed() >= std::time::Duration::from_millis(250) || (total_size > 0 && downloaded >= total_size) {
            last_emit = std::time::Instant::now();
            let percent = if total_size > 0 {
                ((downloaded as f64 / total_size as f64) * 100.0).min(100.0) as u32
            } else {
                0
            };
            let _ = app.emit("aether:community-download-progress", serde_json::json!({
                "wallpaperId": wallpaper_id,
                "progress": percent,
                "downloaded": downloaded,
                "total": total_size,
            }));
        }
    }

    file.flush().map_err(|e| format!("Failed to flush file: {}", e))?;
    drop(file);

    if target_path.exists() {
        let _ = std::fs::remove_file(&target_path);
    }

    std::fs::rename(&temp_path, &target_path)
        .map_err(|e| format!("Failed to finalize downloaded file: {}", e))?;

    Ok(serde_json::json!({
        "localPath": target_path.to_string_lossy().to_string(),
        "fileSize": downloaded,
        "cached": false
    }))
}

#[tauri::command]
fn remove_local_community_wallpaper(app: AppHandle, local_path: String) -> Result<bool, String> {
    let p = std::path::Path::new(&local_path);
    let library_dir = get_wallpaper_library_dir(&app);
    if p.exists() && p.starts_with(&library_dir) {
        std::fs::remove_file(p).map_err(|e| format!("Failed to delete local file: {}", e))?;
        Ok(true)
    } else {
        Ok(false)
    }
}

#[tauri::command]
fn get_file_metadata(path: String) -> Result<FileMeta, String> {
    let p = std::path::Path::new(&path);
    if !p.exists() {
        return Err(format!("File does not exist: {}", path));
    }
    let meta = std::fs::metadata(p).map_err(|e| e.to_string())?;
    let file_stem = p.file_stem().and_then(|s| s.to_str()).unwrap_or("file");
    let ext = p.extension().and_then(|s| s.to_str()).map(|s| s.to_lowercase()).unwrap_or_default();
    
    let is_video = ["mp4", "webm", "mkv", "avi", "mov", "wmv", "flv"].contains(&ext.as_str());
    let is_image = ["png", "jpg", "jpeg", "webp", "bmp", "gif", "avif"].contains(&ext.as_str());

    Ok(FileMeta {
        path: path.clone(),
        name: file_stem.to_string(),
        extension: ext,
        size_bytes: meta.len(),
        is_file: meta.is_file(),
        is_video,
        is_image,
    })
}

#[tauri::command]
fn batch_import_media_files(
    app: AppHandle,
    paths: Vec<String>,
    copy_threshold_mb: u64,
    storage_mode: String,
) -> Result<Vec<BatchImportResult>, String> {
    let library_dir = get_wallpaper_library_dir(&app);
    let threshold_bytes = copy_threshold_mb.max(1) * 1024 * 1024;
    let mut results = Vec::new();

    let video_exts = ["mp4", "webm", "mkv", "avi", "mov", "wmv", "flv"];
    let image_exts = ["png", "jpg", "jpeg", "webp", "bmp", "gif", "avif"];

    let now_ts = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_secs())
        .unwrap_or(0);

    for (idx, source_path) in paths.into_iter().enumerate() {
        let src = std::path::Path::new(&source_path);
        if !src.exists() || !src.is_file() {
            results.push(BatchImportResult {
                original_path: source_path.clone(),
                final_path: source_path,
                name: "Unknown".to_string(),
                storage_type: "error".to_string(),
                size_bytes: 0,
                media_type: "unknown".to_string(),
                thumbnail: None,
                success: false,
                error: Some("File does not exist or is not a file".to_string()),
            });
            continue;
        }

        let meta = match std::fs::metadata(src) {
            Ok(m) => m,
            Err(e) => {
                results.push(BatchImportResult {
                    original_path: source_path.clone(),
                    final_path: source_path,
                    name: "Unknown".to_string(),
                    storage_type: "error".to_string(),
                    size_bytes: 0,
                    media_type: "unknown".to_string(),
                    thumbnail: None,
                    success: false,
                    error: Some(e.to_string()),
                });
                continue;
            }
        };

        let file_stem = src.file_stem().and_then(|s| s.to_str()).unwrap_or("wallpaper");
        let ext = src.extension().and_then(|s| s.to_str()).map(|s| s.to_lowercase()).unwrap_or_default();
        let is_video = video_exts.contains(&ext.as_str());
        let is_image = image_exts.contains(&ext.as_str());
        let media_type = if is_video { "video" } else if is_image { "image" } else { "other" };
        let size_bytes = meta.len();

        let should_copy = match storage_mode.as_str() {
            "always-copy" => true,
            "always-reference" => false,
            _ => size_bytes < threshold_bytes, // default: hybrid
        };

        let is_already_in_library = src.starts_with(&library_dir);

        let (final_path, storage_type) = if is_already_in_library {
            (source_path.clone(), "copy".to_string())
        } else if should_copy {
            let sanitized_stem: String = file_stem
                .chars()
                .map(|c| if c.is_alphanumeric() || c == '-' || c == '_' || c == ' ' { c } else { '_' })
                .collect();
            let dest_filename = format!("{}_{}_{}.{}", now_ts, idx, sanitized_stem.trim(), ext);
            let dest_path = library_dir.join(&dest_filename);

            match std::fs::copy(src, &dest_path) {
                Ok(_) => (dest_path.to_string_lossy().to_string(), "copy".to_string()),
                Err(e) => {
                    log_msg(&format!("[BATCH IMPORT] Copy failed for {}: {}. Using reference fallback.", source_path, e));
                    (source_path.clone(), "reference".to_string())
                }
            }
        } else {
            (source_path.clone(), "reference".to_string())
        };

        // Extract thumbnail for videos
        let thumbnail = if is_video {
            let wall_id = format!("local-{}-{}", now_ts, idx);
            let base = app.path().app_data_dir().unwrap_or_else(|_| std::path::PathBuf::from("."));
            let thumb_dir = base.join("thumbnails");
            let _ = std::fs::create_dir_all(&thumb_dir);
            let out_thumb = thumb_dir.join(format!("{}.jpg", wall_id));
            #[cfg(windows)]
            {
                let vpath = std::path::Path::new(&final_path);
                if thumbnail_extractor::extract_shell_thumbnail(vpath, &out_thumb, 640, 360).is_ok() {
                    Some(out_thumb.to_string_lossy().to_string())
                } else {
                    None
                }
            }
            #[cfg(not(windows))]
            {
                None
            }
        } else {
            None
        };

        results.push(BatchImportResult {
            original_path: source_path.clone(),
            final_path,
            name: file_stem.replace('_', " ").replace('-', " "),
            storage_type,
            size_bytes,
            media_type: media_type.to_string(),
            thumbnail,
            success: true,
            error: None,
        });
    }

    Ok(results)
}

#[tauri::command]
fn scan_directory_media(dir_path: String) -> Result<Vec<String>, String> {
    let dir = std::path::Path::new(&dir_path);
    if !dir.exists() || !dir.is_dir() {
        return Err(format!("Directory does not exist: {}", dir_path));
    }
    let supported_exts = ["mp4", "webm", "mkv", "avi", "mov", "wmv", "flv", "png", "jpg", "jpeg", "webp", "bmp"];
    let mut files = Vec::new();

    fn visit_dir(dir: &std::path::Path, exts: &[&str], out: &mut Vec<String>, depth: u32) {
        if depth > 4 { return; }
        if let Ok(entries) = std::fs::read_dir(dir) {
            for entry in entries.flatten() {
                let p = entry.path();
                if p.is_file() {
                    if let Some(ext) = p.extension().and_then(|e| e.to_str()).map(|s| s.to_lowercase()) {
                        if exts.contains(&ext.as_str()) {
                            out.push(p.to_string_lossy().to_string());
                        }
                    }
                } else if p.is_dir() {
                    visit_dir(&p, exts, out, depth + 1);
                }
            }
        }
    }

    visit_dir(dir, &supported_exts, &mut files, 0);
    Ok(files)
}

#[tauri::command]
fn get_library_storage_stats(app: AppHandle) -> Result<LibraryStorageStats, String> {
    let lib = get_wallpaper_library_dir(&app);
    let mut total_files = 0;
    let mut total_bytes = 0;
    if let Ok(entries) = std::fs::read_dir(&lib) {
        for entry in entries.flatten() {
            if let Ok(meta) = entry.metadata() {
                if meta.is_file() {
                    total_files += 1;
                    total_bytes += meta.len();
                }
            }
        }
    }
    Ok(LibraryStorageStats {
        library_dir: lib.to_string_lossy().to_string(),
        total_files,
        total_bytes,
    })
}

#[tauri::command]
fn set_watch_folder(path: Option<String>, enabled: bool) -> Result<(), String> {
    if let Ok(mut p_guard) = WATCH_FOLDER_PATH.lock() {
        *p_guard = path.clone();
    }
    WATCH_FOLDER_ENABLED.store(enabled, std::sync::atomic::Ordering::Relaxed);
    log_msg(&format!("[WATCH FOLDER] Settings updated: enabled={}, path={:?}", enabled, path));
    Ok(())
}

#[tauri::command]
fn get_watch_folder_settings() -> Result<serde_json::Value, String> {
    let path = WATCH_FOLDER_PATH.lock().ok().and_then(|g| g.clone());
    let enabled = WATCH_FOLDER_ENABLED.load(std::sync::atomic::Ordering::Relaxed);
    Ok(serde_json::json!({
        "path": path,
        "enabled": enabled
    }))
}

#[tauri::command]
fn scan_watch_folder(app: AppHandle) -> Result<Vec<String>, String> {
    let path_opt = WATCH_FOLDER_PATH.lock().ok().and_then(|g| g.clone());
    let folder_str = match path_opt {
        Some(p) if !p.trim().is_empty() => p,
        _ => return Ok(Vec::new()),
    };
    let folder = std::path::Path::new(&folder_str);
    if !folder.exists() || !folder.is_dir() {
        return Ok(Vec::new());
    }

    let mut new_files = Vec::new();
    let supported_exts = ["mp4", "webm", "mkv", "avi", "mov", "wmv", "flv", "png", "jpg", "jpeg", "webp", "bmp"];

    if let Ok(entries) = std::fs::read_dir(folder) {
        let mut seen = SEEN_WATCH_FILES.lock().unwrap_or_else(|e| e.into_inner());
        for entry in entries.flatten() {
            let p = entry.path();
            if p.is_file() {
                if let Some(ext) = p.extension().and_then(|e| e.to_str()).map(|s| s.to_lowercase()) {
                    if supported_exts.contains(&ext.as_str()) {
                        let full_str = p.to_string_lossy().to_string();
                        if !seen.contains(&full_str) {
                            seen.insert(full_str.clone());
                            new_files.push(full_str);
                        }
                    }
                }
            }
        }
    }

    if !new_files.is_empty() {
        log_msg(&format!("[WATCH FOLDER] Detected {} new media files: {:?}", new_files.len(), new_files));
        let _ = app.emit("aether:watch-folder-new-items", &new_files);
    }
    Ok(new_files)
}

#[tauri::command]
fn sync_playlist_timers(timers: Vec<PlaylistTimerConfig>) -> Result<(), String> {
    if let Ok(mut guard) = PLAYLIST_TIMERS.lock() {
        log_msg(&format!("[PLAYLIST] Synced {} active playlist timers", timers.len()));
        *guard = timers;
    }
    if let Ok(mut ticks) = PLAYLIST_LAST_TICK.lock() {
        ticks.clear();
    }
    Ok(())
}

#[tauri::command]
fn sync_screensaver_settings(settings: ScreensaverSettings) -> Result<(), String> {
    if let Ok(mut guard) = SCREENSAVER_SETTINGS.lock() {
        *guard = settings;
        log_msg(&format!(
            "[SCREENSAVER] Settings updated: enabled={}, timeout={}m, mode='{}', lock_on_resume={}, grace={}s, inhibit_fs={}, inhibit_max={}, inhibit_audio={}",
            guard.enabled, guard.idle_timeout_mins, guard.mode, guard.lock_on_resume, guard.grace_period_secs,
            guard.inhibit_fullscreen, guard.inhibit_maximized, guard.inhibit_audio
        ));
    }
    Ok(())
}

#[tauri::command]
fn get_screensaver_settings() -> Result<ScreensaverSettings, String> {
    if let Ok(guard) = SCREENSAVER_SETTINGS.lock() {
        Ok(guard.clone())
    } else {
        Err("Failed to lock screensaver settings".to_string())
    }
}

fn do_trigger_screensaver(app: AppHandle, is_preview_val: bool) -> Result<(), String> {
    if let Ok(guard) = SCREENSAVER_ACTIVE.lock() {
        if *guard && !is_preview_val {
            return Ok(());
        }
    }

    if let Ok(mut guard) = SCREENSAVER_ACTIVE.lock() {
        *guard = true;
    }
    if let Ok(mut guard) = SCREENSAVER_ACTIVATED_AT.lock() {
        *guard = Some(std::time::Instant::now());
    }
    if let Ok(mut guard) = SCREENSAVER_IS_PREVIEW.lock() {
        *guard = is_preview_val;
    }

    let fade_secs = SCREENSAVER_SETTINGS.lock().map(|s| s.fade_in_secs).unwrap_or(1.0);

    log_msg(&format!(
        "[SCREENSAVER] Activating screensaver (preview={}, fadeIn={:.1}s)",
        is_preview_val, fade_secs
    ));
    println!(
        "[SCREENSAVER] Activating screensaver (preview={}, fadeIn={:.1}s)",
        is_preview_val, fade_secs
    );

    // 1. Destroy any existing screensaver windows first to prevent dead window handle collisions
    let windows = app.webview_windows();
    for (label, win) in windows {
        if label.starts_with("screensaver_") {
            let _ = win.hide();
            #[cfg(windows)]
            if let Ok(hwnd) = win.hwnd() {
                let raw = hwnd.0 as HWND;
                unsafe {
                    ShowWindow(raw, 0); // SW_HIDE
                }
            }
            let _ = win.destroy();
        }
    }

    // 2. Pause desktop wallpapers and mute sound while screensaver is active so NOTHING leaks through
    set_mpv_pause(None, true);
    set_mpv_mute(app.clone(), None, true);
    let _ = app.emit("aether:pause", serde_json::json!({ "target": "*" }));
    let _ = app.emit("aura:pause", serde_json::json!({ "target": "*" }));
    let _ = app.emit("aether:mute", serde_json::json!({ "target": "*" }));
    let _ = app.emit("aura:mute", serde_json::json!({ "target": "*" }));
    for (label, win) in app.webview_windows() {
        if label.starts_with("wallpaper_") {
            let _ = win.emit_to(label.as_str(), "aether:pause", serde_json::json!({ "target": label }));
            let _ = win.emit_to(label.as_str(), "aura:pause", serde_json::json!({ "target": label }));
            let _ = win.emit_to(label.as_str(), "aether:mute", serde_json::json!({ "target": label }));
            let _ = win.emit_to(label.as_str(), "aura:mute", serde_json::json!({ "target": label }));
        }
    }

    // 3. Create a topmost, solid borderless screensaver window on each monitor
    if let Ok(monitors) = app.available_monitors() {
        for m in monitors {
            let m_name = m.name().map_or("Display", |v| v.as_str());
            let clean_label = get_monitor_label(m_name);
            let win_label = format!("screensaver_{}", clean_label);

            let pos = m.position();
            let size = m.size();

            let url = format!("wallpaper.html?mode=screensaver&monitor={}&fadeIn={:.1}", clean_label, fade_secs);
            let win_res = WebviewWindowBuilder::new(&app, &win_label, WebviewUrl::App(url.into()))
                .title(&format!("AetherFlow Screensaver - {}", m_name))
                .decorations(false)
                .transparent(false)
                .visible(false)
                .background_color(Color(0, 0, 0, 255))
                .always_on_top(true)
                .skip_taskbar(true)
                .resizable(false)
                .fullscreen(true)
                .initialization_script(YT_WALLPAPER_INIT_SCRIPT)
                .build();

            match win_res {
                Ok(win) => {
                    #[cfg(windows)]
                    {
                        if let Ok(hwnd) = win.hwnd() {
                            let raw = hwnd.0 as HWND;
                            let hwnd_topmost = -1 as isize as HWND;
                            unsafe {
                                // 1. Strip all non-client window borders, caption and thickframe
                                let style = GetWindowLongW(raw, GWL_STYLE) as u32;
                                let new_style = (style | WS_POPUP | WS_VISIBLE) & !(WS_CHILD | WS_CAPTION | WS_THICKFRAME | WS_BORDER | 0x00C00000);
                                SetWindowLongW(raw, GWL_STYLE, new_style as i32);

                                let ex_style = GetWindowLongW(raw, GWL_EXSTYLE) as u32;
                                let new_ex_style = (ex_style | WS_EX_TOOLWINDOW | 0x00000008u32) & !(WS_EX_LAYERED | 0x00000100 | 0x00000200 | 0x00000001 | 0x00020000);
                                SetWindowLongW(raw, GWL_EXSTYLE, new_ex_style as i32);

                                // 2. CRITICAL: Kill Windows 11 active window accent border (DWMWA_BORDER_COLOR = 34)
                                let color_none: u32 = 0xFFFFFFFE; // DWMWA_COLOR_NONE
                                DwmSetWindowAttribute(raw, 34 /* DWMWA_BORDER_COLOR */, &color_none as *const u32 as *const _, std::mem::size_of::<u32>() as u32);
                                let do_not_round: u32 = 1; // DWMWCP_DONOTROUND
                                DwmSetWindowAttribute(raw, 33, &do_not_round as *const u32 as *const _, std::mem::size_of::<u32>() as u32);
                                let ncr_disabled: u32 = 1; // DWMNCRP_DISABLED
                                DwmSetWindowAttribute(raw, 2, &ncr_disabled as *const u32 as *const _, std::mem::size_of::<u32>() as u32);

                                // 3. Retrieve authoritative physical hardware monitor bounds from Win32
                                let pt = POINT {
                                    x: pos.x + (size.width as i32) / 2,
                                    y: pos.y + (size.height as i32) / 2,
                                };
                                let monitor_handle = MonitorFromPoint(pt, MONITOR_DEFAULTTONEAREST);
                                let mut minfo: MONITORINFO = std::mem::zeroed();
                                minfo.cbSize = std::mem::size_of::<MONITORINFO>() as u32;
                                let (mon_x, mon_y, mon_w, mon_h) = if GetMonitorInfoW(monitor_handle, &mut minfo) != 0 {
                                    let rc = minfo.rcMonitor;
                                    (rc.left, rc.top, rc.right - rc.left, rc.bottom - rc.top)
                                } else {
                                    (pos.x, pos.y, size.width as i32, size.height as i32)
                                };

                                log_msg(&format!(
                                    "[SCREENSAVER] Monitor {} ({}): hardware rcMonitor=({},{}) {}x{} -> HWND pos=({},{}) {}x{}",
                                    m_name, clean_label, mon_x, mon_y, mon_w, mon_h, mon_x, mon_y, mon_w, mon_h
                                ));

                                // 4. Set true borderless fullscreen position matching the monitor bounds EXACTLY (Lively Wallpaper architecture)
                                SetWindowPos(
                                    raw,
                                    hwnd_topmost,
                                    mon_x,
                                    mon_y,
                                    mon_w,
                                    mon_h,
                                    SWP_SHOWWINDOW | SWP_FRAMECHANGED,
                                );

                                // 5. Clear any region clipping so each monitor's window is an exact seamless rectangle
                                SetWindowRgn(raw, std::ptr::null_mut(), 1);
                            }
                        }
                    }
                    let _ = win.set_focus();
                }
                Err(err) => {
                    let err_msg = format!("[SCREENSAVER] Failed to create window for {}: {}", m_name, err);
                    log_msg(&err_msg);
                    eprintln!("{}", err_msg);
                }
            }
        }
    }

    Ok(())
}

#[tauri::command]
fn trigger_screensaver(app: AppHandle, is_preview: Option<bool>) -> Result<(), String> {
    let is_preview_val = is_preview.unwrap_or(true);
    let app_handle = app.clone();
    let _ = app.run_on_main_thread(move || {
        let _ = do_trigger_screensaver(app_handle, is_preview_val);
    });
    Ok(())
}

fn do_dismiss_screensaver(app: AppHandle) -> Result<(), String> {
    let was_active = {
        if let Ok(mut guard) = SCREENSAVER_ACTIVE.lock() {
            let active = *guard;
            *guard = false;
            active
        } else {
            false
        }
    };

    // 1. ALWAYS unconditionally hide and destroy all screensaver windows immediately
    let windows = app.webview_windows();
    for (label, win) in windows {
        if label.starts_with("screensaver_") {
            let _ = win.hide();
            #[cfg(windows)]
            if let Ok(hwnd) = win.hwnd() {
                let raw = hwnd.0 as HWND;
                unsafe {
                    ShowWindow(raw, 0); // SW_HIDE
                }
            }
            let _ = win.destroy();
        }
    }

    // 2. Request an immediate atomic monitor synchronization so the occlusion engine determines
    // whether wallpapers should resume (if desktop is visible) or STAY paused (if an app is fullscreen/maximized)
    MONITOR_SYNC_REQUESTED.store(true, std::sync::atomic::Ordering::SeqCst);

    if !was_active {
        return Ok(());
    }

    let is_preview = SCREENSAVER_IS_PREVIEW.lock().map(|g| *g).unwrap_or(false);
    let elapsed_secs = SCREENSAVER_ACTIVATED_AT.lock().ok()
        .and_then(|mut g| g.take().map(|t| t.elapsed().as_secs()))
        .unwrap_or(0);

    if let Ok(mut g) = SCREENSAVER_IS_PREVIEW.lock() {
        *g = false;
    }

    let (lock_on_resume, grace_period_secs) = {
        if let Ok(guard) = SCREENSAVER_SETTINGS.lock() {
            (guard.lock_on_resume, guard.grace_period_secs)
        } else {
            (false, 5)
        }
    };

    log_msg(&format!(
        "[SCREENSAVER] Dismissing screensaver: preview={}, elapsed={}s, grace={}s, lock_on_resume={}",
        is_preview, elapsed_secs, grace_period_secs, lock_on_resume
    ));
    println!(
        "[SCREENSAVER] Dismissing screensaver: preview={}, elapsed={}s, grace={}s, lock_on_resume={}",
        is_preview, elapsed_secs, grace_period_secs, lock_on_resume
    );

    // 3. Grace period logic: if not preview and past grace period, lock workstation if requested
    if !is_preview && lock_on_resume && elapsed_secs >= grace_period_secs as u64 {
        log_msg("[SCREENSAVER] Grace period expired and lock_on_resume is enabled -> Locking workstation");
        println!("[SCREENSAVER] Grace period expired and lock_on_resume is enabled -> Locking workstation");
        #[cfg(windows)]
        unsafe {
            LockWorkStation();
        }
    } else if !is_preview && lock_on_resume {
        log_msg(&format!(
            "[SCREENSAVER] Input received within grace period ({}s < {}s) -> Skipping system lock",
            elapsed_secs, grace_period_secs
        ));
        println!(
            "[SCREENSAVER] Input received within grace period ({}s < {}s) -> Skipping system lock",
            elapsed_secs, grace_period_secs
        );
    }

    if is_preview {
        if let Some(main_win) = app.get_webview_window("main") {
            let _ = main_win.show();
            let _ = main_win.set_focus();
        }
    }

    Ok(())
}

#[tauri::command]
fn dismiss_screensaver(app: AppHandle) -> Result<(), String> {
    let app_handle = app.clone();
    let _ = app.run_on_main_thread(move || {
        let _ = do_dismiss_screensaver(app_handle);
    });
    Ok(())
}

#[tauri::command]
fn get_screensaver_active_wallpaper(app: AppHandle) -> Result<serde_json::Value, String> {
    let settings = {
        if let Ok(guard) = SCREENSAVER_SETTINGS.lock() {
            guard.clone()
        } else {
            return Err("Failed to lock screensaver settings".to_string());
        }
    };

    let mode = settings.mode.as_str();
    let (engine_id, config) = match mode {
        "blackout" => {
            ("blackout".to_string(), serde_json::json!({}))
        }
        "custom" | "specific" => {
            if let Some(eng) = settings.specific_engine {
                (eng, settings.specific_config.unwrap_or_else(|| serde_json::json!({})))
            } else {
                ("aurora".to_string(), serde_json::json!({}))
            }
        }
        "random" => {
            let path = get_custom_wallpapers_file(&app);
            let mut candidates: Vec<(String, serde_json::Value)> = Vec::new();
            if path.exists() {
                if let Ok(data) = std::fs::read_to_string(&path) {
                    if let Ok(items) = serde_json::from_str::<Vec<serde_json::Value>>(&data) {
                        for item in items {
                            if let Some(engine) = item.get("engine").and_then(|v| v.as_str()) {
                                let cfg = item.get("config").cloned().unwrap_or_else(|| serde_json::json!({}));
                                candidates.push((engine.to_string(), cfg));
                            } else if let Some(cfg) = item.get("config") {
                                if cfg.get("videoPath").is_some() {
                                    candidates.push(("video-player".to_string(), cfg.clone()));
                                } else if cfg.get("imagePath").is_some() {
                                    candidates.push(("image-player".to_string(), cfg.clone()));
                                } else if cfg.get("streamUrl").is_some() {
                                    candidates.push(("web-stream".to_string(), cfg.clone()));
                                }
                            }
                        }
                    }
                }
            }
            let builtins = ["matrix-rain", "cyber-particles", "synthwave-grid", "deep-space", "aurora", "tokyo-rain"];
            for b in builtins {
                candidates.push((b.to_string(), serde_json::json!({})));
            }
            if !candidates.is_empty() {
                let idx = (std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).unwrap_or_default().as_secs() as usize) % candidates.len();
                candidates[idx].clone()
            } else {
                ("aurora".to_string(), serde_json::json!({}))
            }
        }
        _ => {
            // "current" or default: retrieve active desktop wallpaper
            if let Ok(guard) = ACTIVE_WALLPAPERS.lock() {
                if let Some(ref map) = *guard {
                    if let Some(active) = map.values().next() {
                        (active.engine_id.clone(), active.config.clone())
                    } else {
                        ("aurora".to_string(), serde_json::json!({}))
                    }
                } else {
                    ("aurora".to_string(), serde_json::json!({}))
                }
            } else {
                ("aurora".to_string(), serde_json::json!({}))
            }
        }
    };

    Ok(serde_json::json!({
        "engineId": engine_id,
        "config": config,
        "fadeInSecs": settings.fade_in_secs,
        "muteAudio": settings.mute_audio,
        "mode": settings.mode,
    }))
}

#[tauri::command]
fn get_grid_detection_state() -> Result<Vec<MonitorGridReport>, String> {
    if let Ok(guard) = LATEST_GRID_REPORTS.lock() {
        Ok(guard.clone())
    } else {
        Ok(Vec::new())
    }
}

#[tauri::command]
fn save_custom_wallpapers(app: AppHandle, wallpapers: Vec<serde_json::Value>) -> Result<(), String> {
    let path = get_custom_wallpapers_file(&app);
    let mut merged_map: std::collections::BTreeMap<String, serde_json::Value> = std::collections::BTreeMap::new();

    // Preserve existing wallpapers on disk so partial writes never wipe user's catalog
    if path.exists() {
        if let Ok(data) = std::fs::read_to_string(&path) {
            if let Ok(existing) = serde_json::from_str::<Vec<serde_json::Value>>(&data) {
                for item in existing {
                    if let Some(id) = item.get("id").and_then(|v| v.as_str()) {
                        merged_map.insert(id.to_string(), item);
                    }
                }
            }
        }
    }

    // Merge or update incoming wallpapers
    for item in wallpapers {
        if let Some(id) = item.get("id").and_then(|v| v.as_str()) {
            merged_map.insert(id.to_string(), item);
        }
    }

    let merged_list: Vec<serde_json::Value> = merged_map.into_values().collect();
    let data = serde_json::to_string_pretty(&merged_list).map_err(|e| e.to_string())?;
    std::fs::write(path, data).map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
fn delete_custom_wallpaper(app: AppHandle, id: String) -> Result<(), String> {
    let path = get_custom_wallpapers_file(&app);
    if path.exists() {
        if let Ok(data) = std::fs::read_to_string(&path) {
            if let Ok(existing) = serde_json::from_str::<Vec<serde_json::Value>>(&data) {
                let filtered: Vec<serde_json::Value> = existing
                    .into_iter()
                    .filter(|item| item.get("id").and_then(|v| v.as_str()) != Some(&id))
                    .collect();
                let new_data = serde_json::to_string_pretty(&filtered).map_err(|e| e.to_string())?;
                let _ = std::fs::write(path, new_data);
            }
        }
    }
    Ok(())
}

#[tauri::command]
fn load_custom_wallpapers(app: AppHandle) -> Vec<serde_json::Value> {
    let path = get_custom_wallpapers_file(&app);
    if path.exists() {
        if let Ok(data) = std::fs::read_to_string(&path) {
            if let Ok(items) = serde_json::from_str::<Vec<serde_json::Value>>(&data) {
                if !items.is_empty() {
                    return items;
                }
            }
        }
    }

    // Auto-recovery: If no custom wallpapers exist yet in this storage, restore user's downloaded wallpapers
    let known_candidates = [
        ("C:\\Users\\Yashpreet_o7\\Downloads\\Sabrina Carpenter Kissing Screen Wallpaper 4K HD - Estawky (1080p, h264).mp4", "Sabrina Carpenter"),
        ("C:\\Users\\Yashpreet_o7\\Downloads\\elden-ring-throne-of-ashes-live-wallpaper-wallsflow-com.mp4", "Elden Ring - Throne of Ashes"),
        ("C:\\Users\\Yashpreet_o7\\Downloads\\goku-ultra-instinct_2.3840x2160.mp4", "Goku Ultra Instinct"),
        ("C:\\Users\\Yashpreet_o7\\Downloads\\kid-goku-on-kintoun.1920x1080.mp4", "Kid Goku on Kintoun"),
        ("C:\\Users\\Yashpreet_o7\\Downloads\\the-batman-monochrome-moewalls-com.mp4", "The Batman Monochrome"),
        ("C:\\Users\\Yashpreet_o7\\Downloads\\vegeta-ultra-ego.3840x2160.mp4", "Vegeta Ultra Ego"),
        ("C:\\Users\\Yashpreet_o7\\Downloads\\itachi-shillouette-in-front-of-the-red-moon.3840x2160.mp4", "Itachi Silhouette Red Moon"),
        ("C:\\Users\\Yashpreet_o7\\Downloads\\Furina - Coook Pardon!  Atoms 1M Funk  Viral Funk Dance Edit  Pc Wallpaper  Montagem S.mp4", "Furina - Viral Funk Dance"),
        ("C:\\Users\\Yashpreet_o7\\Downloads\\YTDown_YouTube_Animated-Wallpaper-Elden-Ring-Age-of-Sta_Media_yTZSTHmmO6w_002_720p.mp4", "Elden Ring - Age of Stars"),
    ];

    let mut recovered = Vec::new();
    for (idx, (vpath, vname)) in known_candidates.iter().enumerate() {
        if std::path::Path::new(vpath).exists() {
            recovered.push(serde_json::json!({
                "id": format!("local-{}", 1788800000000u64 + (idx as u64 * 1000)),
                "type": "wallpaper",
                "name": vname,
                "engine": "video-player",
                "config": {
                    "videoPath": vpath,
                    "speedMultiplier": 1
                },
                "tags": ["custom", "video"],
                "installedAt": "2026-09-08T00:00:00.000Z",
                "isCustom": true
            }));
        }
    }

    if !recovered.is_empty() {
        let _ = save_custom_wallpapers(app, recovered.clone());
    }

    recovered
}

#[tauri::command]
fn get_or_create_video_thumbnail(app: AppHandle, wallpaper_id: String, video_path: String) -> Result<String, String> {
    #[cfg(windows)]
    {
        let base = app.path().app_data_dir().unwrap_or_else(|_| std::path::PathBuf::from("."));
        let thumb_dir = base.join("thumbnails");
        let _ = std::fs::create_dir_all(&thumb_dir);
        let out_file = thumb_dir.join(format!("{}.jpg", wallpaper_id));

        if out_file.exists() {
            if let Ok(meta) = std::fs::metadata(&out_file) {
                if meta.len() > 1000 {
                    return Ok(out_file.to_string_lossy().to_string());
                }
            }
        }

        let vpath = std::path::Path::new(&video_path);
        if !vpath.exists() {
            return Err(format!("Video file does not exist: {}", video_path));
        }

        thumbnail_extractor::extract_shell_thumbnail(vpath, &out_file, 640, 360)?;
        Ok(out_file.to_string_lossy().to_string())
    }
    #[cfg(not(windows))]
    {
        Err("Native thumbnail extraction is only supported on Windows".to_string())
    }
}

#[tauri::command]
fn sync_all_custom_video_thumbnails(app: AppHandle) -> Result<(), String> {
    #[cfg(windows)]
    {
        let app_handle = app.clone();
        std::thread::spawn(move || {
            let path = get_custom_wallpapers_file(&app_handle);
            if !path.exists() {
                return;
            }

            let base = app_handle.path().app_data_dir().unwrap_or_else(|_| std::path::PathBuf::from("."));
            let thumb_dir = base.join("thumbnails");
            let _ = std::fs::create_dir_all(&thumb_dir);

            let data = match std::fs::read_to_string(&path) {
                Ok(d) => d,
                Err(_) => return,
            };

            let mut items: Vec<serde_json::Value> = match serde_json::from_str(&data) {
                Ok(it) => it,
                Err(_) => return,
            };

            let mut any_updated = false;

            for item in items.iter_mut() {
                let id = match item.get("id").and_then(|v| v.as_str()) {
                    Some(s) => s.to_string(),
                    None => continue,
                };

                let is_video = item.get("engine").and_then(|v| v.as_str()) == Some("video-player")
                    || item.get("mediaType").and_then(|v| v.as_str()) == Some("video")
                    || item.get("config").and_then(|c| c.get("videoPath")).is_some();

                if !is_video {
                    continue;
                }

                // Check if current thumbnail is valid and file exists
                let current_thumb = item.get("thumbnail").and_then(|v| v.as_str()).unwrap_or("");
                if !current_thumb.is_empty() && std::path::Path::new(current_thumb).exists() {
                    continue;
                }

                let video_path = match item.get("config").and_then(|c| c.get("videoPath")).and_then(|v| v.as_str()) {
                    Some(p) => p,
                    None => continue,
                };

                let vpath = std::path::Path::new(video_path);
                if !vpath.exists() {
                    continue;
                }

                let out_file = thumb_dir.join(format!("{}.jpg", id));
                let need_extract = !out_file.exists() || std::fs::metadata(&out_file).map(|m| m.len() < 1000).unwrap_or(true);

                if need_extract {
                    if let Err(e) = thumbnail_extractor::extract_shell_thumbnail(vpath, &out_file, 640, 360) {
                        eprintln!("[Thumbnails] Extraction failed for {}: {}", id, e);
                        continue;
                    }
                }

                if out_file.exists() {
                    let thumb_str = out_file.to_string_lossy().to_string();
                    item["thumbnail"] = serde_json::Value::String(thumb_str);
                    any_updated = true;
                }
            }

            if any_updated {
                if let Ok(new_data) = serde_json::to_string_pretty(&items) {
                    let _ = std::fs::write(&path, new_data);
                }
                let _ = app_handle.emit("custom_thumbnails_updated", items);
                println!("[Thumbnails] Successfully synced native video thumbnails for custom wallpapers");
            }
        });
        Ok(())
    }
    #[cfg(not(windows))]
    {
        Ok(())
    }
}

/// Query active wallpaper state for a specific monitor window upon mounting
#[tauri::command]
fn get_monitor_active_wallpaper(app: AppHandle, label: String) -> Option<serde_json::Value> {
    if let Ok(guard) = ACTIVE_WALLPAPERS.lock() {
        if let Some(ref map) = *guard {
            let entry = map.get(&label).or_else(|| map.get("*"));
            if let Some(state) = entry {
                let mut win_config = state.config.clone();
                let primary_label = get_primary_monitor_label(&app);
                let is_primary = primary_label.as_deref() == Some(label.as_str()) || primary_label.is_none();
                let is_secondary = !is_primary && map.contains_key("*");
                if let Some(obj) = win_config.as_object_mut() {
                    obj.insert("isPrimary".to_string(), serde_json::json!(is_primary));
                    obj.insert("isSecondary".to_string(), serde_json::json!(is_secondary));
                    if is_secondary {
                        obj.insert("muted".to_string(), serde_json::json!(true));
                        obj.insert("volume".to_string(), serde_json::json!(0.0));
                    }
                }
                return Some(serde_json::json!({
                    "engineId": state.engine_id,
                    "config": win_config,
                    "opacity": state.opacity,
                    "brightness": state.brightness,
                }));
            }
        }
    }
    None
}

/// Hot-update the active engine config without restarting it.
#[tauri::command]
fn update_wallpaper_config(app: AppHandle, config: serde_json::Value, monitor_label: Option<String>) {
    let target = monitor_label.clone().unwrap_or_else(|| "*".to_string());
    let stream_url = config.get("streamUrl").and_then(|v| v.as_str()).or_else(|| config.get("url").and_then(|v| v.as_str()));
    let new_media_path = config.get("videoPath").and_then(|v| v.as_str()).or(stream_url);
    if let Some(new_vpath) = new_media_path {
        if let Ok(mut mpv_guard) = MPV_PLAYERS.lock() {
            if let Some(ref mut map) = *mpv_guard {
                for (label, proc) in map.iter_mut() {
                    if target == "*" || target == *label {
                        let _ = proc.load_file(new_vpath);
                    }
                }
            }
        }
    }
    if let Some(paused) = config.get("paused").and_then(|v| v.as_bool()) {
        if let Ok(mpv_guard) = MPV_PLAYERS.lock() {
            if let Some(ref map) = *mpv_guard {
                for (label, proc) in map {
                    if target == "*" || target == *label {
                        let _ = proc.set_pause(paused);
                    }
                }
            }
        }
    }
    if let Some(spd) = config.get("speedMultiplier").and_then(|v| v.as_f64()).or_else(|| config.get("speed").and_then(|v| v.as_f64())) {
        if let Ok(mpv_guard) = MPV_PLAYERS.lock() {
            if let Some(ref map) = *mpv_guard {
                for (label, proc) in map {
                    if target == "*" || target == *label {
                        let _ = proc.set_speed(spd);
                    }
                }
            }
        }
    }
    if let Some(br) = config.get("brightness").and_then(|v| v.as_f64()) {
        if let Ok(mpv_guard) = MPV_PLAYERS.lock() {
            if let Some(ref map) = *mpv_guard {
                for (label, proc) in map {
                    if target == "*" || target == *label {
                        let _ = proc.set_brightness(br);
                    }
                }
            }
        }
    }
    #[cfg(windows)]
    if let Some(op) = config.get("opacity").and_then(|v| v.as_f64()) {
        if let Ok(mpv_guard) = MPV_PLAYERS.lock() {
            if let Some(ref map) = *mpv_guard {
                for (label, proc) in map {
                    if (target == "*" || target == *label) && proc.hwnd != 0 {
                        set_hwnd_opacity(proc.hwnd as HWND, op);
                    }
                }
            }
        }
    }
    if let Some(vol) = config.get("volume").and_then(|v| v.as_f64()) {
        set_mpv_volume(monitor_label.clone(), vol);
    }
    if let Some(muted) = config.get("muted").and_then(|v| v.as_bool()) {
        set_mpv_mute(app.clone(), monitor_label.clone(), muted);
    }

    if let Ok(mut guard) = ACTIVE_WALLPAPERS.lock() {
        if let Some(ref mut map) = *guard {
            for (label, state) in map.iter_mut() {
                if target == "*" || target == *label {
                    if let (Some(target_obj), Some(upd_obj)) = (state.config.as_object_mut(), config.as_object()) {
                        for (k, v) in upd_obj {
                            target_obj.insert(k.clone(), v.clone());
                        }
                    }
                }
            }
        }
    }

    let target_audio_label = get_target_audio_monitor_label(&app);
    let mut audio_assigned = false;
    let windows = app.webview_windows();
    for (label, win) in &windows {
        if label.starts_with("wallpaper_") && (target == "*" || target == *label) {
            let is_target_audio = target_audio_label.as_deref() == Some(label.as_str()) || (!audio_assigned && target_audio_label.is_none());
            let is_secondary = !is_target_audio && target == "*";

            let mut win_config = config.clone();
            if let Some(obj) = win_config.as_object_mut() {
                obj.insert("isPrimary".to_string(), serde_json::json!(is_target_audio));
                obj.insert("isSecondary".to_string(), serde_json::json!(is_secondary));
                if is_secondary {
                    obj.insert("muted".to_string(), serde_json::json!(true));
                } else {
                    audio_assigned = true;
                }
            }

            let payload = serde_json::json!({ "config": win_config, "target": label.clone() });
            let _ = win.emit_to(label.as_str(), "aether:update-config", payload.clone());
            let _ = win.emit_to(label.as_str(), "aura:update-config", payload.clone());
            if let Some(fps_val) = config.get("fps").and_then(|v| v.as_f64()) {
                let _ = win.emit_to(label.as_str(), "aether:set-fps", serde_json::json!({ "fps": fps_val, "target": label.clone() }));
                let _ = win.emit_to(label.as_str(), "aura:set-fps", serde_json::json!({ "fps": fps_val, "target": label.clone() }));
            }
        }
    }
}

/// Update brightness on the live wallpaper (no engine restart needed).
#[tauri::command]
fn set_wallpaper_brightness(app: AppHandle, brightness: f64) {
    if let Ok(mpv_guard) = MPV_PLAYERS.lock() {
        if let Some(ref map) = *mpv_guard {
            for (_, proc) in map {
                let _ = proc.set_brightness(brightness);
            }
        }
    }
    let windows = app.webview_windows();
    for (label, win) in windows {
        if label.starts_with("wallpaper_") {
            let _ = win.emit_to(label.as_str(), "aether:set-brightness", serde_json::json!({ "brightness": brightness }));
            let _ = win.emit_to(label.as_str(), "aura:set-brightness", serde_json::json!({ "brightness": brightness }));
        }
    }
}

/// Update opacity on the live wallpaper (no engine restart needed).
#[tauri::command]
fn set_wallpaper_opacity(app: AppHandle, opacity: f64) {
    #[cfg(windows)]
    if let Ok(mpv_guard) = MPV_PLAYERS.lock() {
        if let Some(ref map) = *mpv_guard {
            for (_, proc) in map {
                if proc.hwnd != 0 {
                    set_hwnd_opacity(proc.hwnd as HWND, opacity);
                }
            }
        }
    }
    let windows = app.webview_windows();
    for (label, win) in windows {
        if label.starts_with("wallpaper_") {
            let _ = win.emit_to(label.as_str(), "aether:set-opacity", serde_json::json!({ "opacity": opacity }));
            let _ = win.emit_to(label.as_str(), "aura:set-opacity", serde_json::json!({ "opacity": opacity }));
        }
    }
}

/// Show or hide the main control panel window.
#[tauri::command]
fn toggle_control_panel(app: AppHandle) {
    if let Some(win) = app.get_webview_window("main") {
        if win.is_visible().unwrap_or(false) {
            let _ = win.hide();
        } else {
            let _ = win.show();
            let _ = win.set_focus();
        }
    }
}

/// Legacy command — kept for compat. Use apply_wallpaper instead.
#[tauri::command]
fn set_wallpaper_mode(app: AppHandle, active: bool) {
    if active {
        // no-op — use apply_wallpaper
    } else {
        stop_wallpaper(app, None);
    }
}

#[tauri::command]
fn get_system_info() -> serde_json::Value {
    serde_json::json!({
        "os": std::env::consts::OS,
        "arch": std::env::consts::ARCH,
    })
}

fn reassign_live_audio_output(app: &AppHandle) {
    let target_audio = get_target_audio_monitor_label(app);
    log_msg(&format!("[AUDIO ROUTING] Reassigning live wallpaper audio output to target: {:?}", target_audio));

    // 1. Update active MPV players: unmute target and assert its specific volume, mute all others
    if let Ok(mpv_guard) = MPV_PLAYERS.lock() {
        if let Some(ref map) = *mpv_guard {
            for (label, proc) in map {
                let should_play = match target_audio {
                    Some(ref t) => t == label,
                    None => true,
                };
                if should_play {
                    let mon_vol = get_target_mon_volume(label);
                    let _ = proc.set_volume(mon_vol);
                    let _ = proc.set_mute(false);
                    log_msg(&format!("[AUDIO ROUTING] MPV on '{}' UNMUTED with preserved volume {}", label, mon_vol));
                } else {
                    let _ = proc.set_mute(true);
                    log_msg(&format!("[AUDIO ROUTING] MPV on '{}' MUTED", label));
                }
            }
        }
    }

    // 2. Update Webview windows (Canvas / HTML / iframe video players)
    let windows = app.webview_windows();
    for (label, win) in &windows {
        if label.starts_with("wallpaper_") {
            let should_play = match target_audio {
                Some(ref t) => t == label,
                None => true,
            };
            if should_play {
                let mon_vol = get_target_mon_volume(label);
                let mute_event = "aether:unmute";
                let legacy_mute_event = "aura:unmute";
                let payload = serde_json::json!({ "target": label, "volume": mon_vol, "muted": false });
                let _ = win.emit_to(label.as_str(), mute_event, payload.clone());
                let _ = win.emit_to(label.as_str(), legacy_mute_event, payload);
            } else {
                let mute_event = "aether:mute";
                let legacy_mute_event = "aura:mute";
                let payload = serde_json::json!({ "target": label, "muted": true });
                let _ = win.emit_to(label.as_str(), mute_event, payload.clone());
                let _ = win.emit_to(label.as_str(), legacy_mute_event, payload);
            }
        }
    }
}

#[tauri::command]
fn sync_performance_settings(
    app: AppHandle,
    pause_on_battery: bool,
    pause_on_fullscreen: bool,
    pause_on_maximized: Option<bool>,
    multi_monitor_pause_mode: Option<String>,
    audio_playback_rule: Option<String>,
    preferred_audio_monitor: Option<String>,
    wallpaper_sync_on_resume: Option<bool>,
) {
    let mut audio_pref_changed = false;
    if let Ok(mut guard) = PERFORMANCE_SETTINGS.lock() {
        guard.pause_on_battery = pause_on_battery;
        guard.pause_on_fullscreen = pause_on_fullscreen;
        if let Some(pm) = pause_on_maximized {
            guard.pause_on_maximized = pm;
        }
        if let Some(mm) = multi_monitor_pause_mode {
            guard.multi_monitor_pause_mode = mm;
        }
        if let Some(ar) = audio_playback_rule {
            if guard.audio_playback_rule != ar {
                guard.audio_playback_rule = ar;
                audio_pref_changed = true;
            }
        }
        if let Some(ws) = wallpaper_sync_on_resume {
            guard.wallpaper_sync_on_resume = ws;
        }
        let clean_pref = match preferred_audio_monitor {
            Some(ref s) if s != "auto" && !s.is_empty() => Some(s.clone()),
            _ => None,
        };
        if guard.preferred_audio_monitor != clean_pref {
            guard.preferred_audio_monitor = clean_pref;
            audio_pref_changed = true;
        }
    }
    MONITOR_SYNC_REQUESTED.store(true, std::sync::atomic::Ordering::SeqCst);

    if audio_pref_changed {
        reassign_live_audio_output(&app);
    }
}

#[tauri::command]
fn set_autostart(enabled: bool) -> Result<(), String> {
    #[cfg(windows)]
    {
        if enabled {
            let current_exe = std::env::current_exe().map_err(|e| e.to_string())?;
            let exe_str = current_exe.to_string_lossy().to_string();
            let reg_val = format!("\"{}\" --autostart --minimized", exe_str);
            let status = std::process::Command::new("reg")
                .args(&[
                    "add",
                    "HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Run",
                    "/v",
                    "AetherFlow",
                    "/t",
                    "REG_SZ",
                    "/d",
                    &reg_val,
                    "/f",
                ])
                .creation_flags(0x08000000)
                .status()
                .map_err(|e| e.to_string())?;
            if status.success() {
                log_msg(&format!("[AUTOSTART] Registry Run key created: {}", reg_val));
                println!("[AUTOSTART] Registry Run key created: {}", reg_val);
                Ok(())
            } else {
                Err("Failed to set autostart registry key".to_string())
            }
        } else {
            let _ = std::process::Command::new("reg")
                .args(&[
                    "delete",
                    "HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Run",
                    "/v",
                    "AetherFlow",
                    "/f",
                ])
                .creation_flags(0x08000000)
                .status();
            log_msg("[AUTOSTART] Registry Run key deleted");
            println!("[AUTOSTART] Registry Run key deleted");
            Ok(())
        }
    }
    #[cfg(not(windows))]
    {
        Ok(())
    }
}

#[tauri::command]
fn is_autostart_enabled() -> bool {
    #[cfg(windows)]
    {
        let output = std::process::Command::new("reg")
            .args(&[
                "query",
                "HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Run",
                "/v",
                "AetherFlow",
            ])
            .creation_flags(0x08000000)
            .output();
        if let Ok(out) = output {
            out.status.success()
        } else {
            false
        }
    }
    #[cfg(not(windows))]
    {
        false
    }
}

#[tauri::command]
fn is_minimized_boot() -> bool {
    std::env::args().any(|arg| arg == "--minimized" || arg == "--autostart")
}

#[tauri::command]
async fn read_local_file(path: String) -> Result<Vec<u8>, String> {
    std::fs::read(&path).map_err(|e| e.to_string())
}

/// Sets the native Windows desktop wallpaper via Win32 SystemParametersInfoW
#[tauri::command]
fn set_system_wallpaper(path: String) -> Result<(), String> {
    #[cfg(windows)]
    {
        use std::ffi::OsStr;
        use std::os::windows::ffi::OsStrExt;

        let wide: Vec<u16> = OsStr::new(&path)
            .encode_wide()
            .chain(std::iter::once(0))
            .collect();

        unsafe {
            let res = SystemParametersInfoW(
                SPI_SETDESKWALLPAPER,
                0,
                wide.as_ptr() as *mut std::ffi::c_void,
                SPIF_UPDATEINIFILE | SPIF_SENDCHANGE,
            );
            if res == 0 {
                return Err("Failed to set system wallpaper".to_string());
            }
        }
        Ok(())
    }
    #[cfg(not(windows))]
    {
        let _ = path;
        Err("Only supported on Windows".to_string())
    }
}

/// Sets the Windows taskbar appearance style (default, clear, acrylic, blur) and border visibility
#[tauri::command]
fn set_taskbar_style(style: String, show_border: Option<bool>) -> Result<(), String> {
    let border = show_border.unwrap_or(false);
    taskbar::apply_taskbar_style(&style, border)
}

/// Returns the current Windows taskbar styling and TranslucentTB integration status
#[tauri::command]
fn get_taskbar_style() -> serde_json::Value {
    let (style, show_border, installed, running) = taskbar::get_current_taskbar_state();
    serde_json::json!({
        "style": style,
        "showBorder": show_border,
        "translucentTbInstalled": installed,
        "translucentTbRunning": running,
    })
}

/// Restarts Windows Explorer and TranslucentTB to cleanly recover from any corrupted taskbar state
#[tauri::command]
fn restart_taskbar_explorer() -> Result<(), String> {
    taskbar::restart_explorer_and_taskbar()
}

/// Safely opens external URLs or Windows protocol links in the default application
#[tauri::command]
fn open_url(url: String) -> Result<(), String> {
    log_msg(&format!("[AetherFlow] open_url requested: {}", url));
    #[cfg(windows)]
    {
        // 1. First attempt: Direct Win32 ShellExecuteW
        let wide_url: Vec<u16> = url.encode_utf16().chain(std::iter::once(0)).collect();
        let wide_op: Vec<u16> = "open".encode_utf16().chain(std::iter::once(0)).collect();

        let res = unsafe {
            windows_sys::Win32::UI::Shell::ShellExecuteW(
                std::ptr::null_mut(),
                wide_op.as_ptr(),
                wide_url.as_ptr(),
                std::ptr::null(),
                std::ptr::null(),
                windows_sys::Win32::UI::WindowsAndMessaging::SW_SHOWNORMAL as i32,
            )
        };

        let res_val = res as isize;
        log_msg(&format!("[AetherFlow] ShellExecuteW result: {}", res_val));

        if res_val > 32 {
            return Ok(());
        }

        // 2. Second attempt: PowerShell Start-Process with single-quoted URL (escapes $ & % properly)
        log_msg("[AetherFlow] ShellExecuteW returned <= 32, falling back to powershell Start-Process");
        let ps_script = format!("Start-Process '{}'", url.replace("'", "''"));
        let ps_res = std::process::Command::new("powershell")
            .args(["-NoProfile", "-NonInteractive", "-Command", &ps_script])
            .spawn();

        if let Ok(_) = ps_res {
            return Ok(());
        }

        // 3. Third attempt: explorer.exe
        log_msg("[AetherFlow] PowerShell failed, falling back to explorer.exe");
        std::process::Command::new("explorer")
            .arg(&url)
            .spawn()
            .map_err(|e| e.to_string())?;

        Ok(())
    }
    #[cfg(not(windows))]
    {
        let _ = url;
        Ok(())
    }
}

/// Decodes URL percent-encoding without external crates
fn urlencoding_decode(s: &str) -> String {
    let mut res = Vec::new();
    let bytes = s.as_bytes();
    let mut i = 0;
    while i < bytes.len() {
        if bytes[i] == b'%' && i + 2 < bytes.len() {
            if let Ok(val) = u8::from_str_radix(std::str::from_utf8(&bytes[i+1..i+3]).unwrap_or(""), 16) {
                res.push(val);
                i += 3;
                continue;
            }
        } else if bytes[i] == b'+' {
            res.push(b' ');
            i += 1;
            continue;
        }
        res.push(bytes[i]);
        i += 1;
    }
    String::from_utf8_lossy(&res).to_string()
}

/// Helper to restore and focus the main AetherFlow window
fn focus_main_window(app: &AppHandle) {
    if let Some(w) = app.get_webview_window("main") {
        let _ = w.unminimize();
        let _ = w.show();
        let _ = w.set_focus();
    }
    #[cfg(windows)]
    if let Some(main_h) = get_main_hwnd() {
        unsafe {
            ShowWindow(main_h, 9); // SW_RESTORE
            SetForegroundWindow(main_h);
        }
    }
}

/// Starts a local loopback HTTP server to receive OAuth callback from the system browser
#[tauri::command]
async fn start_oauth_listener(app: AppHandle) -> Result<u16, String> {
    use std::net::TcpListener;
    use std::io::{Read, Write};
    use std::time::{Duration, Instant};

    // If an OAuth listener is already running on a port, reuse that port!
    if let Ok(guard) = ACTIVE_OAUTH_PORT.lock() {
        if let Some(existing_port) = *guard {
            log_msg(&format!("[AetherFlow] Reusing active OAuth loopback listener on port {}", existing_port));
            println!("[AetherFlow] Reusing active OAuth loopback listener on port {}", existing_port);
            return Ok(existing_port);
        }
    }

    // Try binding to port 1420 first; if already in use, bind to port 0 for an ephemeral port
    let listener = TcpListener::bind("127.0.0.1:1420")
        .or_else(|_| TcpListener::bind("127.0.0.1:0"))
        .map_err(|e| {
            let err = format!("Failed to bind OAuth listener: {}", e);
            log_msg(&format!("[AetherFlow] {}", err));
            err
        })?;

    let port = listener.local_addr().map_err(|e| e.to_string())?.port();
    if let Ok(mut guard) = ACTIVE_OAUTH_PORT.lock() {
        *guard = Some(port);
    }

    log_msg(&format!("[AetherFlow] Started OAuth loopback listener on port {}", port));
    println!("[AetherFlow] Started OAuth loopback listener on port {}", port);

    let app_clone = app.clone();

    std::thread::spawn(move || {
        let _ = listener.set_nonblocking(false);
        let start_time = Instant::now();
        let timeout = Duration::from_secs(600); // 10 minutes timeout

        let html_page = r###"<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>AetherFlow — Sign In</title>
  <style>
    body {
      background: #0d1117;
      color: #e6edf3;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
      display: flex;
      align-items: center;
      justify-content: center;
      min-height: 100vh;
      margin: 0;
      padding: 20px;
      box-sizing: border-box;
    }
    .card {
      background: #161b22;
      border: 1px solid #30363d;
      border-radius: 16px;
      padding: 36px 32px;
      max-width: 440px;
      width: 100%;
      text-align: center;
      box-shadow: 0 20px 40px rgba(0, 0, 0, 0.4);
    }
    .logo {
      width: 48px;
      height: 48px;
      border-radius: 12px;
      background: #38bdf8;
      display: flex;
      align-items: center;
      justify-content: center;
      margin: 0 auto 16px;
    }
    .spinner {
      width: 24px;
      height: 24px;
      border: 3px solid rgba(56, 189, 248, 0.2);
      border-top-color: #38bdf8;
      border-radius: 50%;
      animation: spin 0.8s linear infinite;
      margin: 16px auto;
    }
    @keyframes spin { to { transform: rotate(360deg); } }
    h1 { font-size: 20px; margin: 0 0 8px; color: #ffffff; }
    p { font-size: 14px; color: #8b949e; line-height: 1.5; margin: 0; }
    .success-icon { font-size: 32px; margin-bottom: 8px; }
  </style>
</head>
<body>
  <div class="card">
    <div class="logo">
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#ffffff" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
        <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"></polygon>
      </svg>
    </div>
    <div id="content">
      <div class="spinner"></div>
      <h1>Connecting to AetherFlow...</h1>
      <p>Transferring authentication session to the desktop app.</p>
    </div>
  </div>
  <script>
    (function() {
      const fullUrl = window.location.href;
      const hash = window.location.hash || '';
      const search = window.location.search || '';

      function setStatus(title, desc, isSuccess) {
        const el = document.getElementById('content');
        if (!el) return;
        el.innerHTML = `
          <div class="success-icon" style="color: ${isSuccess ? '#4ade80' : '#38bdf8'}; font-size: 32px; margin-bottom: 8px;">${isSuccess ? '✓' : 'ℹ'}</div>
          <h1 style="color: ${isSuccess ? '#4ade80' : '#38bdf8'}; font-size: 20px; margin: 0 0 8px;">${title}</h1>
          <p style="font-size: 14px; color: #8b949e; line-height: 1.5; margin: 0;">${desc}</p>
          <div style="margin-top: 20px; display: flex; flex-direction: column; gap: 8px;">
            <button id="copyBtn" onclick="copyAndFocus()" style="
              background: #238636; color: white; border: 1px solid rgba(255,255,255,0.1);
              padding: 10px 16px; border-radius: 8px; font-weight: 600; cursor: pointer; font-size: 13px;
            ">
              Copy Sign-in Link
            </button>
          </div>
          <p style="margin-top: 14px; font-size: 12px; color: #6e7681;">
            If AetherFlow hasn't updated, click Copy and paste into the app.
          </p>
        `;
      }

      window.copyAndFocus = function() {
        navigator.clipboard.writeText(fullUrl).then(function() {
          const btn = document.getElementById('copyBtn');
          if (btn) btn.innerText = 'Copied to Clipboard!';
        }).catch(function() {
          prompt('Copy this link and paste it into AetherFlow:', fullUrl);
        });
      };

      let completed = false;

      // 1. Send via GET with URL query param (zero packet fragmentation, instant)
      const getUrl = '/token?url=' + encodeURIComponent(fullUrl) + '&hash=' + encodeURIComponent(hash);
      fetch(getUrl)
        .then(function(res) {
          if (res.ok && !completed) {
            completed = true;
            setStatus('Signed In Successfully!', 'Session transferred to AetherFlow. You can now return to the app.', true);
            setTimeout(function() { window.close(); }, 3000);
          }
        })
        .catch(function() {});

      // 2. Also send via POST
      fetch('/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: fullUrl, hash: hash, search: search })
      }).then(function(res) {
        if (res.ok && !completed) {
          completed = true;
          setStatus('Signed In Successfully!', 'Session transferred to AetherFlow. You can now return to the app.', true);
          setTimeout(function() { window.close(); }, 3000);
        }
      }).catch(function(err) {
        if (!completed) {
          setStatus('Return to AetherFlow', 'Please copy the link below and paste it into AetherFlow to complete sign-in.', false);
        }
      });
    })();
  </script>
</body>
</html>"###;

        while start_time.elapsed() < timeout {
            if let Ok((mut stream, _)) = listener.accept() {
                let _ = stream.set_read_timeout(Some(Duration::from_secs(4)));
                let mut raw_req = Vec::new();
                let mut chunk = [0u8; 4096];
                let mut content_length: Option<usize> = None;
                let mut header_end: Option<usize> = None;

                loop {
                    match stream.read(&mut chunk) {
                        Ok(0) => break,
                        Ok(read_n) => {
                            raw_req.extend_from_slice(&chunk[..read_n]);
                            if header_end.is_none() {
                                if let Some(pos) = raw_req.windows(4).position(|w| w == b"\r\n\r\n") {
                                    header_end = Some(pos + 4);
                                    let header_str = String::from_utf8_lossy(&raw_req[..pos]);
                                    for line in header_str.lines() {
                                        let lower = line.to_ascii_lowercase();
                                        if lower.starts_with("content-length:") {
                                            if let Some(val_str) = line.split(':').nth(1) {
                                                content_length = val_str.trim().parse::<usize>().ok();
                                            }
                                        }
                                    }
                                }
                            }

                            if let Some(h_end) = header_end {
                                let cl = content_length.unwrap_or(0);
                                if raw_req.len() >= h_end + cl {
                                    break;
                                }
                            }
                        }
                        Err(_) => break,
                    }
                }

                if raw_req.is_empty() {
                    continue;
                }

                let req_str = String::from_utf8_lossy(&raw_req);
                let first_line = req_str.lines().next().unwrap_or("");
                log_msg(&format!("[AetherFlow OAuth] Incoming request: '{}' (total {} bytes)", first_line, raw_req.len()));

                if first_line.starts_with("OPTIONS ") {
                    let resp = "HTTP/1.1 204 No Content\r\nAccess-Control-Allow-Origin: *\r\nAccess-Control-Allow-Methods: GET, POST, OPTIONS\r\nAccess-Control-Allow-Headers: *\r\nConnection: close\r\n\r\n";
                    let _ = stream.write_all(resp.as_bytes());
                    let _ = stream.flush();
                    continue;
                }

                if first_line.starts_with("GET /favicon.ico") {
                    let resp = "HTTP/1.1 204 No Content\r\nConnection: close\r\n\r\n";
                    let _ = stream.write_all(resp.as_bytes());
                    let _ = stream.flush();
                    continue;
                }

                let mut extracted_token_url: Option<String> = None;

                if first_line.starts_with("GET ") {
                    let path = first_line.split_whitespace().nth(1).unwrap_or("/");
                    
                    if path.contains("code=") || path.contains("access_token=") || path.contains("url=") || path.contains("token=") || path.contains("hash=") {
                        if let Some(query_start) = path.find('?') {
                            let query = &path[query_start + 1..];
                            for pair in query.split('&') {
                                if let Some((k, v)) = pair.split_once('=') {
                                    if k == "url" || k == "data" {
                                        let decoded = urlencoding_decode(v);
                                        if !decoded.is_empty() {
                                            extracted_token_url = Some(decoded);
                                            break;
                                        }
                                    } else if k == "hash" {
                                        let decoded = urlencoding_decode(v);
                                        if decoded.contains("access_token=") {
                                            extracted_token_url = Some(format!("http://localhost:{}/callback{}", port, decoded));
                                            break;
                                        }
                                    }
                                }
                            }
                        }

                        if extracted_token_url.is_none() {
                            extracted_token_url = Some(format!("http://localhost:{}{}", port, path));
                        }
                    }

                    if extracted_token_url.is_none() {
                        let resp = format!(
                            "HTTP/1.1 200 OK\r\nContent-Type: text/html; charset=utf-8\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{}",
                            html_page.len(),
                            html_page
                        );
                        let _ = stream.write_all(resp.as_bytes());
                        let _ = stream.flush();
                        continue;
                    }
                } else if first_line.starts_with("POST /token") {
                    let h_end = header_end.unwrap_or(0);
                    let body_str = if h_end < raw_req.len() {
                        String::from_utf8_lossy(&raw_req[h_end..]).to_string()
                    } else {
                        String::new()
                    };

                    log_msg(&format!("[AetherFlow OAuth] POST /token body: {}", if body_str.len() > 140 { &body_str[..140] } else { &body_str }));

                    if let Ok(val) = serde_json::from_str::<serde_json::Value>(&body_str) {
                        let url_val = val.get("url").and_then(|v| v.as_str()).unwrap_or("");
                        let hash_val = val.get("hash").and_then(|v| v.as_str()).unwrap_or("");
                        let search_val = val.get("search").and_then(|v| v.as_str()).unwrap_or("");

                        if !url_val.is_empty() {
                            extracted_token_url = Some(url_val.to_string());
                        } else if !hash_val.is_empty() || !search_val.is_empty() {
                            extracted_token_url = Some(format!("http://localhost:{}/callback{}{}", port, search_val, hash_val));
                        }
                    } else {
                        log_msg(&format!("[AetherFlow OAuth] Failed to parse JSON from body: {}", body_str));
                        if body_str.contains("access_token=") || body_str.contains("code=") {
                            extracted_token_url = Some(body_str);
                        }
                    }
                }

                if let Some(final_url) = extracted_token_url {
                    log_msg(&format!("[AetherFlow OAuth] SUCCESS: Intercepted OAuth token URL: {}", final_url));
                    println!("[AetherFlow OAuth] SUCCESS: Intercepted OAuth token URL: {}", final_url);

                    if let Some(main_win) = app_clone.get_webview_window("main") {
                        let _ = main_win.emit("aether:oauth-callback", &final_url);
                        let _ = main_win.emit_to("main", "aether:oauth-callback", &final_url);
                        let _ = main_win.emit("aura:oauth-callback", &final_url);
                        let _ = main_win.emit_to("main", "aura:oauth-callback", &final_url);
                    }
                    let _ = app_clone.emit("aether:oauth-callback", final_url.clone());
                    let _ = app_clone.emit("aura:oauth-callback", final_url);
                    focus_main_window(&app_clone);

                    let resp = "HTTP/1.1 200 OK\r\nContent-Type: application/json\r\nAccess-Control-Allow-Origin: *\r\nContent-Length: 15\r\nConnection: close\r\n\r\n{\"status\":\"ok\"}";
                    let _ = stream.write_all(resp.as_bytes());
                    let _ = stream.flush();

                    std::thread::sleep(Duration::from_millis(500));
                    break;
                } else {
                    let resp = "HTTP/1.1 400 Bad Request\r\nContent-Type: text/plain\r\nAccess-Control-Allow-Origin: *\r\nConnection: close\r\n\r\nInvalid token request";
                    let _ = stream.write_all(resp.as_bytes());
                    let _ = stream.flush();
                }
            }
        }
        if let Ok(mut guard) = ACTIVE_OAUTH_PORT.lock() {
            *guard = None;
        }
        log_msg(&format!("[AetherFlow] OAuth listener on port {} closed", port));
        println!("[AetherFlow] OAuth listener on port {} closed", port);
    });

    Ok(port)
}

/// Fallback compatibility for open_oauth_window: delegates directly to system browser
#[tauri::command]
async fn open_oauth_window(url: String) -> Result<(), String> {
    open_url(url)
}

#[cfg(windows)]
fn kill_all_descendant_processes() {
    use std::collections::HashSet;
    use windows_sys::Win32::System::Threading::{
        GetCurrentProcessId, OpenProcess, TerminateProcess, PROCESS_TERMINATE,
    };
    use windows_sys::Win32::System::Diagnostics::ToolHelp::{
        CreateToolhelp32Snapshot, Process32First, Process32Next, PROCESSENTRY32, TH32CS_SNAPPROCESS,
    };
    use windows_sys::Win32::Foundation::CloseHandle;

    unsafe {
        let current_pid = GetCurrentProcessId();
        let snapshot = CreateToolhelp32Snapshot(TH32CS_SNAPPROCESS, 0);
        if snapshot != windows_sys::Win32::Foundation::INVALID_HANDLE_VALUE {
            let mut entry: PROCESSENTRY32 = std::mem::zeroed();
            entry.dwSize = std::mem::size_of::<PROCESSENTRY32>() as u32;

            let mut proc_list: Vec<(u32, u32)> = Vec::new(); // (pid, parent_pid)
            if Process32First(snapshot, &mut entry) != 0 {
                loop {
                    proc_list.push((entry.th32ProcessID, entry.th32ParentProcessID));
                    if Process32Next(snapshot, &mut entry) == 0 {
                        break;
                    }
                }
            }
            CloseHandle(snapshot);

            // Recursively collect all descendant PIDs (children, grandchildren: WebView2 renderers, GPU, etc.)
            let mut target_pids = HashSet::new();
            let mut frontier = vec![current_pid];

            while let Some(parent) = frontier.pop() {
                for &(pid, parent_id) in &proc_list {
                    if parent_id == parent && target_pids.insert(pid) {
                        frontier.push(pid);
                    }
                }
            }

            for pid in target_pids {
                let h_proc = OpenProcess(PROCESS_TERMINATE, 0, pid);
                if !h_proc.is_null() {
                    let _ = TerminateProcess(h_proc, 1);
                    CloseHandle(h_proc);
                }
            }
        }
    }
}

#[cfg(windows)]
fn trim_all_process_memory() {
    use std::collections::HashSet;
    use windows_sys::Win32::System::Threading::{
        GetCurrentProcess, GetCurrentProcessId, OpenProcess, PROCESS_SET_QUOTA, PROCESS_QUERY_INFORMATION
    };
    use windows_sys::Win32::System::ProcessStatus::EmptyWorkingSet;
    use windows_sys::Win32::System::Diagnostics::ToolHelp::{
        CreateToolhelp32Snapshot, Process32First, Process32Next, PROCESSENTRY32, TH32CS_SNAPPROCESS
    };
    use windows_sys::Win32::Foundation::CloseHandle;

    unsafe {
        // 1. Trim host process working set
        EmptyWorkingSet(GetCurrentProcess());

        // 2. Enumerate and recursively trim all descendant processes (children, grandchildren: GPU process, renderers, utilities, mpv)
        let current_pid = GetCurrentProcessId();
        let snapshot = CreateToolhelp32Snapshot(TH32CS_SNAPPROCESS, 0);
        if snapshot != windows_sys::Win32::Foundation::INVALID_HANDLE_VALUE {
            let mut entry: PROCESSENTRY32 = std::mem::zeroed();
            entry.dwSize = std::mem::size_of::<PROCESSENTRY32>() as u32;

            let mut proc_list: Vec<(u32, u32)> = Vec::new(); // (pid, parent_pid)
            if Process32First(snapshot, &mut entry) != 0 {
                loop {
                    proc_list.push((entry.th32ProcessID, entry.th32ParentProcessID));
                    if Process32Next(snapshot, &mut entry) == 0 {
                        break;
                    }
                }
            }
            CloseHandle(snapshot);

            // Recursively collect all descendant PIDs starting from current_pid
            let mut target_pids = HashSet::new();
            let mut frontier = vec![current_pid];

            while let Some(parent) = frontier.pop() {
                for &(pid, parent_id) in &proc_list {
                    if parent_id == parent && target_pids.insert(pid) {
                        frontier.push(pid);
                    }
                }
            }

            // Trim working set of every descendant process (WebView2 broker, GPU process, renderers, mpv)
            for pid in target_pids {
                let child_h = OpenProcess(PROCESS_SET_QUOTA | PROCESS_QUERY_INFORMATION, 0, pid);
                if !child_h.is_null() {
                    EmptyWorkingSet(child_h);
                    CloseHandle(child_h);
                }
            }
        }
    }
}

#[tauri::command]
fn trim_memory() {
    #[cfg(windows)]
    trim_all_process_memory();
}

#[tauri::command]
fn get_detailed_memory_usage() -> serde_json::Value {
    #[cfg(windows)]
    {
        use std::collections::HashSet;
        use windows_sys::Win32::System::Threading::{
            GetCurrentProcess, GetCurrentProcessId, OpenProcess, PROCESS_QUERY_INFORMATION
        };
        use windows_sys::Win32::System::ProcessStatus::{K32GetProcessMemoryInfo, PROCESS_MEMORY_COUNTERS};
        use windows_sys::Win32::System::Diagnostics::ToolHelp::{
            CreateToolhelp32Snapshot, Process32First, Process32Next, PROCESSENTRY32, TH32CS_SNAPPROCESS
        };
        use windows_sys::Win32::Foundation::CloseHandle;

        unsafe {
            let mut host_bytes = 0usize;
            let mut webview_bytes = 0usize;
            let mut mpv_bytes = 0usize;

            // 1. Host process
            let mut pmc: PROCESS_MEMORY_COUNTERS = std::mem::zeroed();
            pmc.cb = std::mem::size_of::<PROCESS_MEMORY_COUNTERS>() as u32;
            if K32GetProcessMemoryInfo(GetCurrentProcess(), &mut pmc, pmc.cb) != 0 {
                host_bytes = pmc.WorkingSetSize;
            }

            // 2. Discover all descendant processes
            let current_pid = GetCurrentProcessId();
            let snapshot = CreateToolhelp32Snapshot(TH32CS_SNAPPROCESS, 0);
            if snapshot != windows_sys::Win32::Foundation::INVALID_HANDLE_VALUE {
                let mut entry: PROCESSENTRY32 = std::mem::zeroed();
                entry.dwSize = std::mem::size_of::<PROCESSENTRY32>() as u32;

                let mut proc_list: Vec<(u32, u32, String)> = Vec::new();
                if Process32First(snapshot, &mut entry) != 0 {
                    loop {
                        let name_len = entry.szExeFile.iter().position(|&c| c == 0).unwrap_or(entry.szExeFile.len());
                        let name_str: String = entry.szExeFile[..name_len].iter().map(|&c| c as u8 as char).collect();
                        proc_list.push((entry.th32ProcessID, entry.th32ParentProcessID, name_str.to_lowercase()));
                        if Process32Next(snapshot, &mut entry) == 0 {
                            break;
                        }
                    }
                }
                CloseHandle(snapshot);

                let mut target_pids = HashSet::new();
                let mut frontier = vec![current_pid];

                while let Some(parent) = frontier.pop() {
                    for &(pid, parent_id, _) in &proc_list {
                        if parent_id == parent && target_pids.insert(pid) {
                            frontier.push(pid);
                        }
                    }
                }

                for &(pid, _, ref name) in &proc_list {
                    if target_pids.contains(&pid) {
                        let child_h = OpenProcess(PROCESS_QUERY_INFORMATION, 0, pid);
                        if !child_h.is_null() {
                            let mut c_pmc: PROCESS_MEMORY_COUNTERS = std::mem::zeroed();
                            c_pmc.cb = std::mem::size_of::<PROCESS_MEMORY_COUNTERS>() as u32;
                            if K32GetProcessMemoryInfo(child_h, &mut c_pmc, c_pmc.cb) != 0 {
                                if name.contains("mpv") {
                                    mpv_bytes += c_pmc.WorkingSetSize;
                                } else {
                                    webview_bytes += c_pmc.WorkingSetSize;
                                }
                            }
                            CloseHandle(child_h);
                        }
                    }
                }
            }

            let total_bytes = host_bytes + webview_bytes + mpv_bytes;
            serde_json::json!({
                "host_mb": (host_bytes as f64 / 1_048_576.0 * 10.0).round() / 10.0,
                "webview_mb": (webview_bytes as f64 / 1_048_576.0 * 10.0).round() / 10.0,
                "mpv_mb": (mpv_bytes as f64 / 1_048_576.0 * 10.0).round() / 10.0,
                "total_mb": (total_bytes as f64 / 1_048_576.0 * 10.0).round() / 10.0,
            })
        }
    }
    #[cfg(not(windows))]
    {
        serde_json::json!({
            "host_mb": 0.0,
            "webview_mb": 0.0,
            "mpv_mb": 0.0,
            "total_mb": 0.0,
        })
    }
}

#[tauri::command]
fn frontend_heartbeat(page: String, visibility: String, timestamp: f64, mounted: bool) -> serde_json::Value {
    let msg = format!("[FRONTEND HEARTBEAT] page={}, visibility={}, mounted={}, ts={:.0}", page, visibility, mounted, timestamp);
    static LAST_LOG: Mutex<Option<std::time::Instant>> = Mutex::new(None);
    let mut should_log = false;
    if let Ok(mut guard) = LAST_LOG.lock() {
        if guard.is_none() || guard.unwrap().elapsed() >= std::time::Duration::from_secs(10) {
            *guard = Some(std::time::Instant::now());
            should_log = true;
        }
    }
    if should_log {
        log_msg(&msg);
        println!("{}", msg);
    }
    serde_json::json!({ "ok": true, "ack": timestamp })
}

#[tauri::command]
fn report_frontend_error(error: String, info: Option<String>, source: Option<String>) {
    let msg = format!("[FRONTEND ERROR] source={:?}, error={}, info={:?}", source, error, info);
    log_msg(&msg);
    eprintln!("{}", msg);
}

#[tauri::command]
fn get_diagnostics(app: AppHandle) -> serde_json::Value {
    #[cfg(windows)]
    let (main_h_str, main_parent_str, main_vis, main_is_win) = if let Some(h) = get_main_hwnd() {
        unsafe {
            (
                format!("0x{:X}", h as usize),
                format!("0x{:X}", GetParent(h) as usize),
                IsWindowVisible(h) != 0,
                IsWindow(h) != 0,
            )
        }
    } else if let Some(win) = app.get_webview_window("main") {
        let (h_str, p_str, is_win) = if let Ok(h) = win.hwnd() {
            let raw_h = h.0 as HWND;
            unsafe {
                (format!("0x{:X}", raw_h as usize), format!("0x{:X}", GetParent(raw_h) as usize), IsWindow(raw_h) != 0)
            }
        } else {
            let title_wide: Vec<u16> = "AetherFlow\0".encode_utf16().collect();
            let found = unsafe { FindWindowW(std::ptr::null(), title_wide.as_ptr()) };
            if !found.is_null() {
                unsafe {
                    (format!("0x{:X}", found as usize), format!("0x{:X}", GetParent(found) as usize), IsWindow(found) != 0)
                }
            } else {
                ("unknown".to_string(), "0x0".to_string(), false)
            }
        };
        (h_str, p_str, win.is_visible().unwrap_or(false), is_win)
    } else {
        ("0x0".to_string(), "0x0".to_string(), false, false)
    };

    #[cfg(not(windows))]
    let (main_h_str, main_parent_str, main_vis, main_is_win) = ("0x0".to_string(), "0x0".to_string(), false, false);

    let mut native_hosts = serde_json::Map::new();
    #[cfg(windows)]
    if let Ok(guard) = MPV_PLAYERS.lock() {
        if let Some(ref map) = *guard {
            for (label, proc) in map {
                let hwnd = proc.hwnd as HWND;
                let (parent, vis) = unsafe { (format!("0x{:X}", GetParent(hwnd) as usize), IsWindowVisible(hwnd) != 0) };
                native_hosts.insert(label.clone(), serde_json::json!({
                    "hwnd": format!("0x{:X}", proc.hwnd),
                    "parent": parent,
                    "visible": vis,
                }));
            }
        }
    }

    let mut webview_hosts = serde_json::Map::new();
    for (label, win) in app.webview_windows() {
        if label.starts_with("wallpaper_") {
            #[cfg(windows)]
            let (raw_h_str, parent_str) = if let Ok(hwnd) = win.hwnd() {
                let raw_h = hwnd.0 as HWND;
                unsafe {
                    (format!("0x{:X}", raw_h as usize), format!("0x{:X}", GetParent(raw_h) as usize))
                }
            } else {
                ("unknown".to_string(), "unknown".to_string())
            };
            #[cfg(not(windows))]
            let (raw_h_str, parent_str) = ("n/a".to_string(), "n/a".to_string());

            webview_hosts.insert(label.clone(), serde_json::json!({
                "hwnd": raw_h_str,
                "parent": parent_str,
                "visible": win.is_visible().unwrap_or(false),
            }));
        }
    }

    let mut mpv_status = serde_json::Map::new();
    if let Ok(guard) = MPV_PLAYERS.lock() {
        if let Some(ref map) = *guard {
            for (label, proc) in map {
                mpv_status.insert(label.clone(), serde_json::json!({
                    "pid": proc.child.id(),
                    "pipe": proc.pipe_name,
                    "video": proc.video_path,
                }));
            }
        }
    }

    serde_json::json!({
        "main_hwnd": main_h_str,
        "main_parent_hwnd": main_parent_str,
        "main_is_window": main_is_win,
        "main_is_visible": main_vis,
        "native_wallpaper_windows": native_hosts,
        "webview_wallpaper_windows": webview_hosts,
        "mpv_players": mpv_status,
    })
}

pub static USER_MANUALLY_PAUSED: std::sync::atomic::AtomicBool = std::sync::atomic::AtomicBool::new(false);

pub fn do_toggle_wallpaper_pause(app: AppHandle) {
    let was_paused = USER_MANUALLY_PAUSED.load(std::sync::atomic::Ordering::Relaxed);
    let next_paused = !was_paused;
    USER_MANUALLY_PAUSED.store(next_paused, std::sync::atomic::Ordering::Relaxed);
    MONITOR_SYNC_REQUESTED.store(true, std::sync::atomic::Ordering::SeqCst);

    if next_paused {
        set_mpv_pause(None, true);
        let windows = app.webview_windows();
        for (label, win) in windows {
            if label.starts_with("wallpaper_") {
                let _ = win.emit_to(label.clone(), "aether:pause", serde_json::json!({ "target": "*" }));
                let _ = win.emit_to(label.clone(), "aura:pause", serde_json::json!({ "target": "*" }));
            }
        }
    }
    let _ = app.emit("aether:shortcut:toggle-pause", serde_json::json!({ "isPaused": next_paused }));
}

#[tauri::command]
fn toggle_wallpaper_pause(app: AppHandle) {
    do_toggle_wallpaper_pause(app);
}

pub static IS_GLOBAL_MUTED: std::sync::atomic::AtomicBool = std::sync::atomic::AtomicBool::new(false);

pub fn do_toggle_wallpaper_mute(app: AppHandle) {
    let was_muted = IS_GLOBAL_MUTED.load(std::sync::atomic::Ordering::Relaxed);
    let next_muted = !was_muted;
    IS_GLOBAL_MUTED.store(next_muted, std::sync::atomic::Ordering::Relaxed);
    set_mpv_mute(app.clone(), None, next_muted);
    let _ = app.emit("aether:shortcut:toggle-mute", serde_json::json!({ "muted": next_muted }));
}

#[tauri::command]
fn toggle_wallpaper_mute(app: AppHandle) {
    do_toggle_wallpaper_mute(app);
}

#[cfg(windows)]
fn find_shelldll_defview() -> HWND {
    unsafe {
        let shell_class: Vec<u16> = "SHELLDLL_DefView\0".encode_utf16().collect();
        let progman_class: Vec<u16> = "Progman\0".encode_utf16().collect();
        let progman = FindWindowW(progman_class.as_ptr(), std::ptr::null());
        if !progman.is_null() {
            let s = FindWindowExW(progman, std::ptr::null_mut(), shell_class.as_ptr(), std::ptr::null());
            if !s.is_null() {
                return s;
            }
        }
        let mut state = DesktopWindows { shell: std::ptr::null_mut(), workerw: std::ptr::null_mut() };
        EnumWindows(Some(enum_window), &mut state as *mut DesktopWindows as LPARAM);
        state.shell
    }
}

pub fn do_set_desktop_icons_visible(app: AppHandle, visible: bool) -> Result<(), String> {
    #[cfg(windows)]
    {
        let shell = find_shelldll_defview();
        if !shell.is_null() {
            unsafe {
                // Ensure SHELLDLL_DefView itself is ALWAYS visible so desktop right-clicks continue to work!
                ShowWindow(shell, 5); // SW_SHOW

                let list_class: Vec<u16> = "SysListView32\0".encode_utf16().collect();
                let list_view = FindWindowExW(shell, std::ptr::null_mut(), list_class.as_ptr(), std::ptr::null());
                if !list_view.is_null() {
                    ShowWindow(list_view, if visible { 5 } else { 0 });
                } else {
                    SendMessageW(shell, 0x0111, 0x7402, 0);
                }
            }
            let _ = app.emit("aether:shortcut:toggle-icons", serde_json::json!({ "hideDesktopIcons": !visible }));
            return Ok(());
        }
    }
    Err("Could not locate desktop shell window".into())
}

#[tauri::command]
fn set_desktop_icons_visible(app: AppHandle, visible: bool) -> Result<(), String> {
    do_set_desktop_icons_visible(app, visible)
}

pub fn do_toggle_desktop_icons(app: AppHandle) -> Result<bool, String> {
    #[cfg(windows)]
    {
        let shell = find_shelldll_defview();
        if !shell.is_null() {
            unsafe {
                // Ensure SHELLDLL_DefView itself is ALWAYS visible so desktop right-clicks continue to work!
                ShowWindow(shell, 5); // SW_SHOW

                let list_class: Vec<u16> = "SysListView32\0".encode_utf16().collect();
                let list_view = FindWindowExW(shell, std::ptr::null_mut(), list_class.as_ptr(), std::ptr::null());
                let next_state = if !list_view.is_null() {
                    let is_vis = IsWindowVisible(list_view) != 0;
                    let next = !is_vis;
                    ShowWindow(list_view, if next { 5 } else { 0 });
                    next
                } else {
                    SendMessageW(shell, 0x0111, 0x7402, 0);
                    true
                };
                let _ = app.emit("aether:shortcut:toggle-icons", serde_json::json!({ "hideDesktopIcons": !next_state }));
                return Ok(next_state);
            }
        }
    }
    Err("Could not locate desktop shell window".into())
}

#[tauri::command]
fn toggle_desktop_icons(app: AppHandle) -> Result<bool, String> {
    do_toggle_desktop_icons(app)
}

#[tauri::command]
fn set_desktop_context_menu(enabled: bool) -> Result<(), String> {
    #[cfg(windows)]
    {
        if enabled {
            let exe = std::env::current_exe()
                .map_err(|e| format!("Failed to resolve exe path: {}", e))?
                .to_string_lossy()
                .to_string();
            context_menu::register_desktop_context_menu(&exe)
        } else {
            context_menu::unregister_desktop_context_menu()
        }
    }
    #[cfg(not(windows))]
    Ok(())
}

#[tauri::command]
fn get_desktop_context_menu_status() -> bool {
    #[cfg(windows)]
    {
        context_menu::is_desktop_context_menu_registered()
    }
    #[cfg(not(windows))]
    false
}

#[tauri::command]
fn set_file_context_menu(enabled: bool) -> Result<(), String> {
    #[cfg(windows)]
    {
        if enabled {
            let exe = std::env::current_exe()
                .map_err(|e| format!("Failed to resolve exe path: {}", e))?
                .to_string_lossy()
                .to_string();
            context_menu::register_file_context_menu(&exe)
        } else {
            context_menu::unregister_file_context_menu()
        }
    }
    #[cfg(not(windows))]
    Ok(())
}

#[tauri::command]
fn get_file_context_menu_status() -> bool {
    #[cfg(windows)]
    {
        context_menu::is_file_context_menu_registered()
    }
    #[cfg(not(windows))]
    false
}

#[tauri::command]
fn update_registered_hotkeys(app: AppHandle, bindings: std::collections::HashMap<String, String>) -> Result<(), String> {
    hotkeys::update_registered_hotkeys(&app, bindings)
}

#[cfg(windows)]
fn ensure_canonical_start_menu_shortcut() {
    std::thread::spawn(|| {
        let current_exe = match std::env::current_exe() {
            Ok(p) => p,
            Err(_) => return,
        };
        let exe_str = current_exe.to_string_lossy().to_lowercase();
        if exe_str.contains("target\\debug") {
            return;
        }

        let appdata = match std::env::var("APPDATA") {
            Ok(v) => std::path::PathBuf::from(v),
            Err(_) => return,
        };

        let programs_dir = appdata.join("Microsoft").join("Windows").join("Start Menu").join("Programs");
        if !programs_dir.exists() {
            let _ = std::fs::create_dir_all(&programs_dir);
        }

        let lnk_path = programs_dir.join("AetherFlow.lnk");
        let exe_path_str = current_exe.to_string_lossy().to_string();
        let dir_str = current_exe.parent().map(|p| p.to_string_lossy().to_string()).unwrap_or_default();

        use std::os::windows::process::CommandExt;
        let ps_cmd = format!(
            "$w = New-Object -ComObject WScript.Shell; \
             $s = $w.CreateShortcut('{lnk}'); \
             $s.TargetPath = '{exe}'; \
             $s.WorkingDirectory = '{dir}'; \
             $s.IconLocation = '{exe},0'; \
             $s.Description = 'AetherFlow — Live Desktop Visuals'; \
             $s.Save(); \
             $k = 'HKCU:\\Software\\Classes\\Local Settings\\Software\\Microsoft\\Windows\\Shell\\MuiCache'; \
             $props = (Get-ItemProperty $k -ErrorAction SilentlyContinue).PSObject.Properties | Where-Object {{ $_.Name -like '*AetherFlow-VideoEngine*' }}; \
             foreach ($p in $props) {{ Remove-ItemProperty -Path $k -Name $p.Name -ErrorAction SilentlyContinue }};",
            lnk = lnk_path.display(),
            exe = exe_path_str,
            dir = dir_str
        );

        let _ = std::process::Command::new("powershell")
            .arg("-NoProfile")
            .arg("-NonInteractive")
            .arg("-WindowStyle")
            .arg("Hidden")
            .arg("-Command")
            .arg(&ps_cmd)
            .creation_flags(0x08000000) // CREATE_NO_WINDOW
            .status();

        log_msg(&format!("[APP IDENTITY] Verified canonical Start Menu shortcut at: {:?}", lnk_path));
    });
}

// ─── Main ─────────────────────────────────────────────────────────────────────

fn main() {
    #[cfg(windows)]
    {
        // 0. Ensure process window station is WinSta0 and thread desktop is Default if opened from a runner
        unsafe {
            use windows_sys::Win32::System::StationsAndDesktops::{
                OpenWindowStationW, SetProcessWindowStation, OpenDesktopW, SetThreadDesktop,
            };
            const WINSTA_ALL_ACCESS: u32 = 0x037F;
            const DESKTOP_ALL_ACCESS: u32 = 0x01FF;
            let winsta_name: Vec<u16> = "WinSta0\0".encode_utf16().collect();
            let hwinsta = OpenWindowStationW(winsta_name.as_ptr(), 0, WINSTA_ALL_ACCESS);
            if !hwinsta.is_null() {
                let ok_winsta = SetProcessWindowStation(hwinsta);
                log_msg(&format!("[STARTUP] SetProcessWindowStation to WinSta0: {}", ok_winsta != 0));
            }
            let default_name: Vec<u16> = "Default\0".encode_utf16().collect();
            let hdesk = OpenDesktopW(default_name.as_ptr(), 0, 0, DESKTOP_ALL_ACCESS);
            if !hdesk.is_null() {
                let ok = SetThreadDesktop(hdesk);
                log_msg(&format!("[STARTUP] SetThreadDesktop to Default: {}", ok != 0));
            }
        }

        // 1. Set explicit Application User Model ID (AUMID) so Windows groups all windows,
        // notifications, taskbar entries, and inherited WebView2 instances under a single canonical AetherFlow identity.
        unsafe {
            #[link(name = "shell32")]
            extern "system" {
                fn SetCurrentProcessExplicitAppUserModelID(AppID: *const u16) -> i32;
            }
            let aumid: Vec<u16> = "com.aetherflow.app\0".encode_utf16().collect();
            let hr = SetCurrentProcessExplicitAppUserModelID(aumid.as_ptr());
            log_msg(&format!("[APP IDENTITY] SetCurrentProcessExplicitAppUserModelID('com.aetherflow.app') -> 0x{:08X}", hr));
            println!("[APP IDENTITY] SetCurrentProcessExplicitAppUserModelID('com.aetherflow.app') -> 0x{:08X}", hr);
        }

        // 2. Link all child processes (WebView2, MPV) into a Windows Job Object so they form a single managed unit
        unsafe {
            use windows_sys::Win32::System::JobObjects::{
                CreateJobObjectW, SetInformationJobObject, AssignProcessToJobObject,
                JobObjectExtendedLimitInformation, JOBOBJECT_EXTENDED_LIMIT_INFORMATION,
                JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE,
            };
            use windows_sys::Win32::System::Threading::GetCurrentProcess;

            let job = CreateJobObjectW(std::ptr::null(), std::ptr::null());
            if !job.is_null() {
                let mut info: JOBOBJECT_EXTENDED_LIMIT_INFORMATION = std::mem::zeroed();
                // 0x00001000 = JOB_OBJECT_LIMIT_SILENT_BREAKAWAY_OK, required for Chromium/WebView2 sandboxes
                info.BasicLimitInformation.LimitFlags = JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE | 0x00001000;
                SetInformationJobObject(
                    job,
                    JobObjectExtendedLimitInformation,
                    &info as *const _ as *const std::ffi::c_void,
                    std::mem::size_of::<JOBOBJECT_EXTENDED_LIMIT_INFORMATION>() as u32,
                );
                AssignProcessToJobObject(job, GetCurrentProcess());
            }
        }

        // Disable non-essential background Chromium telemetry/sync services
        // DO NOT use --process-per-site or --renderer-process-limit which share renderers between main UI and wallpapers!
        // DO NOT choke the V8 heap with --max-old-space-size=64!
        std::env::set_var(
            "WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS",
            "--autoplay-policy=no-user-gesture-required \
             --disable-features=MediaFoundationVideoCapture,MediaFoundationD3D11VideoCapture,Translate,OptimizationHints,MediaRouter,HardwareMediaKeyHandling,MediaSessionService,GlobalMediaControls,WebAppSystemMediaControls \
             --disable-video-capture \
             --enable-features=TrimOnMemoryPressure \
             --disk-cache-size=16777216 \
             --media-cache-size=16777216 \
             --disable-gpu-memory-buffer-video-frames \
             --disable-background-networking \
             --disable-component-update \
             --disable-domain-reliability \
             --disable-sync \
             --disable-extensions"
        );
    }

    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_http::init())
        .plugin(tauri_plugin_notification::init())
        .plugin(tauri_plugin_autostart::init(
            tauri_plugin_autostart::MacosLauncher::LaunchAgent,
            Some(vec!["--minimized"]),
        ))
        .plugin(
            tauri_plugin_global_shortcut::Builder::new()
                .with_handler(|app, shortcut, event| {
                    if event.state() == tauri_plugin_global_shortcut::ShortcutState::Pressed {
                        hotkeys::handle_hotkey_press(app, shortcut);
                    }
                })
                .build(),
        )
        .plugin(tauri_plugin_single_instance::init(|app, argv, _cwd| {
            let is_background_action = argv.iter().any(|arg| {
                arg == "--next"
                    || arg == "--prev"
                    || arg == "--toggle-pause"
                    || arg == "--toggle-mute"
                    || arg == "--toggle-icons"
                    || arg == "--sync-on"
                    || arg == "--sync-off"
                    || arg == "--audio-target"
                    || arg == "--screensaver"
                    || arg == "--diagnostics"
                    || arg == "--apply-video"
                    || arg == "--apply-file"
            });

            if !is_background_action || argv.iter().any(|arg| arg == "--open") {
                log_msg("[SINGLE INSTANCE] Second instance signal received, restoring main window");
                if let Some(win) = app.get_webview_window("main") {
                    let _ = win.unminimize();
                    let _ = win.show();
                    let _ = win.set_focus();
                }
                #[cfg(windows)]
                if let Some(main_h) = get_main_hwnd() {
                    unsafe {
                        ShowWindow(main_h, 9); // SW_RESTORE
                        SetForegroundWindow(main_h);
                    }
                }
            }

            if argv.iter().any(|arg| arg == "--next") {
                log_msg("[CLI IPC] Action: --next");
                let _ = app.emit("aether:shortcut:next", ());
            } else if argv.iter().any(|arg| arg == "--prev") {
                log_msg("[CLI IPC] Action: --prev");
                let _ = app.emit("aether:shortcut:prev", ());
            } else if argv.iter().any(|arg| arg == "--toggle-pause") {
                log_msg("[CLI IPC] Action: --toggle-pause");
                toggle_wallpaper_pause(app.clone());
            } else if argv.iter().any(|arg| arg == "--toggle-mute") {
                log_msg("[CLI IPC] Action: --toggle-mute");
                toggle_wallpaper_mute(app.clone());
            } else if argv.iter().any(|arg| arg == "--toggle-icons") {
                log_msg("[CLI IPC] Action: --toggle-icons");
                let _ = toggle_desktop_icons(app.clone());
            } else if argv.iter().any(|arg| arg == "--screensaver") {
                log_msg("[CLI IPC] Action: --screensaver");
                let _ = trigger_screensaver(app.clone(), Some(true));
            } else if let Some(pos) = argv.iter().position(|arg| arg == "--apply-file") {
                if let Some(path) = argv.get(pos + 1) {
                    log_msg(&format!("[CLI IPC] Action: --apply-file for: {}", path));
                    let _ = app.emit("aether:cli:apply-file", serde_json::json!({ "filePath": path }));
                }
            } else if argv.iter().any(|arg| arg == "--sync-on") {
                if let Ok(mut guard) = PERFORMANCE_SETTINGS.lock() {
                    guard.wallpaper_sync_on_resume = true;
                    log_msg("[CLI IPC] Enabled wallpaper_sync_on_resume via --sync-on");
                }
            } else if argv.iter().any(|arg| arg == "--sync-off") {
                if let Ok(mut guard) = PERFORMANCE_SETTINGS.lock() {
                    guard.wallpaper_sync_on_resume = false;
                    log_msg("[CLI IPC] Disabled wallpaper_sync_on_resume via --sync-off");
                }
            } else if let Some(pos) = argv.iter().position(|arg| arg == "--audio-target") {
                if let Some(target) = argv.get(pos + 1) {
                    let clean_target = if target == "auto" || target.is_empty() { None } else { Some(target.clone()) };
                    if let Ok(mut guard) = PERFORMANCE_SETTINGS.lock() {
                        guard.preferred_audio_monitor = clean_target.clone();
                    }
                    let msg = format!("[CLI IPC] Audio target set to: {:?}", clean_target);
                    log_msg(&msg);
                    println!("{}", msg);
                    reassign_live_audio_output(&app);
                }
            }

            if let Some(pos) = argv.iter().position(|arg| arg == "--apply-video") {
                if let Some(path) = argv.get(pos + 1) {
                    let target_mon = argv.get(pos + 2).cloned().map(|s| {
                        let clean = s.replace("\\\\.\\", "").replace("\\", "").replace(".", "_");
                        if clean == "*" || clean == "wallpaper_*" {
                            "*".to_string()
                        } else if !clean.starts_with("wallpaper_") {
                            format!("wallpaper_{}", clean)
                        } else {
                            clean
                        }
                    });
                    let msg = format!("[CLI IPC] Received --apply-video with path: {} target: {:?}", path, target_mon);
                    log_msg(&msg);
                    println!("{}", msg);
                    let app_h = app.clone();
                    let path_clone = path.clone();
                    tauri::async_runtime::spawn(async move {
                        apply_wallpaper(
                            app_h,
                            "video-player".to_string(),
                            serde_json::json!({
                                "videoPath": path_clone,
                                "speedMultiplier": 1.0,
                                "volume": 0.0,
                                "muted": true,
                            }),
                            1.0,
                            0.85,
                            target_mon,
                        ).await;
                    });
                }
            } else if let Some(pos) = argv.iter().position(|arg| arg == "--apply-engine") {
                if let Some(engine) = argv.get(pos + 1) {
                    let msg = format!("[CLI IPC] Received --apply-engine with: {}", engine);
                    log_msg(&msg);
                    println!("{}", msg);
                    let app_h = app.clone();
                    let engine_clone = engine.clone();
                    tauri::async_runtime::spawn(async move {
                        apply_wallpaper(
                            app_h,
                            engine_clone,
                            serde_json::json!({}),
                            1.0,
                            0.85,
                            None,
                        ).await;
                    });
                }
            } else if let Some(pos) = argv.iter().position(|arg| arg == "--apply-youtube") {
                if let Some(url) = argv.get(pos + 1) {
                    let msg = format!("[CLI IPC] Received --apply-youtube with: {}", url);
                    log_msg(&msg);
                    println!("{}", msg);
                    let app_h = app.clone();
                    let url_clone = url.clone();
                    tauri::async_runtime::spawn(async move {
                        apply_wallpaper(
                            app_h,
                            "web-stream".to_string(),
                            serde_json::json!({
                                "streamUrl": url_clone,
                                "youtubeBackend": "mpv",
                                "speedMultiplier": 1.0,
                                "volume": 0.0,
                                "muted": true,
                            }),
                            1.0,
                            0.85,
                            None,
                        ).await;
                    });
                }
            } else if argv.iter().any(|arg| arg == "--stop-wallpaper") {
                log_msg("[CLI IPC] Received --stop-wallpaper");
                println!("[CLI IPC] Received --stop-wallpaper");
                stop_wallpaper(app.clone(), None);
            } else if argv.iter().any(|arg| arg == "--diagnostics") {
                let diag = get_diagnostics(app.clone());
                let diag_str = serde_json::to_string_pretty(&diag).unwrap_or_default();
                log_msg(&format!("[CLI IPC] Diagnostics:\n{}", diag_str));
                println!("[CLI IPC] Diagnostics:\n{}", diag_str);
            }
        }))
        .invoke_handler(tauri::generate_handler![
            apply_wallpaper,
            stop_wallpaper,
            update_wallpaper_config,
            set_wallpaper_brightness,
            set_wallpaper_opacity,
            toggle_control_panel,
            set_wallpaper_mode,
            get_system_info,
            read_local_file,
            get_monitors,
            get_monitor_active_wallpaper,
            trim_memory,
            set_mpv_pause,
            set_mpv_volume,
            set_mpv_mute,
            sync_performance_settings,
            set_autostart,
            is_autostart_enabled,
            is_minimized_boot,
            frontend_heartbeat,
            report_frontend_error,
            get_diagnostics,
            save_custom_wallpapers,
            delete_custom_wallpaper,
            load_custom_wallpapers,
            set_system_wallpaper,
            set_taskbar_style,
            get_taskbar_style,
            restart_taskbar_explorer,
            open_url,
            start_oauth_listener,
            open_oauth_window,
            get_detailed_memory_usage,
            import_wallpaper_media,
            get_wallpaper_directory,
            open_wallpaper_directory,
            sync_screensaver_settings,
            get_screensaver_settings,
            trigger_screensaver,
            dismiss_screensaver,
            get_screensaver_active_wallpaper,
            get_grid_detection_state,
            get_or_create_video_thumbnail,
            sync_all_custom_video_thumbnails,
            get_file_metadata,
            batch_import_media_files,
            scan_directory_media,
            get_library_storage_stats,
            set_watch_folder,
            get_watch_folder_settings,
            scan_watch_folder,
            sync_playlist_timers,
            toggle_wallpaper_pause,
            toggle_wallpaper_mute,
            set_desktop_icons_visible,
            toggle_desktop_icons,
            set_desktop_context_menu,
            get_desktop_context_menu_status,
            set_file_context_menu,
            get_file_context_menu_status,
            update_registered_hotkeys,
            upload_release_asset,
            delete_release_asset,
            cache_community_wallpaper,
            remove_local_community_wallpaper,
        ])
        .setup(|app| {
            #[cfg(windows)]
            {
                let shell = find_shelldll_defview();
                if !shell.is_null() {
                    unsafe {
                        ShowWindow(shell, 5); // SW_SHOW: Ensure SHELLDLL_DefView is always visible for desktop clicks
                    }
                }
                mpv::kill_all_mpv_processes();
                let _ = mpv::ensure_mpv_job();
                let _ = sync_all_custom_video_thumbnails(app.handle().clone());
                if let Ok(exe_path) = std::env::current_exe() {
                    let exe_str = exe_path.to_string_lossy().to_string();
                    let _ = context_menu::register_desktop_context_menu(&exe_str);
                    let _ = context_menu::register_file_context_menu(&exe_str);
                }
            }

            let is_minimized = is_minimized_boot();
            let start_log = format!("AetherFlow: Creating main window (minimized/autostart={})...", is_minimized);
            log_msg(&start_log);
            println!("{}", start_log);
            let win = tauri::WebviewWindowBuilder::new(
                app,
                "main",
                tauri::WebviewUrl::App("index.html".into())
            )
            .title("AetherFlow")
            .inner_size(1200.0, 780.0)
            .min_inner_size(900.0, 600.0)
            .center()
            .devtools(true)
            .visible(!is_minimized)
            .focused(!is_minimized)
            .build();
            
            match win {
                Ok(w) => {
                    log_msg("AetherFlow: Main window created successfully.");
                    println!("AetherFlow: Main window created successfully.");
                    
                    #[cfg(windows)]
                    if let Ok(raw_h) = w.hwnd() {
                        let raw_hwnd = raw_h.0 as HWND;
                        set_main_hwnd(raw_hwnd);
                        unsafe {
                            let parent = GetParent(raw_hwnd);
                            let msg = format!("[DIAG 1 & 4] Initial Main AetherFlow HWND: 0x{:X}, parent: 0x{:X}", raw_hwnd as usize, parent as usize);
                            log_msg(&msg);
                            println!("{}", msg);
                        }
                    }
                    
                    let w_clone = w.clone();
                    w.on_window_event(move |event| {
                        match event {
                            tauri::WindowEvent::CloseRequested { api, .. } => {
                                log_msg("[MAIN WIN EVENT] CloseRequested -> hiding window to tray");
                                let _ = dismiss_screensaver(w_clone.app_handle().clone());
                                let _ = w_clone.hide();
                                api.prevent_close();

                                // Trim process memory working set of host and all child WebView2 processes
                                #[cfg(windows)]
                                trim_all_process_memory();
                            }
                            tauri::WindowEvent::Moved(pos) => {
                                log_msg(&format!("[MAIN WIN EVENT] Moved to ({}, {})", pos.x, pos.y));
                            }
                            tauri::WindowEvent::Resized(size) => {
                                log_msg(&format!("[MAIN WIN EVENT] Resized to {}x{}", size.width, size.height));
                            }
                            tauri::WindowEvent::Focused(focused) => {
                                log_msg(&format!("[MAIN WIN EVENT] Focused: {}", focused));
                            }
                            _ => {}
                        }
                    });

                    if !is_minimized {
                        let _ = w.unminimize();
                        let _ = w.show();
                        let _ = w.set_focus();
                    }
                }
                Err(e) => {
                    let err = format!("AetherFlow: ERROR creating main window - {}", e);
                    log_msg(&err);
                    eprintln!("{}", err);
                }
            }

            // Start the system state monitor thread (battery & fullscreen pausing)
            start_system_state_monitor(app.handle().clone());

            // Ensure canonical Windows Start Menu shortcut with AUMID is registered
            #[cfg(windows)]
            ensure_canonical_start_menu_shortcut();

            // One-time post-startup memory compaction: evicts transient cold startup initialization pages
            // once host and WebView2 have settled. No periodic loop is run to eliminate working set thrashing.
            std::thread::spawn(|| {
                std::thread::sleep(std::time::Duration::from_millis(3000));
                #[cfg(windows)]
                trim_all_process_memory();
            });

            // Pre-create and pin the wallpaper windows directly on the main thread
            ensure_wallpaper_windows(app.handle());

            // Check if --apply-video was supplied on initial cold launch
            let args: Vec<String> = std::env::args().collect();
            if let Some(pos) = args.iter().position(|arg| arg == "--apply-video") {
                if let Some(path) = args.get(pos + 1) {
                    let target_mon = args.get(pos + 2).cloned().map(|s| {
                        let clean = s.replace("\\\\.\\", "").replace("\\", "").replace(".", "_");
                        if clean == "*" || clean == "wallpaper_*" {
                            "*".to_string()
                        } else if !clean.starts_with("wallpaper_") {
                            format!("wallpaper_{}", clean)
                        } else {
                            clean
                        }
                    });
                    let app_h = app.handle().clone();
                    let path_clone = path.clone();
                    tauri::async_runtime::spawn(async move {
                        std::thread::sleep(std::time::Duration::from_millis(1200));
                        let msg = format!("[COLD LAUNCH CLI] Applying video wallpaper from CLI: {} target: {:?}", path_clone, target_mon);
                        log_msg(&msg);
                        println!("{}", msg);
                        apply_wallpaper(
                            app_h,
                            "video-player".to_string(),
                            serde_json::json!({
                                "videoPath": path_clone,
                                "speedMultiplier": 1.0,
                                "volume": 0.0,
                                "muted": true,
                            }),
                            1.0,
                            0.85,
                            target_mon,
                        ).await;
                    });
                }
            }

            // ── Background Display Change & Hot-Plug Watcher with Debouncing ───
            let app_handle = app.handle().clone();
            std::thread::spawn(move || {
                // Wait for initial startup to settle
                std::thread::sleep(std::time::Duration::from_millis(1500));

                let mut last_stable_monitors = get_monitors_snapshot(&app_handle);

                loop {
                    std::thread::sleep(std::time::Duration::from_millis(400));

                    let current_sample = get_monitors_snapshot(&app_handle);

                    if current_sample != last_stable_monitors {
                        // Display topology change in progress! Coalesce/debounce until stable.
                        let mut stable_candidate = current_sample;
                        loop {
                            std::thread::sleep(std::time::Duration::from_millis(300));
                            let next_sample = get_monitors_snapshot(&app_handle);
                            if next_sample == stable_candidate {
                                break;
                            }
                            stable_candidate = next_sample;
                        }

                        let change_log = format!(
                            "\n[DISPLAY CHANGE]\nmonitor count before: {}\nmonitor count after: {}",
                            last_stable_monitors.len(), stable_candidate.len()
                        );
                        log_msg(&change_log);
                        println!("{}", change_log);

                        // Run the controlled reconciliation on the stabilized configuration
                        reconcile_wallpaper_windows(&app_handle);

                        let monitors_payload = serde_json::json!({
                            "count": stable_candidate.len(),
                            "monitors": stable_candidate.iter().map(|m| m.name.clone()).collect::<Vec<_>>(),
                        });
                        let _ = app_handle.emit("aether:monitors-changed", monitors_payload.clone());
                        let _ = app_handle.emit("aura:monitors-changed", monitors_payload);

                        last_stable_monitors = stable_candidate;
                    }
                }
            });

            // ── System tray ───────────────────────────────────────────────────
            let open_item        = MenuItem::with_id(app, "open",         "Open AetherFlow",        true, None::<&str>)?;
            let sep1             = tauri::menu::PredefinedMenuItem::separator(app)?;

            let next_item        = MenuItem::with_id(app, "next",         "Next Wallpaper",         true, None::<&str>)?;
            let prev_item        = MenuItem::with_id(app, "prev",         "Previous Wallpaper",     true, None::<&str>)?;
            let pause_item       = MenuItem::with_id(app, "toggle_pause", "Pause / Resume",         true, None::<&str>)?;
            let mute_item        = MenuItem::with_id(app, "toggle_mute",  "Mute / Unmute Audio",    true, None::<&str>)?;
            let stop_item        = MenuItem::with_id(app, "stop",         "Stop Wallpaper",         true, None::<&str>)?;
            let sep2             = tauri::menu::PredefinedMenuItem::separator(app)?;

            // Quick Adjustment Submenus (Volume, Brightness, Playback Speed, Opacity)
            let v100 = MenuItem::with_id(app, "vol_100", "100%", true, None::<&str>)?;
            let v80  = MenuItem::with_id(app, "vol_80",  "80%",  true, None::<&str>)?;
            let v60  = MenuItem::with_id(app, "vol_60",  "60%",  true, None::<&str>)?;
            let v40  = MenuItem::with_id(app, "vol_40",  "40%",  true, None::<&str>)?;
            let v20  = MenuItem::with_id(app, "vol_20",  "20%",  true, None::<&str>)?;
            let v0   = MenuItem::with_id(app, "vol_0",   "Mute (0%)", true, None::<&str>)?;
            let volume_sub = tauri::menu::Submenu::with_items(app, "Volume", true, &[
                &v100, &v80, &v60, &v40, &v20, &v0
            ])?;

            let br100 = MenuItem::with_id(app, "br_100", "100% (Default)", true, None::<&str>)?;
            let br85  = MenuItem::with_id(app, "br_85",  "85%",           true, None::<&str>)?;
            let br70  = MenuItem::with_id(app, "br_70",  "70%",           true, None::<&str>)?;
            let br50  = MenuItem::with_id(app, "br_50",  "50%",           true, None::<&str>)?;
            let br30  = MenuItem::with_id(app, "br_30",  "30% (Dim)",     true, None::<&str>)?;
            let brightness_sub = tauri::menu::Submenu::with_items(app, "Brightness", true, &[
                &br100, &br85, &br70, &br50, &br30
            ])?;

            let spd200 = MenuItem::with_id(app, "spd_200", "2.0x (Hyper)", true, None::<&str>)?;
            let spd150 = MenuItem::with_id(app, "spd_150", "1.5x (Fast)",  true, None::<&str>)?;
            let spd125 = MenuItem::with_id(app, "spd_125", "1.25x",        true, None::<&str>)?;
            let spd100 = MenuItem::with_id(app, "spd_100", "1.0x (Normal)",true, None::<&str>)?;
            let spd75  = MenuItem::with_id(app, "spd_75",  "0.75x",        true, None::<&str>)?;
            let spd50  = MenuItem::with_id(app, "spd_50",  "0.5x (Slow)",  true, None::<&str>)?;
            let speed_sub = tauri::menu::Submenu::with_items(app, "Playback Speed", true, &[
                &spd200, &spd150, &spd125, &spd100, &spd75, &spd50
            ])?;

            let op100 = MenuItem::with_id(app, "op_100", "100% (Solid)",       true, None::<&str>)?;
            let op85  = MenuItem::with_id(app, "op_85",  "85%",                true, None::<&str>)?;
            let op70  = MenuItem::with_id(app, "op_70",  "70%",                true, None::<&str>)?;
            let op50  = MenuItem::with_id(app, "op_50",  "50% (Translucent)",  true, None::<&str>)?;
            let op30  = MenuItem::with_id(app, "op_30",  "30% (Ghost)",        true, None::<&str>)?;
            let opacity_sub = tauri::menu::Submenu::with_items(app, "Opacity", true, &[
                &op100, &op85, &op70, &op50, &op30
            ])?;
            let sep_controls = tauri::menu::PredefinedMenuItem::separator(app)?;

            let icons_item       = MenuItem::with_id(app, "toggle_icons", "Toggle Desktop Icons",   true, None::<&str>)?;
            let tb_translucent   = MenuItem::with_id(app, "tb_translucent", "Translucent",          true, None::<&str>)?;
            let tb_blur          = MenuItem::with_id(app, "tb_blur",        "Blur",                 true, None::<&str>)?;
            let tb_acrylic       = MenuItem::with_id(app, "tb_acrylic",     "Acrylic",              true, None::<&str>)?;
            let tb_clear         = MenuItem::with_id(app, "tb_clear",       "Clear (Transparent)",  true, None::<&str>)?;
            let tb_default       = MenuItem::with_id(app, "tb_default",     "Default Windows",      true, None::<&str>)?;
            let taskbar_sub      = tauri::menu::Submenu::with_items(app, "Taskbar Style", true, &[
                &tb_translucent, &tb_blur, &tb_acrylic, &tb_clear, &tb_default
            ])?;

            let screensaver_item = MenuItem::with_id(app, "screensaver",  "Preview Screensaver",    true, None::<&str>)?;
            let sep3             = tauri::menu::PredefinedMenuItem::separator(app)?;
            let quit_item        = MenuItem::with_id(app, "quit",         "Quit AetherFlow",        true, None::<&str>)?;

            let menu = Menu::with_items(app, &[
                &open_item,
                &sep1,
                &next_item,
                &prev_item,
                &pause_item,
                &mute_item,
                &stop_item,
                &sep2,
                &volume_sub,
                &brightness_sub,
                &speed_sub,
                &opacity_sub,
                &sep_controls,
                &icons_item,
                &taskbar_sub,
                &screensaver_item,
                &sep3,
                &quit_item,
            ])?;

            let tray_built = TrayIconBuilder::new()
                .icon(app.default_window_icon().unwrap().clone())
                .menu(&menu)
                .tooltip("AetherFlow — Live Wallpaper Engine")
                .on_menu_event(move |app, event| {
                    match event.id().as_ref() {
                        "open" => {
                            if let Some(win) = app.get_webview_window("main") {
                                let _ = win.unminimize();
                                let _ = win.show();
                                let _ = win.set_focus();
                            }
                            #[cfg(windows)]
                            if let Some(main_h) = get_main_hwnd() {
                                unsafe {
                                    ShowWindow(main_h, 9);
                                    SetForegroundWindow(main_h);
                                }
                            }
                        }
                        "next" => {
                            let _ = app.emit("aether:shortcut:next", ());
                        }
                        "prev" => {
                            let _ = app.emit("aether:shortcut:prev", ());
                        }
                        "toggle_pause" => {
                            toggle_wallpaper_pause(app.clone());
                        }
                        "toggle_mute" => {
                            toggle_wallpaper_mute(app.clone());
                        }
                        "vol_100" | "vol_80" | "vol_60" | "vol_40" | "vol_20" | "vol_0" => {
                            let (vol, muted) = match event.id().as_ref() {
                                "vol_100" => (100.0, false),
                                "vol_80"  => (80.0, false),
                                "vol_60"  => (60.0, false),
                                "vol_40"  => (40.0, false),
                                "vol_20"  => (20.0, false),
                                "vol_0"   => (0.0, true),
                                _         => (50.0, false),
                            };
                            set_mpv_mute(app.clone(), None, muted);
                            set_mpv_volume(None, vol);
                            update_wallpaper_config(app.clone(), serde_json::json!({ "volume": vol, "muted": muted }), None);
                            let _ = app.emit("aether:tray:set-volume", serde_json::json!({ "volume": vol, "muted": muted }));
                        }
                        "br_100" | "br_85" | "br_70" | "br_50" | "br_30" => {
                            let val = match event.id().as_ref() {
                                "br_100" => 1.0,
                                "br_85"  => 0.85,
                                "br_70"  => 0.70,
                                "br_50"  => 0.50,
                                "br_30"  => 0.30,
                                _        => 1.0,
                            };
                            set_wallpaper_brightness(app.clone(), val);
                            update_wallpaper_config(app.clone(), serde_json::json!({ "brightness": val }), None);
                            let _ = app.emit("aether:tray:set-brightness", serde_json::json!({ "brightness": val }));
                        }
                        "spd_200" | "spd_150" | "spd_125" | "spd_100" | "spd_75" | "spd_50" => {
                            let val = match event.id().as_ref() {
                                "spd_200" => 2.0,
                                "spd_150" => 1.5,
                                "spd_125" => 1.25,
                                "spd_100" => 1.0,
                                "spd_75"  => 0.75,
                                "spd_50"  => 0.5,
                                _         => 1.0,
                            };
                            update_wallpaper_config(app.clone(), serde_json::json!({ "speedMultiplier": val, "speed": val }), None);
                            let _ = app.emit("aether:tray:set-speed", serde_json::json!({ "speed": val }));
                        }
                        "op_100" | "op_85" | "op_70" | "op_50" | "op_30" => {
                            let val = match event.id().as_ref() {
                                "op_100" => 1.0,
                                "op_85"  => 0.85,
                                "op_70"  => 0.70,
                                "op_50"  => 0.50,
                                "op_30"  => 0.30,
                                _        => 1.0,
                            };
                            set_wallpaper_opacity(app.clone(), val);
                            update_wallpaper_config(app.clone(), serde_json::json!({ "opacity": val }), None);
                            let _ = app.emit("aether:tray:set-opacity", serde_json::json!({ "opacity": val }));
                        }
                        "toggle_icons" => {
                            let _ = toggle_desktop_icons(app.clone());
                        }
                        "tb_translucent" => {
                            let _ = taskbar::apply_taskbar_style("translucent", false);
                        }
                        "tb_blur" => {
                            let _ = taskbar::apply_taskbar_style("blur", false);
                        }
                        "tb_acrylic" => {
                            let _ = taskbar::apply_taskbar_style("acrylic", false);
                        }
                        "tb_clear" => {
                            let _ = taskbar::apply_taskbar_style("clear", false);
                        }
                        "tb_default" => {
                            let _ = taskbar::apply_taskbar_style("default", false);
                        }
                        "screensaver" => {
                            let _ = trigger_screensaver(app.clone(), Some(true));
                        }
                        "stop" => {
                            stop_wallpaper(app.clone(), None);
                        }
                        "quit" => {
                            log_msg("[AetherFlow] Shutdown requested via system tray Quit menu");
                            println!("[AetherFlow] Shutdown requested via system tray Quit menu");

                            // 1. Restore taskbar state cleanly
                            taskbar::restore_taskbar();

                            // 2. Terminate all MPV players and video engines
                            if let Ok(mut mpv_guard) = MPV_PLAYERS.lock() {
                                if let Some(ref mut map) = *mpv_guard {
                                    for (_, mut proc) in map.drain() {
                                        proc.terminate();
                                    }
                                }
                            }
                            mpv::kill_all_mpv_processes();

                            // 3. Destroy all webview windows
                            let windows = app.webview_windows();
                            for (label, win) in windows {
                                log_msg(&format!("[AetherFlow] Destroying window on quit: {}", label));
                                let _ = win.destroy();
                            }

                            #[cfg(windows)]
                            unsafe {
                                SystemParametersInfoW(SPI_SETDESKWALLPAPER, 0, std::ptr::null_mut(), SPIF_UPDATEINIFILE | SPIF_SENDCHANGE);
                            }

                            // 4. Drop tray icon to clear it from system notification area immediately
                            if let Ok(mut tray_guard) = TRAY_HOLDER.lock() {
                                if let Some(tray) = tray_guard.take() {
                                    drop(tray);
                                }
                            }

                            // 5. Terminate all child and descendant processes (WebView2, renderers, GPU, etc.)
                            #[cfg(windows)]
                            kill_all_descendant_processes();

                            std::process::exit(0);
                        }
                        _ => {}
                    }
                })
                .on_tray_icon_event(|tray, event| {
                    // Single-click or Double-click tray icon → restore and focus control panel
                    match event {
                        TrayIconEvent::Click { button: MouseButton::Left, .. }
                        | TrayIconEvent::DoubleClick { button: MouseButton::Left, .. } => {
                            let app = tray.app_handle();
                            if let Some(win) = app.get_webview_window("main") {
                                let _ = win.unminimize();
                                let _ = win.show();
                                let _ = win.set_focus();
                            }
                            #[cfg(windows)]
                            if let Some(main_h) = get_main_hwnd() {
                                unsafe {
                                    ShowWindow(main_h, 9);
                                    SetForegroundWindow(main_h);
                                }
                            }
                        }
                        _ => {}
                    }
                })
                .build(app)?;

            if let Ok(mut guard) = TRAY_HOLDER.lock() {
                *guard = Some(tray_built);
            }

            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running AetherFlow")
}
