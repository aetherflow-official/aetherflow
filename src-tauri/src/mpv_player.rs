// src-tauri/src/mpv_player.rs
// In-process libmpv player controller for AetherFlow
// Runs video decoding and rendering directly on internal worker threads inside AetherFlow.exe.

use std::collections::HashMap;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex};
use std::time::{Duration, Instant};

use crate::mpv_ffi::{
    find_libmpv_dll, LibMpv, MpvHandle, MPV_EVENT_SHUTDOWN,
};

#[cfg(windows)]
use windows_sys::Win32::Foundation::{HWND, LPARAM};
#[cfg(windows)]
use windows_sys::Win32::UI::WindowsAndMessaging::{
    EnumWindows, GetClassNameW, GetWindowThreadProcessId,
};

static LIBMPV_INSTANCE: Mutex<Option<Arc<LibMpv>>> = Mutex::new(None);

pub fn get_or_load_libmpv() -> Result<Arc<LibMpv>, String> {
    let mut guard = LIBMPV_INSTANCE.lock().map_err(|e| e.to_string())?;
    if let Some(instance) = guard.as_ref() {
        return Ok(instance.clone());
    }

    let dll_path = find_libmpv_dll()?;
    let lib = LibMpv::load(&dll_path)?;
    *guard = Some(lib.clone());
    Ok(lib)
}

pub struct InProcessMpv {
    pub lib: Arc<LibMpv>,
    pub handle: MpvHandle,
    pub hwnd: usize,
    pub monitor_label: String,
    pub video_path: Mutex<String>,
    pub is_destroyed: Arc<AtomicBool>,
}

unsafe impl Send for InProcessMpv {}
unsafe impl Sync for InProcessMpv {}

impl InProcessMpv {
    pub fn new(
        video_path: &str,
        monitor_label: &str,
        mon_x: i32,
        mon_y: i32,
        mon_w: i32,
        mon_h: i32,
        volume: Option<f64>,
        muted: Option<bool>,
        speed: Option<f64>,
        brightness: Option<f64>,
        paused: Option<bool>,
        existing_hwnds: &[usize],
    ) -> Result<Arc<Self>, String> {
        let lib = get_or_load_libmpv()?;
        let handle = lib.create()?;

        // Configure borderless window and playback properties before initialization
        let _ = lib.set_option(handle, "no-config", "yes");
        let _ = lib.set_option(handle, "window-minimized", "yes");
        let _ = lib.set_option(handle, "force-window", "immediate");
        let _ = lib.set_option(handle, "show-in-taskbar", "no");
        let _ = lib.set_option(handle, "taskbar-progress", "no");
        let _ = lib.set_option(handle, "title-bar", "no");
        let _ = lib.set_option(handle, "title", "AetherFlow Video Engine");
        let _ = lib.set_option(handle, "force-media-title", "AetherFlow Video Engine");
        let _ = lib.set_option(handle, "border", "no");
        let _ = lib.set_option(handle, "window-corners", "donotround");
        let _ = lib.set_option(handle, "no-osc", "yes");
        let _ = lib.set_option(handle, "no-osd-bar", "yes");
        let _ = lib.set_option(handle, "osd-level", "0");
        let _ = lib.set_option(handle, "loop-file", "inf");
        let _ = lib.set_option(handle, "keep-open", "yes");
        let _ = lib.set_option(handle, "media-controls", "no");
        let _ = lib.set_option(handle, "cursor-autohide", "no");
        let _ = lib.set_option(handle, "input-default-bindings", "no");
        let _ = lib.set_option(handle, "input-cursor", "no");
        let _ = lib.set_option(handle, "hwdec", "auto-safe");
        let _ = lib.set_option(handle, "panscan", "1.0");
        let _ = lib.set_option(handle, "keepaspect-window", "no");
        let _ = lib.set_option(handle, "auto-window-resize", "no");
        let _ = lib.set_option(handle, "geometry", &format!("{}x{}{:+}{:+}", mon_w, mon_h, mon_x, mon_y));
        let _ = lib.set_option(handle, "background-color", "#000000");

        let is_network = crate::mpv::is_network_url(video_path);
        let is_yt = crate::mpv::is_youtube_url(video_path);

        if is_yt {
            if let Ok(ytdl_path) = crate::mpv::find_ytdl_binary() {
                let path_str = ytdl_path.to_string_lossy().replace('\\', "/");
                let _ = lib.set_option(handle, "script-opts", &format!("osc-visibility=never,ytdl_hook-ytdl_path={}", path_str));
            }
            let _ = lib.set_option(handle, "ytdl", "yes");
            let _ = lib.set_option(handle, "ytdl-raw-options", "js-runtimes=\"node\",remote-components=\"ejs:github\",cookies-from-browser=firefox");
            let _ = lib.set_option(handle, "ytdl-format", "bestvideo[height<=1080]+bestaudio/best");
            let _ = lib.set_option(handle, "cache", "yes");
            let _ = lib.set_option(handle, "demuxer-max-bytes", "64M");
            let _ = lib.set_option(handle, "demuxer-max-back-bytes", "16M");
        } else if is_network {
            let _ = lib.set_option(handle, "cache", "yes");
            let _ = lib.set_option(handle, "demuxer-max-bytes", "64M");
            let _ = lib.set_option(handle, "demuxer-max-back-bytes", "16M");
        } else {
            let _ = lib.set_option(handle, "cache", "no");
            let _ = lib.set_option(handle, "demuxer-max-bytes", "16M");
            let _ = lib.set_option(handle, "demuxer-max-back-bytes", "4M");
        }

        if let Some(spd) = speed {
            let spd_clamped = spd.max(0.1).min(10.0);
            let _ = lib.set_option(handle, "speed", &format!("{}", spd_clamped));
        }

        if let Some(br) = brightness {
            let mpv_br = ((br - 1.0) * 100.0).round().max(-100.0).min(100.0);
            let _ = lib.set_option(handle, "brightness", &format!("{}", mpv_br));
        }

        if paused.unwrap_or(false) {
            let _ = lib.set_option(handle, "pause", "yes");
        } else {
            let _ = lib.set_option(handle, "pause", "no");
        }

        if muted.unwrap_or(false) || paused.unwrap_or(false) {
            let _ = lib.set_option(handle, "mute", "yes");
        } else {
            let _ = lib.set_option(handle, "mute", "no");
        }

        if let Some(vol) = volume {
            let vol_clamped = vol.max(0.0).min(100.0);
            let _ = lib.set_option(handle, "volume", &format!("{}", vol_clamped));
        }

        // Initialize the player core
        lib.initialize(handle)?;

        // Locate the HWND created by libmpv within our process
        #[cfg(windows)]
        let hwnd = find_inprocess_mpv_hwnd(existing_hwnds).unwrap_or(0);
        #[cfg(not(windows))]
        let hwnd = 0usize;

        // Load the target video file or stream
        lib.command(handle, &["loadfile", video_path, "replace"])?;

        let is_destroyed = Arc::new(AtomicBool::new(false));

        let player = Arc::new(Self {
            lib: lib.clone(),
            handle,
            hwnd,
            monitor_label: monitor_label.to_string(),
            video_path: Mutex::new(video_path.to_string()),
            is_destroyed: is_destroyed.clone(),
        });

        // Spawn background event drain thread to prevent mpv event queue overflow
        let lib_clone = lib.clone();
        let destroyed_clone = is_destroyed.clone();
        let handle_addr = handle as usize;
        std::thread::spawn(move || {
            let handle_ptr = handle_addr as MpvHandle;
            while !destroyed_clone.load(Ordering::Relaxed) {
                if let Some(ev) = lib_clone.wait_event(handle_ptr, 0.25) {
                    if ev.event_id == MPV_EVENT_SHUTDOWN {
                        break;
                    }
                }
            }
        });

        Ok(player)
    }

