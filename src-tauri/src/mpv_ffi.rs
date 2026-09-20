// src-tauri/src/mpv_ffi.rs
// Pure-Rust dynamic FFI bindings and loader for libmpv-2.dll
// Loads symbols at runtime via Win32 LoadLibraryW / GetProcAddress, avoiding static .lib dependencies.

use std::ffi::{c_char, c_int, c_void, CStr, CString};
use std::path::{Path, PathBuf};
use std::sync::Arc;

#[cfg(windows)]
use windows_sys::Win32::Foundation::{FreeLibrary, HMODULE};
#[cfg(windows)]
use windows_sys::Win32::System::LibraryLoader::{GetProcAddress, LoadLibraryW};

pub type MpvHandle = *mut c_void;

#[repr(C)]
#[derive(Debug, Clone, Copy)]
pub struct MpvEvent {
    pub event_id: c_int,
    pub error: c_int,
    pub reply_userdata: u64,
    pub data: *mut c_void,
}

pub const MPV_EVENT_NONE: c_int = 0;
pub const MPV_EVENT_SHUTDOWN: c_int = 1;
pub const MPV_EVENT_LOG_MESSAGE: c_int = 2;
pub const MPV_EVENT_START_FILE: c_int = 6;
pub const MPV_EVENT_END_FILE: c_int = 7;
pub const MPV_EVENT_FILE_LOADED: c_int = 8;
pub const MPV_EVENT_IDLE: c_int = 11;
pub const MPV_EVENT_PLAYBACK_RESTART: c_int = 21;
pub const MPV_EVENT_PROPERTY_CHANGE: c_int = 22;

type FnMpvCreate = unsafe extern "C" fn() -> MpvHandle;
type FnMpvInitialize = unsafe extern "C" fn(ctx: MpvHandle) -> c_int;
type FnMpvSetOptionString = unsafe extern "C" fn(ctx: MpvHandle, name: *const c_char, data: *const c_char) -> c_int;
type FnMpvCommand = unsafe extern "C" fn(ctx: MpvHandle, args: *const *const c_char) -> c_int;
type FnMpvCommandString = unsafe extern "C" fn(ctx: MpvHandle, args: *const c_char) -> c_int;
type FnMpvSetPropertyString = unsafe extern "C" fn(ctx: MpvHandle, name: *const c_char, data: *const c_char) -> c_int;
type FnMpvGetPropertyString = unsafe extern "C" fn(ctx: MpvHandle, name: *const c_char) -> *mut c_char;
type FnMpvFree = unsafe extern "C" fn(data: *mut c_void);
type FnMpvWaitEvent = unsafe extern "C" fn(ctx: MpvHandle, timeout: f64) -> *const MpvEvent;
type FnMpvTerminateDestroy = unsafe extern "C" fn(ctx: MpvHandle);

pub struct LibMpv {
    #[cfg(windows)]
    _module: HMODULE,
    fn_create: FnMpvCreate,
    fn_initialize: FnMpvInitialize,
    fn_set_option_string: FnMpvSetOptionString,
    fn_command: FnMpvCommand,
    fn_command_string: FnMpvCommandString,
    fn_set_property_string: FnMpvSetPropertyString,
    fn_get_property_string: FnMpvGetPropertyString,
    fn_free: FnMpvFree,
    fn_wait_event: FnMpvWaitEvent,
    fn_terminate_destroy: FnMpvTerminateDestroy,
}

// Mark LibMpv Send + Sync because function pointers are reentrant and immutable
unsafe impl Send for LibMpv {}
unsafe impl Sync for LibMpv {}

