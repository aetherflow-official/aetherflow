use std::path::PathBuf;
use std::process::{Child, Command, Stdio};
use std::io::Write;

#[cfg(windows)]
use std::os::windows::io::AsRawHandle;
#[cfg(windows)]
use windows_sys::Win32::Foundation::{CloseHandle, HANDLE, HWND};
#[cfg(windows)]
use windows_sys::Win32::System::Pipes::WaitNamedPipeW;
#[cfg(windows)]
use windows_sys::Win32::System::JobObjects::{
    AssignProcessToJobObject, CreateJobObjectW, SetInformationJobObject,
    JobObjectExtendedLimitInformation, JOBOBJECT_EXTENDED_LIMIT_INFORMATION,
    JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE,
};

#[cfg(windows)]
static MPV_JOB_HANDLE: std::sync::Mutex<Option<usize>> = std::sync::Mutex::new(None);

#[cfg(windows)]
pub fn ensure_mpv_job() -> Option<HANDLE> {
    let mut guard = MPV_JOB_HANDLE.lock().ok()?;
    if let Some(val) = *guard {
        return Some(val as HANDLE);
    }

    unsafe {
        let job = CreateJobObjectW(std::ptr::null(), std::ptr::null());
        if job.is_null() {
            log_mpv_msg(&format!("[MPV JOB ERROR] CreateJobObjectW failed: {}", std::io::Error::last_os_error()));
            return None;
        }

        let mut info: JOBOBJECT_EXTENDED_LIMIT_INFORMATION = std::mem::zeroed();
        info.BasicLimitInformation.LimitFlags = JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE;

        let res = SetInformationJobObject(
            job,
            JobObjectExtendedLimitInformation,
            &info as *const _ as *const std::ffi::c_void,
            std::mem::size_of::<JOBOBJECT_EXTENDED_LIMIT_INFORMATION>() as u32,
        );

        if res == 0 {
            log_mpv_msg(&format!("[MPV JOB ERROR] SetInformationJobObject failed: {}", std::io::Error::last_os_error()));
            CloseHandle(job);
            return None;
        }

        log_mpv_msg("[MPV JOB] Successfully initialized MPV Job Object with KILL_ON_JOB_CLOSE");
        println!("[MPV JOB] Successfully initialized MPV Job Object with KILL_ON_JOB_CLOSE");
        *guard = Some(job as usize);
        Some(job)
    }
}

#[cfg(not(windows))]
pub fn ensure_mpv_job() {}

#[cfg(windows)]
pub fn assign_child_to_mpv_job(child: &Child) {
    if let Some(job) = ensure_mpv_job() {
        let child_handle = child.as_raw_handle() as HANDLE;
        unsafe {
            let res = AssignProcessToJobObject(job, child_handle);
            if res != 0 {
                let msg = format!("[MPV JOB] Successfully assigned MPV PID {} to Job Object", child.id());
                log_mpv_msg(&msg);
                println!("{}", msg);
            } else {
                let err = std::io::Error::last_os_error();
                let msg = format!("[MPV JOB WARN] AssignProcessToJobObject failed for PID {}: {}", child.id(), err);
                log_mpv_msg(&msg);
                eprintln!("{}", msg);
            }
        }
    }
}

#[cfg(not(windows))]
pub fn assign_child_to_mpv_job(_child: &Child) {}

pub struct MpvProcess {
    pub child: Child,
    pub pipe_name: String,
    pub monitor_label: String,
    pub video_path: String,
    pub hwnd: usize,
}

static IPC_REQ_COUNTER: std::sync::atomic::AtomicU64 = std::sync::atomic::AtomicU64::new(100);

pub fn send_ipc_cmd(pipe_name: &str, command: serde_json::Value) -> Result<(), String> {
    #[cfg(windows)]
    {
        let mut file = match std::fs::OpenOptions::new().write(true).open(pipe_name) {
            Ok(f) => f,
            Err(_) => {
                let pipe_wide: Vec<u16> = pipe_name.encode_utf16().chain(std::iter::once(0)).collect();
                let ready = unsafe { WaitNamedPipeW(pipe_wide.as_ptr(), 50) };
                if ready == 0 {
                    return Err(format!("MPV IPC pipe {} is not ready", pipe_name));
                }
                std::fs::OpenOptions::new()
                    .write(true)
                    .open(pipe_name)
                    .map_err(|e| format!("Failed to open MPV IPC pipe {}: {}", pipe_name, e))?
            }
        };

        let mut msg = command.to_string();
        msg.push('\n');
        file.write_all(msg.as_bytes())
            .map_err(|e| format!("Failed to write to MPV IPC pipe: {}", e))?;
        Ok(())
    }
    #[cfg(not(windows))]
    {
        let _ = (pipe_name, command);
        Ok(())
    }
}