    pub fn set_speed(&self, speed: f64) -> Result<(), String> {
        let speed_clamped = speed.max(0.1).min(10.0);
        self.lib.set_property(self.handle, "speed", &format!("{}", speed_clamped))
    }

    pub fn set_brightness(&self, brightness: f64) -> Result<(), String> {
        let mpv_br = ((brightness - 1.0) * 100.0).round().max(-100.0).min(100.0);
        self.lib.set_property(self.handle, "brightness", &format!("{}", mpv_br))
    }

    pub fn set_pause(&self, paused: bool) -> Result<(), String> {
        self.lib.set_property(self.handle, "pause", if paused { "yes" } else { "no" })
    }

    pub fn seek(&self, seconds: f64, exact: bool) -> Result<(), String> {
        let mode = if exact { "absolute+exact" } else { "absolute" };
        self.lib.command(self.handle, &["seek", &format!("{}", seconds), mode])
    }

    pub fn set_volume(&self, volume: f64) -> Result<(), String> {
        let vol_clamped = volume.max(0.0).min(100.0);
        self.lib.set_property(self.handle, "volume", &format!("{}", vol_clamped))
    }

    pub fn set_mute(&self, muted: bool) -> Result<(), String> {
        self.lib.set_property(self.handle, "mute", if muted { "yes" } else { "no" })
    }

    pub fn load_file(&self, new_video_path: &str) -> Result<(), String> {
        if let Ok(mut vp) = self.video_path.lock() {
            *vp = new_video_path.to_string();
        }
        self.lib.command(self.handle, &["loadfile", new_video_path, "replace"])
    }

    pub fn set_property(&self, prop: &str, val: &str) -> Result<(), String> {
        self.lib.set_property(self.handle, prop, val)
    }

    pub fn command_string(&self, cmd: &str) -> Result<(), String> {
        self.lib.command_string(self.handle, cmd)
    }

    pub fn command(&self, args: &[&str]) -> Result<(), String> {
        self.lib.command(self.handle, args)
    }