impl LibMpv {
    #[cfg(windows)]
    pub fn load(dll_path: &Path) -> Result<Arc<Self>, String> {
        let wide_path: Vec<u16> = dll_path
            .as_os_str()
            .to_string_lossy()
            .encode_utf16()
            .chain(std::iter::once(0))
            .collect();

        unsafe {
            let module = LoadLibraryW(wide_path.as_ptr());
            if module.is_null() {
                let err = std::io::Error::last_os_error();
                return Err(format!("Failed to load libmpv DLL at {:?}: {}", dll_path, err));
            }

            macro_rules! get_sym {
                ($name:expr, $ty:ty) => {{
                    let cname = CString::new($name).unwrap();
                    let ptr = GetProcAddress(module, cname.as_ptr() as *const u8);
                    if ptr.is_none() {
                        FreeLibrary(module);
                        return Err(format!("Symbol {} not found in libmpv DLL", $name));
                    }
                    std::mem::transmute::<_, $ty>(ptr.unwrap())
                }};
            }

            let fn_create: FnMpvCreate = get_sym!("mpv_create", FnMpvCreate);
            let fn_initialize: FnMpvInitialize = get_sym!("mpv_initialize", FnMpvInitialize);
            let fn_set_option_string: FnMpvSetOptionString = get_sym!("mpv_set_option_string", FnMpvSetOptionString);
            let fn_command: FnMpvCommand = get_sym!("mpv_command", FnMpvCommand);
            let fn_command_string: FnMpvCommandString = get_sym!("mpv_command_string", FnMpvCommandString);
            let fn_set_property_string: FnMpvSetPropertyString = get_sym!("mpv_set_property_string", FnMpvSetPropertyString);
            let fn_get_property_string: FnMpvGetPropertyString = get_sym!("mpv_get_property_string", FnMpvGetPropertyString);
            let fn_free: FnMpvFree = get_sym!("mpv_free", FnMpvFree);
            let fn_wait_event: FnMpvWaitEvent = get_sym!("mpv_wait_event", FnMpvWaitEvent);
            let fn_terminate_destroy: FnMpvTerminateDestroy = get_sym!("mpv_terminate_destroy", FnMpvTerminateDestroy);

            Ok(Arc::new(Self {
                _module: module,
                fn_create,
                fn_initialize,
                fn_set_option_string,
                fn_command,
                fn_command_string,
                fn_set_property_string,
                fn_get_property_string,
                fn_free,
                fn_wait_event,
                fn_terminate_destroy,
            }))
        }
    }

    #[cfg(not(windows))]
    pub fn load(_dll_path: &Path) -> Result<Arc<Self>, String> {
        Err("In-process libmpv only configured for Windows currently".to_string())
    }

    pub fn create(&self) -> Result<MpvHandle, String> {
        let handle = unsafe { (self.fn_create)() };
        if handle.is_null() {
            Err("mpv_create returned NULL".to_string())
        } else {
            Ok(handle)
        }
    }

    pub fn initialize(&self, handle: MpvHandle) -> Result<(), String> {
        let code = unsafe { (self.fn_initialize)(handle) };
        if code < 0 {
            Err(format!("mpv_initialize failed with error code: {}", code))
        } else {
            Ok(())
        }
    }

    pub fn set_option(&self, handle: MpvHandle, name: &str, value: &str) -> Result<(), String> {
        let c_name = CString::new(name).map_err(|e| e.to_string())?;
        let c_val = CString::new(value).map_err(|e| e.to_string())?;
        let code = unsafe { (self.fn_set_option_string)(handle, c_name.as_ptr(), c_val.as_ptr()) };
        if code < 0 {
            Err(format!("mpv_set_option_string('{}', '{}') failed with error code: {}", name, value, code))
        } else {
            Ok(())
        }
    }

    pub fn set_property(&self, handle: MpvHandle, name: &str, value: &str) -> Result<(), String> {
        let c_name = CString::new(name).map_err(|e| e.to_string())?;
        let c_val = CString::new(value).map_err(|e| e.to_string())?;
        let code = unsafe { (self.fn_set_property_string)(handle, c_name.as_ptr(), c_val.as_ptr()) };
        if code < 0 {
            Err(format!("mpv_set_property_string('{}', '{}') failed with code: {}", name, value, code))
        } else {
            Ok(())
        }
    }

    pub fn get_property(&self, handle: MpvHandle, name: &str) -> Option<String> {
        let c_name = CString::new(name).ok()?;
        unsafe {
            let ptr = (self.fn_get_property_string)(handle, c_name.as_ptr());
            if ptr.is_null() {
                None
            } else {
                let s = CStr::from_ptr(ptr).to_string_lossy().into_owned();
                (self.fn_free)(ptr as *mut c_void);
                Some(s)
            }
        }
    }

    pub fn command_string(&self, handle: MpvHandle, command: &str) -> Result<(), String> {
        let c_cmd = CString::new(command).map_err(|e| e.to_string())?;
        let code = unsafe { (self.fn_command_string)(handle, c_cmd.as_ptr()) };
        if code < 0 {
            Err(format!("mpv_command_string('{}') failed with code: {}", command, code))
        } else {
            Ok(())
        }
    }