pub fn query_ipc_property(pipe_name: &str, prop: &str) -> Option<serde_json::Value> {
    #[cfg(windows)]
    {
        use std::io::BufRead;
        let pipe_wide: Vec<u16> = pipe_name.encode_utf16().chain(std::iter::once(0)).collect();
        let ready = unsafe { WaitNamedPipeW(pipe_wide.as_ptr(), 60) };
        if ready == 0 {
            return None;
        }
        let file = std::fs::OpenOptions::new()
            .read(true)
            .write(true)
            .open(pipe_name)
            .ok()?;
        let mut reader = std::io::BufReader::new(file);
        let my_id = IPC_REQ_COUNTER.fetch_add(1, std::sync::atomic::Ordering::Relaxed);
        let cmd = serde_json::json!({
            "command": ["get_property", prop],
            "request_id": my_id
        }).to_string() + "\n";
        let writer = reader.get_mut();
        if writer.write_all(cmd.as_bytes()).is_err() {
            return None;
        }
        let _ = writer.flush();
        for _ in 0..20 {
            let mut line = String::new();
            if reader.read_line(&mut line).is_err() || line.is_empty() {
                break;
            }
            if let Ok(val) = serde_json::from_str::<serde_json::Value>(&line) {
                if val.get("request_id").and_then(|r| r.as_u64()) == Some(my_id) {
                    if val.get("error").and_then(|e| e.as_str()) == Some("success") {
                        return val.get("data").cloned();
                    } else {
                        return None;
                    }
                }
            }
        }
        None
    }
    #[cfg(not(windows))]
    {
        let _ = (pipe_name, prop);
        None
    }
}

impl MpvProcess {
    pub fn send_ipc_command(&self, command: serde_json::Value) -> Result<(), String> {
        send_ipc_cmd(&self.pipe_name, command)
    }

    pub fn set_speed(&self, speed: f64) -> Result<(), String> {
        let speed_clamped = speed.max(0.1).min(10.0);
        self.send_ipc_command(serde_json::json!({
            "command": ["set_property", "speed", speed_clamped]
        }))
    }

    pub fn set_brightness(&self, brightness: f64) -> Result<(), String> {
        let mpv_br = ((brightness - 1.0) * 100.0).round().max(-100.0).min(100.0);
        self.send_ipc_command(serde_json::json!({
            "command": ["set_property", "brightness", mpv_br]
        }))
    }

    pub fn set_pause(&self, paused: bool) -> Result<(), String> {
        self.send_ipc_command(serde_json::json!({
            "command": ["set_property", "pause", paused]
        }))
    }

    pub fn seek(&self, seconds: f64, exact: bool) -> Result<(), String> {
        let mode = if exact { "absolute+exact" } else { "absolute" };
        self.send_ipc_command(serde_json::json!({
            "command": ["seek", seconds, mode]
        }))
    }

    pub fn set_volume(&self, volume: f64) -> Result<(), String> {
        let vol_clamped = volume.max(0.0).min(100.0);
        self.send_ipc_command(serde_json::json!({
            "command": ["set_property", "volume", vol_clamped]
        }))
    }

    pub fn set_mute(&self, muted: bool) -> Result<(), String> {
        self.send_ipc_command(serde_json::json!({
            "command": ["set_property", "mute", muted]
        }))
    }

    pub fn load_file(&mut self, new_video_path: &str) -> Result<(), String> {
        self.video_path = new_video_path.to_string();
        self.send_ipc_command(serde_json::json!({
            "command": ["loadfile", new_video_path]
        }))
    }

    pub fn query_property(&self, prop: &str) -> Option<serde_json::Value> {
        query_ipc_property(&self.pipe_name, prop)
    }