    pub fn get_property(&self, prop: &str) -> Option<String> {
        self.lib.get_property(self.handle, prop)
    }

    pub fn query_property(&self, prop: &str) -> Option<serde_json::Value> {
        let s = self.get_property(prop)?;
        if s == "yes" || s == "true" {
            return Some(serde_json::Value::Bool(true));
        }
        if s == "no" || s == "false" {
            return Some(serde_json::Value::Bool(false));
        }
        if let Ok(num) = s.parse::<f64>() {
            if let Some(n) = serde_json::Number::from_f64(num) {
                return Some(serde_json::Value::Number(n));
            }
        }
        Some(serde_json::Value::String(s))
    }

    pub fn wait_for_playback(&self, max_wait_ms: u64) -> bool {
        let start = Instant::now();
        let timeout = Duration::from_millis(max_wait_ms);
        while start.elapsed() < timeout {
            if self.is_destroyed.load(Ordering::Relaxed) {
                return false;
            }

            if let Some(val) = self.query_property("playback-time") {
                if let Some(t) = val.as_f64() {
                    if t >= 0.0 {
                        return true;
                    }
                }
            }
            if let Some(val) = self.query_property("time-pos") {
                if let Some(t) = val.as_f64() {
                    if t >= 0.0 {
                        return true;
                    }
                }
            }
            if let Some(val) = self.query_property("video-format") {
                if let Some(fmt) = val.as_str() {
                    if !fmt.is_empty() {
                        return true;
                    }
                }
            }
            std::thread::sleep(Duration::from_millis(50));
        }
        false
    }

    pub fn terminate(&self) {
        if !self.is_destroyed.swap(true, Ordering::SeqCst) {
            let _ = self.lib.command_string(self.handle, "quit");
            self.lib.terminate_destroy(self.handle);

            #[cfg(windows)]
            if self.hwnd != 0 {
                use windows_sys::Win32::UI::WindowsAndMessaging::{
                    DestroyWindow, IsWindow, ShowWindow, SW_HIDE,
                };
                unsafe {
                    let h = self.hwnd as HWND;
                    if IsWindow(h) != 0 {
                        ShowWindow(h, SW_HIDE);
                        DestroyWindow(h);
                    }
                }
            }
        }
    }
}

impl Drop for InProcessMpv {
    fn drop(&mut self) {
        self.terminate();
    }
}

// ─── Global Registry for In-Process Players (Enables Zero-IPC Sync) ───────────

static INPROCESS_REGISTRY: Mutex<Option<HashMap<String, Arc<InProcessMpv>>>> = Mutex::new(None);

pub fn register_inprocess_player(key: &str, player: Arc<InProcessMpv>) {
    if let Ok(mut guard) = INPROCESS_REGISTRY.lock() {
        let map = guard.get_or_insert_with(HashMap::new);
        map.insert(key.to_string(), player);
    }
}

pub fn unregister_inprocess_player(key: &str) {
    if let Ok(mut guard) = INPROCESS_REGISTRY.lock() {
        if let Some(map) = guard.as_mut() {
            map.remove(key);
        }
    }
}

pub fn get_inprocess_player(key: &str) -> Option<Arc<InProcessMpv>> {
    if let Ok(guard) = INPROCESS_REGISTRY.lock() {
        if let Some(map) = guard.as_ref() {
            return map.get(key).cloned();
        }
    }
    None
}

// ─── In-Process HWND Discovery ────────────────────────────────────────────────

#[cfg(windows)]
fn find_inprocess_mpv_hwnd(existing_hwnds: &[usize]) -> Option<usize> {
    let my_pid = std::process::id();

    struct SearchData<'a> {
        pid: u32,
        existing: &'a [usize],
        hwnd: Option<HWND>,
    }

    unsafe extern "system" fn enum_cb(hwnd: HWND, lparam: LPARAM) -> i32 {
        let data = &mut *(lparam as *mut SearchData);
        let mut proc_id = 0u32;
        GetWindowThreadProcessId(hwnd, &mut proc_id);
        if proc_id == data.pid {
            let hwnd_val = hwnd as usize;
            if !data.existing.contains(&hwnd_val) {
                let mut buf = [0u16; 256];
                let len = GetClassNameW(hwnd, buf.as_mut_ptr(), 256);
                let class_name = String::from_utf16_lossy(&buf[..len as usize]);
                if class_name == "mpv" {
                    data.hwnd = Some(hwnd);
                    return 0; // stop enumeration
                }
            }
        }
        1
    }

    for _ in 0..100 {
        let mut data = SearchData {
            pid: my_pid,
            existing: existing_hwnds,
            hwnd: None,
        };
        unsafe {
            EnumWindows(Some(enum_cb), &mut data as *mut _ as LPARAM);
        }
        if let Some(h) = data.hwnd {
            return Some(h as usize);
        }
        std::thread::sleep(Duration::from_millis(20));
    }

    None
}