    pub fn command(&self, handle: MpvHandle, args: &[&str]) -> Result<(), String> {
        let c_args: Vec<CString> = args
            .iter()
            .map(|a| CString::new(*a).unwrap_or_default())
            .collect();
        let mut ptrs: Vec<*const c_char> = c_args.iter().map(|c| c.as_ptr()).collect();
        ptrs.push(std::ptr::null());

        let code = unsafe { (self.fn_command)(handle, ptrs.as_ptr()) };
        if code < 0 {
            Err(format!("mpv_command failed with code: {}", code))
        } else {
            Ok(())
        }
    }

    pub fn wait_event(&self, handle: MpvHandle, timeout_sec: f64) -> Option<MpvEvent> {
        unsafe {
            let ptr = (self.fn_wait_event)(handle, timeout_sec);
            if ptr.is_null() {
                None
            } else {
                Some(*ptr)
            }
        }
    }

    pub fn terminate_destroy(&self, handle: MpvHandle) {
        unsafe {
            (self.fn_terminate_destroy)(handle);
        }
    }
}

#[cfg(windows)]
impl Drop for LibMpv {
    fn drop(&mut self) {
        unsafe {
            if !self._module.is_null() {
                FreeLibrary(self._module);
            }
        }
    }
}

/// Find the libmpv DLL file (libmpv-2.dll or mpv-2.dll)
pub fn find_libmpv_dll() -> Result<PathBuf, String> {
    // 1. Try bundled relative to the running executable
    if let Ok(current_exe) = std::env::current_exe() {
        if let Some(exe_dir) = current_exe.parent() {
            let candidates = [
                exe_dir.join("libmpv-2.dll"),
                exe_dir.join("mpv-2.dll"),
                exe_dir.join("bin").join("mpv").join("libmpv-2.dll"),
                exe_dir.join("bin").join("mpv").join("mpv-2.dll"),
                exe_dir.join("resources").join("bin").join("mpv").join("libmpv-2.dll"),
                exe_dir.join("resources").join("bin").join("mpv").join("mpv-2.dll"),
                exe_dir.join("..").join("..").join("bin").join("mpv").join("libmpv-2.dll"),
                exe_dir.join("..").join("..").join("bin").join("mpv").join("mpv-2.dll"),
                exe_dir.join("..").join("..").join("src-tauri").join("bin").join("mpv").join("libmpv-2.dll"),
                exe_dir.join("..").join("..").join("src-tauri").join("bin").join("mpv").join("mpv-2.dll"),
            ];
            for candidate in &candidates {
                if candidate.exists() {
                    return Ok(candidate.canonicalize().unwrap_or_else(|_| candidate.clone()));
                }
            }
        }
    }

    // 2. Try development paths in project root
    let dev_paths = [
        PathBuf::from("bin/mpv/libmpv-2.dll"),
        PathBuf::from("bin/mpv/mpv-2.dll"),
        PathBuf::from("src-tauri/bin/mpv/libmpv-2.dll"),
        PathBuf::from("src-tauri/bin/mpv/mpv-2.dll"),
        PathBuf::from(r"C:\Users\Yashpreet_o7\Desktop\AetherFlow\bin\mpv\libmpv-2.dll"),
        PathBuf::from(r"C:\Users\Yashpreet_o7\Desktop\AetherFlow\bin\mpv\mpv-2.dll"),
        PathBuf::from(r"C:\Users\Yashpreet_o7\Desktop\AetherFlow\src-tauri\bin\mpv\libmpv-2.dll"),
        PathBuf::from(r"C:\Users\Yashpreet_o7\Desktop\AetherFlow\src-tauri\bin\mpv\mpv-2.dll"),
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
            lad.join("AetherFlow").join("bin").join("mpv").join("libmpv-2.dll"),
            lad.join("AetherFlow").join("bin").join("mpv").join("mpv-2.dll"),
            lad.join("Programs").join("AetherFlow").join("bin").join("mpv").join("libmpv-2.dll"),
            lad.join("Programs").join("AetherFlow").join("bin").join("mpv").join("mpv-2.dll"),
        ];
        for p in &appdata_paths {
            if p.exists() {
                return Ok(p.canonicalize().unwrap_or_else(|_| p.clone()));
            }
        }
    }

    Err("libmpv-2.dll not found on disk".to_string())
}