    pub fn wait_for_playback(&mut self, max_wait_ms: u64) -> bool {
        let start = std::time::Instant::now();
        let timeout = std::time::Duration::from_millis(max_wait_ms);
        while start.elapsed() < timeout {
            // Check if child exited prematurely (e.g. yt-dlp error or stream unavailable)
            if let Ok(Some(status)) = self.child.try_wait() {
                log_mpv_msg(&format!("[MPV] Process for {} exited early during wait_for_playback: {:?}", self.monitor_label, status));
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
            std::thread::sleep(std::time::Duration::from_millis(75));
        }
        false
    }

    pub fn terminate(&mut self) {
        println!("[MPV] Terminating MPV process for monitor {}", self.monitor_label);
        let _ = self.send_ipc_command(serde_json::json!({ "command": ["quit"] }));
        let _ = self.child.kill();
        let _ = self.child.wait();

        #[cfg(windows)]
        if self.hwnd != 0 {
            use windows_sys::Win32::UI::WindowsAndMessaging::{DestroyWindow, IsWindow, ShowWindow, SW_HIDE};
            unsafe {
                let h = self.hwnd as HWND;
                if IsWindow(h) != 0 {
                    ShowWindow(h, SW_HIDE);
                    DestroyWindow(h);
                }
            }
            self.hwnd = 0;
        }
    }
}

impl Drop for MpvProcess {
    fn drop(&mut self) {
        self.terminate();
    }
}

/// Forcibly kills any running AetherFlow-VideoEngine.exe processes on the system
#[cfg(windows)]
pub fn kill_all_mpv_processes() {
    use std::os::windows::process::CommandExt;
    let _ = std::process::Command::new("taskkill")
        .args(&["/F", "/IM", "AetherFlow-VideoEngine.exe", "/T"])
        .creation_flags(0x08000000) // CREATE_NO_WINDOW
        .status();
    let _ = std::process::Command::new("taskkill")
        .args(&["/F", "/IM", "mpv.exe", "/T"])
        .creation_flags(0x08000000) // CREATE_NO_WINDOW
        .status();
}

#[cfg(not(windows))]
pub fn kill_all_mpv_processes() {}

/// Find the mpv executable path
pub fn find_mpv_binary() -> Result<PathBuf, String> {
    // 1. Try bundled relative to the running executable
    if let Ok(current_exe) = std::env::current_exe() {
        if let Some(exe_dir) = current_exe.parent() {
            let candidates = [
                exe_dir.join("resources").join("bin").join("mpv").join("mpv.exe"),
                exe_dir.join("resources").join("bin").join("mpv").join("AetherFlow-VideoEngine.exe"),
                exe_dir.join("resources").join("bin").join("mpv.exe"),
                exe_dir.join("resources").join("bin").join("AetherFlow-VideoEngine.exe"),
                exe_dir.join("bin").join("mpv").join("mpv.exe"),
                exe_dir.join("bin").join("mpv").join("AetherFlow-VideoEngine.exe"),
                exe_dir.join("src-tauri").join("bin").join("mpv").join("mpv.exe"),
                exe_dir.join("src-tauri").join("bin").join("mpv").join("AetherFlow-VideoEngine.exe"),
                exe_dir.join("bin").join("mpv.exe"),
                exe_dir.join("bin").join("AetherFlow-VideoEngine.exe"),
                exe_dir.join("mpv.exe"),
                exe_dir.join("AetherFlow-VideoEngine.exe"),
                exe_dir.join("..").join("..").join("src-tauri").join("bin").join("mpv").join("mpv.exe"),
                exe_dir.join("..").join("..").join("src-tauri").join("bin").join("mpv").join("AetherFlow-VideoEngine.exe"),
            ];
            for candidate in &candidates {
                if candidate.exists() {
                    return Ok(candidate.canonicalize().unwrap_or_else(|_| candidate.clone()));
                }
            }
        }
    }

    // 2. Try development path in project root
    let dev_paths = [
        PathBuf::from("bin/mpv/mpv.exe"),
        PathBuf::from("src-tauri/bin/mpv/mpv.exe"),
        PathBuf::from("bin/mpv/AetherFlow-VideoEngine.exe"),
        PathBuf::from("src-tauri/bin/mpv/AetherFlow-VideoEngine.exe"),
        PathBuf::from(r"C:\Users\Yashpreet_o7\Desktop\AetherFlow\bin\mpv\mpv.exe"),
        PathBuf::from(r"C:\Users\Yashpreet_o7\Desktop\AetherFlow\src-tauri\bin\mpv\mpv.exe"),
    ];
    for p in &dev_paths {
        if p.exists() {
            return Ok(p.canonicalize().unwrap_or_else(|_| p.clone()));
        }
    }

    // 3. Try LocalAppData locations
    if let Ok(local_app_data) = std::env::var("LOCALAPPDATA") {
        let lad = PathBuf::from(local_app_data);
        let appdata_paths = [
            lad.join("AetherFlow").join("bin").join("mpv").join("AetherFlow-VideoEngine.exe"),
            lad.join("AetherFlow").join("bin").join("mpv").join("mpv.exe"),
            lad.join("Programs").join("AetherFlow").join("bin").join("mpv").join("AetherFlow-VideoEngine.exe"),
            lad.join("Programs").join("AetherFlow").join("bin").join("mpv").join("mpv.exe"),
            lad.join("Programs").join("AetherFlow").join("resources").join("bin").join("mpv").join("AetherFlow-VideoEngine.exe"),
            lad.join("Programs").join("AetherFlow").join("resources").join("bin").join("mpv").join("mpv.exe"),
        ];
        for p in &appdata_paths {
            if p.exists() {
                return Ok(p.canonicalize().unwrap_or_else(|_| p.clone()));
            }
        }
    }

    // 4. Fall back to system PATH if installed globally (pure Rust, NO console popups)
    if let Some(paths) = std::env::var_os("PATH") {
        for dir in std::env::split_paths(&paths) {
            for name in &["AetherFlow-VideoEngine.exe", "mpv.exe"] {
                let candidate = dir.join(name);
                if candidate.exists() {
                    return Ok(candidate);
                }
            }
        }
    }

    Err("MPV executable not found on disk or PATH".to_string())
}

/// Find the yt-dlp executable path for streaming YouTube through MPV
pub fn find_ytdl_binary() -> Result<PathBuf, String> {
    // 1. Try bundled relative to the running executable
    if let Ok(current_exe) = std::env::current_exe() {
        if let Some(exe_dir) = current_exe.parent() {
            let candidates = [
                exe_dir.join("resources").join("bin").join("mpv").join("yt-dlp.exe"),
                exe_dir.join("resources").join("bin").join("yt-dlp.exe"),
                exe_dir.join("bin").join("mpv").join("yt-dlp.exe"),
                exe_dir.join("src-tauri").join("bin").join("mpv").join("yt-dlp.exe"),
                exe_dir.join("bin").join("yt-dlp.exe"),
                exe_dir.join("yt-dlp.exe"),
                exe_dir.join("..").join("..").join("src-tauri").join("bin").join("mpv").join("yt-dlp.exe"),
                exe_dir.join("..").join("..").join("bin").join("mpv").join("yt-dlp.exe"),
            ];
            for candidate in &candidates {
                if candidate.exists() {
                    return Ok(candidate.canonicalize().unwrap_or_else(|_| candidate.clone()));
                }
            }
        }
    }

    // 2. Try development path in project root
    let dev_paths = [
        PathBuf::from("bin/mpv/yt-dlp.exe"),
        PathBuf::from("src-tauri/bin/mpv/yt-dlp.exe"),
        PathBuf::from(r"C:\Users\Yashpreet_o7\Desktop\AetherFlow\bin\mpv\yt-dlp.exe"),
        PathBuf::from(r"C:\Users\Yashpreet_o7\Desktop\AetherFlow\src-tauri\bin\mpv\yt-dlp.exe"),
    ];
    for p in &dev_paths {
        if p.exists() {
            return Ok(p.canonicalize().unwrap_or_else(|_| p.clone()));
        }
    }

    // 3. Try LocalAppData locations
    if let Ok(local_app_data) = std::env::var("LOCALAPPDATA") {
        let lad = PathBuf::from(local_app_data);
        let appdata_paths = [
            lad.join("AetherFlow").join("bin").join("mpv").join("yt-dlp.exe"),
            lad.join("Programs").join("AetherFlow").join("bin").join("mpv").join("yt-dlp.exe"),
            lad.join("Programs").join("AetherFlow").join("resources").join("bin").join("mpv").join("yt-dlp.exe"),
        ];
        for p in &appdata_paths {
            if p.exists() {
                return Ok(p.canonicalize().unwrap_or_else(|_| p.clone()));
            }
        }
    }

    // 4. Fall back to system PATH if installed globally
    if let Some(paths) = std::env::var_os("PATH") {
        for dir in std::env::split_paths(&paths) {
            let candidate = dir.join("yt-dlp.exe");
            if candidate.exists() {
                return Ok(candidate);
            }
        }
    }

    Err("yt-dlp executable not found on disk or PATH".to_string())
}

/// Check if a URL points to YouTube
pub fn is_youtube_url(url: &str) -> bool {
    let u = url.trim().to_lowercase();
    u.contains("youtube.com/") || u.contains("youtu.be/") || u.contains("youtube-nocookie.com/")
}

/// Check if a string represents an HTTP/HTTPS network stream URL
pub fn is_network_url(url: &str) -> bool {
    let u = url.trim().to_lowercase();
    u.starts_with("http://") || u.starts_with("https://")
}

/// Check if a given wallpaper configuration represents a video wallpaper
pub fn is_video_wallpaper(engine_id: &str, video_path: Option<&str>) -> bool {
    if engine_id == "video-player" {
        return true;
    }
    if let Some(path) = video_path {
        let p = path.to_lowercase();
        return p.ends_with(".mp4")
            || p.ends_with(".webm")
            || p.ends_with(".mkv")
            || p.ends_with(".avi")
            || p.ends_with(".mov")
            || p.ends_with(".wmv")
            || p.ends_with(".flv");
    }
    false
}

#[cfg(windows)]
pub fn dump_window_diagnostics(tag: &str, hwnd: HWND) {
    use windows_sys::Win32::UI::WindowsAndMessaging::{
        GetWindowThreadProcessId, GetClassNameW, GetWindowTextW, IsWindowVisible,
        GetParent, GetWindow, GetWindowLongW, GetLayeredWindowAttributes,
        GetWindowRect, GetClientRect,
        GW_OWNER, GWL_STYLE, GWL_EXSTYLE,
    };
    use windows_sys::Win32::Foundation::{POINT, RECT};
    use windows_sys::Win32::Graphics::Gdi::{
        MonitorFromWindow, GetMonitorInfoW, MONITORINFO, MONITOR_DEFAULTTONEAREST,
        MapWindowPoints,
    };
    use windows_sys::Win32::Graphics::Dwm::DwmGetWindowAttribute;

    if hwnd.is_null() {
        log_mpv_msg(&format!("[WIN_DIAG] tag='{}' HWND is NULL", tag));
        return;
    }

    unsafe {
        let mut pid = 0u32;
        GetWindowThreadProcessId(hwnd, &mut pid);

        let mut cbuf = [0u16; 256];
        let clen = GetClassNameW(hwnd, cbuf.as_mut_ptr(), 256);
        let class_name = String::from_utf16_lossy(&cbuf[..clen as usize]);

        let mut tbuf = [0u16; 256];
        let tlen = GetWindowTextW(hwnd, tbuf.as_mut_ptr(), 256);
        let title = String::from_utf16_lossy(&tbuf[..tlen as usize]);

        let is_visible = IsWindowVisible(hwnd) != 0;
        let parent = GetParent(hwnd) as usize;
        let owner = GetWindow(hwnd, GW_OWNER) as usize;
        let style = GetWindowLongW(hwnd, GWL_STYLE) as u32;
        let exstyle = GetWindowLongW(hwnd, GWL_EXSTYLE) as u32;

        let mut alpha = 255u8;
        let mut lwa_flags = 0u32;
        let lwa_ok = GetLayeredWindowAttributes(hwnd, std::ptr::null_mut(), &mut alpha, &mut lwa_flags);
        let alpha_str = if lwa_ok != 0 { format!("{}", alpha) } else { "none".to_string() };

        let mut wr: RECT = std::mem::zeroed();
        let mut cr: RECT = std::mem::zeroed();
        GetWindowRect(hwnd, &mut wr);
        GetClientRect(hwnd, &mut cr);

        let mut client_origin = [POINT { x: 0, y: 0 }];
        MapWindowPoints(hwnd, std::ptr::null_mut(), client_origin.as_mut_ptr(), 1);

        let mut border_col = 0u32;
        let mut ncr_policy = 0u32;
        let mut corner_pref = 0u32;
        DwmGetWindowAttribute(hwnd, 34, &mut border_col as *mut u32 as *mut _, std::mem::size_of::<u32>() as u32);
        DwmGetWindowAttribute(hwnd, 2, &mut ncr_policy as *mut u32 as *mut _, std::mem::size_of::<u32>() as u32);
        DwmGetWindowAttribute(hwnd, 33, &mut corner_pref as *mut u32 as *mut _, std::mem::size_of::<u32>() as u32);

        let hmon = MonitorFromWindow(hwnd, MONITOR_DEFAULTTONEAREST);
        let mut minfo: MONITORINFO = std::mem::zeroed();
        minfo.cbSize = std::mem::size_of::<MONITORINFO>() as u32;
        GetMonitorInfoW(hmon, &mut minfo);
        let rc = minfo.rcMonitor;

        let now = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap_or_default();
        let ts = format!("{}.{:03}", now.as_secs(), now.subsec_millis());

        let msg = format!(
            "[WIN_DIAG {}] tag='{}' HWND=0x{:X} pid={} class='{}' title='{}' vis={} parent=0x{:X} owner=0x{:X} style=0x{:08X} (CAPTION={}, THICKFRAME={}, BORDER={}, POPUP={}, CHILD={}) exstyle=0x{:08X} alpha={} DWM_Border=0x{:08X} NCR={} Corner={} WinRect=({},{})-({},{}) [{}x{}] ClientRect=[{}x{}] ClientOrigin=({},{}) MonRect=({},{})-({},{}) [{}x{}]",
            ts, tag, hwnd as usize, pid, class_name, title, is_visible, parent, owner,
            style, (style & 0x00C00000) != 0, (style & 0x00040000) != 0, (style & 0x00800000) != 0, (style & 0x80000000) != 0, (style & 0x40000000) != 0,
            exstyle, alpha_str, border_col, ncr_policy, corner_pref,
            wr.left, wr.top, wr.right, wr.bottom, wr.right - wr.left, wr.bottom - wr.top,
            cr.right, cr.bottom, client_origin[0].x, client_origin[0].y,
            rc.left, rc.top, rc.right, rc.bottom, rc.right - rc.left, rc.bottom - rc.top
        );
        log_mpv_msg(&msg);
        println!("{}", msg);
    }
}

#[cfg(not(windows))]
pub fn dump_window_diagnostics(_tag: &str, _hwnd: usize) {}

#[cfg(windows)]
fn find_mpv_hwnd(child: &mut Child) -> Option<HWND> {
    use windows_sys::Win32::UI::WindowsAndMessaging::{
        EnumWindows, EnumThreadWindows, GetWindowThreadProcessId, GetClassNameW
    };
    use windows_sys::Win32::Foundation::{LPARAM, CloseHandle, INVALID_HANDLE_VALUE};
    use windows_sys::Win32::System::Diagnostics::ToolHelp::{
        CreateToolhelp32Snapshot, Thread32First, Thread32Next, THREADENTRY32, TH32CS_SNAPTHREAD,
        Process32First, Process32Next, PROCESSENTRY32, TH32CS_SNAPPROCESS,
    };

    let target_pid = child.id();

    struct SearchData {
        target_pids: Vec<u32>,
        hwnd: Option<HWND>,
    }

    unsafe extern "system" fn enum_win_cb(hwnd: HWND, lparam: LPARAM) -> i32 {
        let data = &mut *(lparam as *mut SearchData);
        let mut proc_id = 0u32;
        GetWindowThreadProcessId(hwnd, &mut proc_id);
        let mut buf = [0u16; 256];
        let len = GetClassNameW(hwnd, buf.as_mut_ptr(), 256);
        let class_name = String::from_utf16_lossy(&buf[..len as usize]);
        if class_name == "mpv" {
            if data.target_pids.contains(&proc_id) {
                dump_window_diagnostics("ENUM_CB_FOUND_WINDOW", hwnd);
                data.hwnd = Some(hwnd);
                return 0; // stop enum
            }
        }
        1
    }

    unsafe extern "system" fn enum_thread_cb(hwnd: HWND, lparam: LPARAM) -> i32 {
        let data = &mut *(lparam as *mut SearchData);
        let mut buf = [0u16; 256];
        let len = GetClassNameW(hwnd, buf.as_mut_ptr(), 256);
        let class_name = String::from_utf16_lossy(&buf[..len as usize]);
        if class_name == "mpv" {
            let mut proc_id = 0u32;
            GetWindowThreadProcessId(hwnd, &mut proc_id);
            dump_window_diagnostics("ENUM_THREAD_FOUND_WINDOW", hwnd);
            data.hwnd = Some(hwnd);
            return 0; // stop enum for this thread
        }
        1
    }

    // Helper to gather target_pid and all child processes spawned by it
    let get_all_pids = |root_pid: u32| -> Vec<u32> {
        let mut pids = vec![root_pid];
        unsafe {
            let snap = CreateToolhelp32Snapshot(TH32CS_SNAPPROCESS, 0);
            if snap != INVALID_HANDLE_VALUE {
                let mut pe: PROCESSENTRY32 = std::mem::zeroed();
                pe.dwSize = std::mem::size_of::<PROCESSENTRY32>() as u32;
                if Process32First(snap, &mut pe) != 0 {
                    loop {
                        if pids.contains(&pe.th32ParentProcessID) && !pids.contains(&pe.th32ProcessID) {
                            pids.push(pe.th32ProcessID);
                        }
                        if Process32Next(snap, &mut pe) == 0 {
                            break;
                        }
                    }
                }
                CloseHandle(snap);
            }
        }
        pids
    };

    // Helper to enumerate all threads belonging to target PIDs
    let get_threads_for_pids = |pids: &[u32]| -> Vec<u32> {
        let mut threads = Vec::new();
        unsafe {
            let snap = CreateToolhelp32Snapshot(TH32CS_SNAPTHREAD, 0);
            if snap != INVALID_HANDLE_VALUE {
                let mut te: THREADENTRY32 = std::mem::zeroed();
                te.dwSize = std::mem::size_of::<THREADENTRY32>() as u32;
                if Thread32First(snap, &mut te) != 0 {
                    loop {
                        if pids.contains(&te.th32OwnerProcessID) {
                            threads.push(te.th32ThreadID);
                        }
                        if Thread32Next(snap, &mut te) == 0 {
                            break;
                        }
                    }
                }
                CloseHandle(snap);
            }
        }
        threads
    };

    // Poll for up to 6 seconds (fast 10ms polling initially to catch window on creation)
    for i in 0..250 {
        if let Ok(Some(status)) = child.try_wait() {
            log_mpv_msg(&format!("[MPV] Process {} exited early during find_mpv_hwnd: {:?}", target_pid, status));
            return None;
        }

        let target_pids = get_all_pids(target_pid);
        let mut data = SearchData {
            target_pids: target_pids.clone(),
            hwnd: None,
        };

        // Strategy 1: EnumThreadWindows (direct, fast, immune to desktop isolation or top-level filter issues)
        let thread_ids = get_threads_for_pids(&target_pids);
        for tid in thread_ids {
            unsafe {
                EnumThreadWindows(tid, Some(enum_thread_cb), &mut data as *mut _ as LPARAM);
            }
            if let Some(h) = data.hwnd {
                return Some(h);
            }
        }

        // Strategy 2: EnumWindows fallback
        unsafe {
            EnumWindows(Some(enum_win_cb), &mut data as *mut _ as LPARAM);
        }
        if let Some(h) = data.hwnd {
            return Some(h);
        }

        let poll_ms = if i < 40 { 10 } else { 25 };
        std::thread::sleep(std::time::Duration::from_millis(poll_ms));
    }
    None
}

/// Launch an MPV instance positioned for a specific monitor
pub fn spawn_mpv_wallpaper(
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
    _opacity: Option<f64>,
    ticket: Option<u64>,
) -> Result<MpvProcess, String> {
    let mpv_exe = find_mpv_binary()?;
    let safe_label = monitor_label.replace("\\", "").replace(".", "_").replace(" ", "_");
    let pipe_name = if let Some(t) = ticket {
        format!(r"\\.\pipe\aetherflow-mpv-{}-{}", safe_label, t)
    } else {
        format!(r"\\.\pipe\aetherflow-mpv-{}", safe_label)
    };

    let is_network = is_network_url(video_path);
    let is_yt = is_youtube_url(video_path);

    let mut script_opts = vec!["osc-visibility=never".to_string()];
    if is_yt {
        if let Ok(ytdl_path) = find_ytdl_binary() {
            let path_str = ytdl_path.to_string_lossy().replace('\\', "/");
            script_opts.push(format!("ytdl_hook-ytdl_path={}", path_str));
            log_mpv_msg(&format!("[MPV] Using bundled yt-dlp at: {}", path_str));
        } else {
            log_mpv_msg("[MPV WARN] yt-dlp binary not found; relying on system PATH for MPV ytdl hook");
        }
    }

    let mut cmd = Command::new(&mpv_exe);

    // Lively-style standalone borderless window flags:
    // MPV initializes its own Direct3D 11 swapchain without cross-process --wid restrictions.
    cmd.arg("--no-config")
        .arg("--window-minimized=yes")
        .arg("--force-window=immediate")
        .arg("--show-in-taskbar=no")
        .arg("--taskbar-progress=no")
        .arg("--title-bar=no")
        .arg("--title=AetherFlow Video Engine")
        .arg("--force-media-title=AetherFlow Video Engine")
        .arg("--no-border")
        .arg("--window-corners=donotround")
        .arg("--no-osc")
        .arg("--no-osd-bar")
        .arg("--osd-level=0")
        .arg("--osd-on-seek=no")
        .arg("--osd-duration=0")
        .arg("--osd-font-size=1")
        .arg("--osd-scale=0")
        .arg("--osd-outline-size=0")
        .arg("--osd-shadow-offset=0")
        .arg("--osd-color=#00000000")
        .arg("--osd-border-color=#00000000")
        .arg("--osd-shadow-color=#00000000")
        .arg("--osd-outline-color=#00000000")
        .arg("--osd-back-color=#00000000")
        .arg("--osd-msg1=")
        .arg("--osd-msg2=")
        .arg("--osd-msg3=")
        .arg("--osd-status-msg=")
        .arg("--osd-playing-msg=")
        .arg(format!("--script-opts={}", script_opts.join(",")))
        .arg("--loop-file=inf")
        .arg("--keep-open=yes")
        .arg("--media-controls=no")
        .arg("--cursor-autohide=no")
        .arg("--input-default-bindings=no")
        .arg("--input-cursor=no")
        .arg("--hwdec=auto-safe")
        .arg("--panscan=1.0")
        .arg("--keepaspect-window=no")
        .arg("--auto-window-resize=no")
        .arg(format!("--geometry={}x{}{:+}{:+}", mon_w, mon_h, mon_x, mon_y))
        .arg("--background-color=#000000");

    if is_network {
        cmd.arg("--cache=yes")
            .arg("--demuxer-max-bytes=64M")
            .arg("--demuxer-max-back-bytes=16M");
        if is_yt {
            cmd.arg("--ytdl=yes")
                .arg("--ytdl-raw-options=js-runtimes=\"node\",remote-components=\"ejs:github\",cookies-from-browser=firefox")
                .arg("--ytdl-format=bestvideo[height<=1080]+bestaudio/best");
        }
    } else {
        cmd.arg("--cache=no")
            .arg("--demuxer-max-bytes=16M")
            .arg("--demuxer-max-back-bytes=4M");
    }

    cmd.arg(format!("--input-ipc-server={}", pipe_name));

    // Speed handling
    if let Some(spd) = speed {
        let spd_clamped = spd.max(0.1).min(10.0);
        cmd.arg(format!("--speed={}", spd_clamped));
    }

    // Brightness handling (-100 to 100 based on standard 0.1 to 1.5 brightness scale)
    if let Some(br) = brightness {
        let mpv_br = ((br - 1.0) * 100.0).round().max(-100.0).min(100.0);
        cmd.arg(format!("--brightness={}", mpv_br));
    }

    // Audio handling
    if muted.unwrap_or(false) {
        cmd.arg("--mute=yes");
    } else {
        cmd.arg("--mute=no");
    }

    if let Some(vol) = volume {
        let vol_clamped = vol.max(0.0).min(100.0);
        cmd.arg(format!("--volume={}", vol_clamped));
    }

    // Video path to play
    cmd.arg(video_path);

    // Suppress console window
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        const CREATE_NO_WINDOW: u32 = 0x08000000;
        cmd.creation_flags(CREATE_NO_WINDOW);
    }

