// Native Windows Shell Video Thumbnail Extractor
// Uses IShellItemImageFactory (Windows Shell) + GDI+ to extract high-resolution
// video poster frames into lightweight JPEGs in ~50ms without invoking Chromium/WebView2 decoders.

use std::path::Path;
use std::ffi::c_void;

#[repr(C)]
struct SIZE {
    cx: i32,
    cy: i32,
}

#[repr(C)]
struct GUID {
    data1: u32,
    data2: u16,
    data3: u16,
    data4: [u8; 8],
}

// IID_IShellItemImageFactory: {bcc18b79-ba16-442f-80c4-8a59c30c463b}
const IID_ISHELL_ITEM_IMAGE_FACTORY: GUID = GUID {
    data1: 0xbcc18b79,
    data2: 0xba16,
    data3: 0x442f,
    data4: [0x80, 0xc4, 0x8a, 0x59, 0xc3, 0x0c, 0x46, 0x3b],
};

// CLSID_JpegEncoder: {557cf401-1a04-11d3-9a73-0000f81ef32e}
const CLSID_JPEG_ENCODER: GUID = GUID {
    data1: 0x557cf401,
    data2: 0x1a04,
    data3: 0x11d3,
    data4: [0x9a, 0x73, 0x00, 0x00, 0xf8, 0x1e, 0xf3, 0x2e],
};

#[repr(C)]
struct GdiplusStartupInput {
    gdiplus_version: u32,
    debug_event_callback: *mut c_void,
    suppress_background_thread: i32,
    suppress_external_codecs: i32,
}

#[repr(C)]
struct IShellItemImageFactoryVtbl {
    query_interface: unsafe extern "system" fn(this: *mut c_void, riid: *const GUID, ppv: *mut *mut c_void) -> i32,
    add_ref: unsafe extern "system" fn(this: *mut c_void) -> u32,
    release: unsafe extern "system" fn(this: *mut c_void) -> u32,
    get_image: unsafe extern "system" fn(this: *mut c_void, size: SIZE, flags: u32, phbm: *mut *mut c_void) -> i32,
}

#[link(name = "shell32")]
extern "system" {
    fn SHCreateItemFromParsingName(
        pszPath: *const u16,
        pbc: *mut c_void,
        riid: *const GUID,
        ppv: *mut *mut c_void,
    ) -> i32;
}

#[link(name = "gdiplus")]
extern "system" {
    fn GdiplusStartup(
        token: *mut usize,
        input: *const GdiplusStartupInput,
        output: *mut c_void,
    ) -> i32;
    fn GdiplusShutdown(token: usize);
    fn GdipCreateBitmapFromHBITMAP(
        hbm: *mut c_void,
        hpal: *mut c_void,
        bitmap: *mut *mut c_void,
    ) -> i32;
    fn GdipSaveImageToFile(
        image: *mut c_void,
        filename: *const u16,
        clsidEncoder: *const GUID,
        encoderParams: *const c_void,
    ) -> i32;
    fn GdipDisposeImage(image: *mut c_void) -> i32;
}

#[link(name = "gdi32")]
extern "system" {
    fn DeleteObject(ho: *mut c_void) -> i32;
}

#[link(name = "ole32")]
extern "system" {
    fn CoInitializeEx(pvReserved: *mut c_void, dwCoInit: u32) -> i32;
}

const COINIT_MULTITHREADED: u32 = 0x0;
const SIIGBF_RESIZETOFIT: u32 = 0x00;
const SIIGBF_BIGGERSIZEOK: u32 = 0x01;

fn to_wide_null(s: &str) -> Vec<u16> {
    use std::os::windows::ffi::OsStrExt;
    std::ffi::OsStr::new(s)
        .encode_wide()
        .chain(std::iter::once(0))
        .collect()
}

/// Extracts a video thumbnail using the native Windows Shell subsystem.
/// Width and height default to standard HD preview bounds (e.g. 640x360).
pub fn extract_shell_thumbnail(video_path: &Path, output_path: &Path, width: i32, height: i32) -> Result<(), String> {
    if !video_path.exists() {
        return Err(format!("Source video file does not exist: {:?}", video_path));
    }

    if let Some(parent) = output_path.parent() {
        let _ = std::fs::create_dir_all(parent);
    }

    let video_str = video_path.to_str().ok_or("Invalid UTF-8 in video path")?;
    let out_str = output_path.to_str().ok_or("Invalid UTF-8 in output path")?;

    let wide_video = to_wide_null(video_str);
    let wide_out = to_wide_null(out_str);

    unsafe {
        // Initialize COM on this thread if needed
        let _ = CoInitializeEx(std::ptr::null_mut(), COINIT_MULTITHREADED);

        // 1. Create IShellItemImageFactory for the video path
        let mut factory_ptr: *mut c_void = std::ptr::null_mut();
        let hr = SHCreateItemFromParsingName(
            wide_video.as_ptr(),
            std::ptr::null_mut(),
            &IID_ISHELL_ITEM_IMAGE_FACTORY,
            &mut factory_ptr,
        );

        if hr != 0 || factory_ptr.is_null() {
            return Err(format!("SHCreateItemFromParsingName failed with HRESULT 0x{:08X}", hr));
        }

        let vtbl = *(factory_ptr as *mut *mut IShellItemImageFactoryVtbl);
        let mut hbitmap: *mut c_void = std::ptr::null_mut();

        // 2. Extract image from factory
        let hr_img = ((*vtbl).get_image)(
            factory_ptr,
            SIZE { cx: width, cy: height },
            SIIGBF_BIGGERSIZEOK | SIIGBF_RESIZETOFIT,
            &mut hbitmap,
        );

        // Release shell factory
        ((*vtbl).release)(factory_ptr);

        if hr_img != 0 || hbitmap.is_null() {
            return Err(format!("IShellItemImageFactory::GetImage failed with HRESULT 0x{:08X}", hr_img));
        }

        // 3. Initialize GDI+ and save as JPEG
        let mut gdi_token: usize = 0;
        let startup_input = GdiplusStartupInput {
            gdiplus_version: 1,
            debug_event_callback: std::ptr::null_mut(),
            suppress_background_thread: 0,
            suppress_external_codecs: 0,
        };

        let gdi_res = GdiplusStartup(&mut gdi_token, &startup_input, std::ptr::null_mut());
        if gdi_res != 0 {
            DeleteObject(hbitmap);
            return Err(format!("GdiplusStartup failed with code {}", gdi_res));
        }

        let mut gp_bitmap: *mut c_void = std::ptr::null_mut();
        let create_res = GdipCreateBitmapFromHBITMAP(hbitmap, std::ptr::null_mut(), &mut gp_bitmap);
        DeleteObject(hbitmap);

        if create_res != 0 || gp_bitmap.is_null() {
            GdiplusShutdown(gdi_token);
            return Err(format!("GdipCreateBitmapFromHBITMAP failed with code {}", create_res));
        }

        let save_res = GdipSaveImageToFile(
            gp_bitmap,
            wide_out.as_ptr(),
            &CLSID_JPEG_ENCODER,
            std::ptr::null(),
        );

        GdipDisposeImage(gp_bitmap);
        GdiplusShutdown(gdi_token);

        if save_res != 0 {
            return Err(format!("GdipSaveImageToFile failed with code {}", save_res));
        }

        if !output_path.exists() {
            return Err("Output thumbnail file was not created on disk".to_string());
        }

        Ok(())
    }
}