    cmd.stdin(Stdio::null())
        .stdout(Stdio::null())
        .stderr(Stdio::null());

    println!("[MPV] Launching standalone MPV instance: {:?} with file '{}' on monitor '{}' bounds=({},{}) {}x{}", 
        mpv_exe, video_path, monitor_label, mon_x, mon_y, mon_w, mon_h);
    log_mpv_msg(&format!("[MPV] Spawning standalone MPV: label='{}', bounds=({},{}) {}x{}, video='{}'", 
        monitor_label, mon_x, mon_y, mon_w, mon_h, video_path));

    let mut child = cmd.spawn().map_err(|e| format!("Failed to spawn MPV process {:?}: {}", mpv_exe, e))?;
    let mpv_pid = child.id();

    #[cfg(windows)]
    assign_child_to_mpv_job(&child);

    #[cfg(windows)]
    let mpv_hwnd = match find_mpv_hwnd(&mut child) {
        Some(h) => {
            log_mpv_msg(&format!("[MPV] Located native MPV HWND: 0x{:X} for PID={}", h as usize, mpv_pid));
            dump_window_diagnostics("MPV_DISCOVERED_PRE_LAYERED", h);
            use windows_sys::Win32::UI::WindowsAndMessaging::{
                GetWindowLongW, SetWindowLongW, SetLayeredWindowAttributes, SetWindowPos,
                ShowWindow, SW_SHOWNOACTIVATE,
                GWL_STYLE, GWL_EXSTYLE, WS_POPUP, WS_CAPTION, WS_THICKFRAME,
                WS_BORDER, WS_DLGFRAME, WS_SYSMENU, WS_MINIMIZE, WS_MAXIMIZE,
                WS_EX_LAYERED, WS_EX_TOOLWINDOW, WS_EX_APPWINDOW, WS_EX_NOACTIVATE,
                SWP_NOMOVE, SWP_NOSIZE, SWP_NOZORDER, SWP_NOACTIVATE, SWP_FRAMECHANGED,
                LWA_ALPHA
            };
            use windows_sys::Win32::Graphics::Dwm::DwmSetWindowAttribute;
            unsafe {
                // Attach borderless subclass proc to suppress all non-client painting and frame calculations
                windows_sys::Win32::UI::Shell::SetWindowSubclass(
                    h,
                    Some(crate::borderless_wallpaper_subclass_proc),
                    2001,
                    0,
                );

                // Strip all window caption, sizing borders, system menu, minimize/maximize buttons, keep invisible
                let style = GetWindowLongW(h, GWL_STYLE) as u32;
                let new_style = (style | WS_POPUP) & !(WS_CAPTION | WS_THICKFRAME | WS_BORDER | WS_DLGFRAME | WS_SYSMENU | WS_MINIMIZE | WS_MAXIMIZE | 0x10000000 /* WS_VISIBLE */);
                SetWindowLongW(h, GWL_STYLE, new_style as i32);

                // Enforce WS_EX_TOOLWINDOW, WS_EX_LAYERED, WS_EX_NOACTIVATE, strip WS_EX_APPWINDOW and 3D borders
                let ex = GetWindowLongW(h, GWL_EXSTYLE) as u32;
                let new_ex = (ex | WS_EX_TOOLWINDOW | WS_EX_LAYERED | WS_EX_NOACTIVATE) & !(WS_EX_APPWINDOW | 0x00000100 | 0x00000200 | 0x00000001 | 0x00020000);
                SetWindowLongW(h, GWL_EXSTYLE, new_ex as i32);

                // Disable DWM border color (kill Windows 11 1px border), non-client rendering, and rounded corners
                let border_none: u32 = 0xFFFFFFFE; // DWMWA_COLOR_NONE
                DwmSetWindowAttribute(h, 34 /* DWMWA_BORDER_COLOR */, &border_none as *const u32 as *const _, std::mem::size_of::<u32>() as u32);
                let ncr_disabled: u32 = 1; // DWMNCRP_DISABLED
                DwmSetWindowAttribute(h, 2 /* DWMWA_NCRENDERING_POLICY */, &ncr_disabled as *const u32 as *const _, std::mem::size_of::<u32>() as u32);
                let do_not_round: u32 = 1; // DWMWCP_DONOTROUND
                DwmSetWindowAttribute(h, 33 /* DWMWA_WINDOW_CORNER_PREFERENCE */, &do_not_round as *const u32 as *const _, std::mem::size_of::<u32>() as u32);

                // Always start completely transparent (alpha = 0) while unparented.
                // pin_hwnd_as_wallpaper will place it behind desktop icons and restore target opacity.
                SetLayeredWindowAttributes(h, 0, 0, LWA_ALPHA);

                // UN-MINIMIZE while maintaining layered transparency (alpha = 0).
                // This un-minimizes MPV from (-32000, -32000) [199x34] to its full geometry [mon_w x mon_h]
                // so Direct3D 11 decodes frames into the full window without showing anything or stealing focus!
                ShowWindow(h, SW_SHOWNOACTIVATE);

                // Notify Windows of the frame change so non-client caption and borders are purged immediately
                SetWindowPos(h, std::ptr::null_mut(), 0, 0, 0, 0, SWP_NOMOVE | SWP_NOSIZE | SWP_NOZORDER | SWP_NOACTIVATE | SWP_FRAMECHANGED);
            }
            dump_window_diagnostics("MPV_DISCOVERED_POST_LAYERED", h);
            h
        }
        None => {
            log_mpv_msg(&format!("[MPV WARN] Could not find HWND for MPV PID={}, falling back to 0", mpv_pid));
            std::ptr::null_mut()
        }
    };

    #[cfg(not(windows))]
    let mpv_hwnd = 0usize;

    Ok(MpvProcess {
        child,
        pipe_name,
        monitor_label: monitor_label.to_string(),
        video_path: video_path.to_string(),
        #[cfg(windows)]
        hwnd: mpv_hwnd as usize,
        #[cfg(not(windows))]
        hwnd: 0,
    })
}

fn log_mpv_msg(msg: &str) {
    use std::io::Write;
    if let Ok(mut file) = std::fs::OpenOptions::new().create(true).append(true).open("desktop_debug.log") {
        let _ = writeln!(file, "{}", msg);
    }
}
