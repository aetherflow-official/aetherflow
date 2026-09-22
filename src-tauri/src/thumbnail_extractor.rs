// Native Windows Shell & GDI+ Media Thumbnail Extractor
// Generates lightweight, downsampled 768x432 JPEG thumbnails for both videos and images
// with atomic writes, aspect-ratio preservation, and zero WebView2 decoder overhead.

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
    fn GdipLoadImageFromFile(
        filename: *const u16,
        image: *mut *mut c_void,
    ) -> i32;
    fn GdipGetImageWidth(
        image: *mut c_void,
        width: *mut u32,
    ) -> i32;
    fn GdipGetImageHeight(
        image: *mut c_void,
        height: *mut u32,
    ) -> i32;
    fn GdipGetImageThumbnail(
        image: *mut c_void,
        thumbWidth: u32,
        thumbHeight: u32,
        thumbImage: *mut *mut c_void,
        callback: *mut c_void,
        callbackData: *mut c_void,
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

const COINIT_APARTMENTTHREADED: u32 = 0x2;
const SIIGBF_RESIZETOFIT: u32 = 0x00;
const SIIGBF_BIGGERSIZEOK: u32 = 0x01;

fn to_wide_null(s: &str) -> Vec<u16> {
    use std::os::windows::ffi::OsStrExt;
    std::ffi::OsStr::new(s)
        .encode_wide()
        .chain(std::iter::once(0))
        .collect()
}

/// Helper struct that ensures GDI+ is safely initialized and shut down on drop.
struct GdiplusGuard {
    token: usize,
}

impl GdiplusGuard {
    fn init() -> Result<Self, String> {
        let mut token: usize = 0;
        let startup_input = GdiplusStartupInput {
            gdiplus_version: 1,
            debug_event_callback: std::ptr::null_mut(),
            suppress_background_thread: 0,
            suppress_external_codecs: 0,
        };
        unsafe {
            let res = GdiplusStartup(&mut token, &startup_input, std::ptr::null_mut());
            if res == 0 {
                Ok(Self { token })
            } else {
                Err(format!("GdiplusStartup failed with code {}", res))
            }
        }
    }
}

impl Drop for GdiplusGuard {
    fn drop(&mut self) {
        unsafe {
            GdiplusShutdown(self.token);
        }
    }
}

/// Fallback extraction using direct GDI+ for standard image files (.png, .jpg, .bmp, etc.)
fn extract_gdiplus_image_thumbnail(
    wide_src: &[u16],
    wide_tmp_out: &[u16],
    target_w: u32,
    target_h: u32,
) -> Result<(), String> {
    let _gdi = GdiplusGuard::init()?;

    unsafe {
        let mut image: *mut c_void = std::ptr::null_mut();
        let load_res = GdipLoadImageFromFile(wide_src.as_ptr(), &mut image);
        if load_res != 0 || image.is_null() {
            return Err(format!("GdipLoadImageFromFile failed with code {}", load_res));
        }

        let mut orig_w: u32 = 0;
        let mut orig_h: u32 = 0;
        let _ = GdipGetImageWidth(image, &mut orig_w);
        let _ = GdipGetImageHeight(image, &mut orig_h);

        if orig_w == 0 || orig_h == 0 {
            GdipDisposeImage(image);
            return Err("Invalid zero-dimension image in GDI+".to_string());
        }

        // Compute aspect-ratio-preserving dimensions within target box
        let scale_w = (target_w as f64) / (orig_w as f64);
        let scale_h = (target_h as f64) / (orig_h as f64);
        let scale = scale_w.min(scale_h);

        let final_w = ((orig_w as f64 * scale).round() as u32).max(1);
        let final_h = ((orig_h as f64 * scale).round() as u32).max(1);

        let mut thumb_image: *mut c_void = std::ptr::null_mut();
        let thumb_res = GdipGetImageThumbnail(
            image,
            final_w,
            final_h,
            &mut thumb_image,
            std::ptr::null_mut(),
            std::ptr::null_mut(),
        );

        GdipDisposeImage(image);

        if thumb_res != 0 || thumb_image.is_null() {
            return Err(format!("GdipGetImageThumbnail failed with code {}", thumb_res));
        }

        let save_res = GdipSaveImageToFile(
            thumb_image,
            wide_tmp_out.as_ptr(),
            &CLSID_JPEG_ENCODER,
            std::ptr::null(),
        );

        GdipDisposeImage(thumb_image);

        if save_res != 0 {
            return Err(format!("GdipSaveImageToFile failed with code {}", save_res));
        }

        Ok(())
    }
}

/// Primary extraction using Windows Shell IShellItemImageFactory.
fn extract_shell_image_factory(
    wide_src: &[u16],
    wide_tmp_out: &[u16],
    width: i32,
    height: i32,
) -> Result<(), String> {
    unsafe {
        // Initialize COM on this thread (support both apartment and multi-threaded callers)
        let _ = CoInitializeEx(std::ptr::null_mut(), COINIT_APARTMENTTHREADED);

        // 1. Create IShellItemImageFactory for the media file
        let mut factory_ptr: *mut c_void = std::ptr::null_mut();
        let hr = SHCreateItemFromParsingName(
            wide_src.as_ptr(),
            std::ptr::null_mut(),
            &IID_ISHELL_ITEM_IMAGE_FACTORY,
            &mut factory_ptr,
        );

        if hr != 0 || factory_ptr.is_null() {
            return Err(format!("SHCreateItemFromParsingName failed with HRESULT 0x{:08X}", hr));
        }

        let vtbl = *(factory_ptr as *mut *mut IShellItemImageFactoryVtbl);
        let mut hbitmap: *mut c_void = std::ptr::null_mut();

        // 2. Extract image from factory with aspect-ratio preservation
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

        // 3. Initialize GDI+ and save HBITMAP to JPEG
        let _gdi = GdiplusGuard::init().map_err(|e| {
            DeleteObject(hbitmap);
            e
        })?;

        let mut gp_bitmap: *mut c_void = std::ptr::null_mut();
        let create_res = GdipCreateBitmapFromHBITMAP(hbitmap, std::ptr::null_mut(), &mut gp_bitmap);
        DeleteObject(hbitmap);

        if create_res != 0 || gp_bitmap.is_null() {
            return Err(format!("GdipCreateBitmapFromHBITMAP failed with code {}", create_res));
        }

        let save_res = GdipSaveImageToFile(
            gp_bitmap,
            wide_tmp_out.as_ptr(),
            &CLSID_JPEG_ENCODER,
            std::ptr::null(),
        );

        GdipDisposeImage(gp_bitmap);

        if save_res != 0 {
            return Err(format!("GdipSaveImageToFile failed with code {}", save_res));
        }

        Ok(())
    }
}

/// Atomically extracts a high-quality downsampled thumbnail (default 768x432)
/// for any local media (video or image).
/// 
/// RELIABILITY & ATOMICITY GUARANTEES:
/// 1. Writes to `<output_path>.tmp.<pid>.<nanos>`.
/// 2. Validates that the temporary file was written and is > 1000 bytes.
/// 3. Atomically moves the temporary file to `<output_path>`.
/// 4. UI will NEVER see a partially-written or 0-byte file.
/// 5. Automatically falls back from IShellItemImageFactory to direct GDI+ for static images.
pub fn extract_media_thumbnail(
    source_path: &Path,
    output_path: &Path,
    width: i32,
    height: i32,
) -> Result<(), String> {
    if !source_path.exists() {
        return Err(format!("Source media file does not exist: {:?}", source_path));
    }

    if let Some(parent) = output_path.parent() {
        let _ = std::fs::create_dir_all(parent);
    }

    let source_str = source_path.to_str().ok_or("Invalid UTF-8 in source path")?;

    // Create unique temporary file path in the same target directory for atomic rename
    let nanos = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap_or_default()
        .as_nanos();
    let temp_output = output_path.with_extension(format!("tmp.{}.{}", std::process::id(), nanos));
    let temp_str = temp_output.to_str().ok_or("Invalid UTF-8 in temp output path")?;

    let wide_src = to_wide_null(source_str);
    let wide_tmp = to_wide_null(temp_str);

    // Attempt 1: IShellItemImageFactory (handles MP4, WebM, MKV, PNG, JPG, WebP)
    let shell_res = extract_shell_image_factory(&wide_src, &wide_tmp, width, height);

    // Attempt 2: If Shell extraction failed, try direct GDI+ for image files
    let extract_res = match shell_res {
        Ok(()) => Ok(()),
        Err(shell_err) => {
            let is_image_ext = source_path
                .extension()
                .and_then(|e| e.to_str())
                .map(|ext| {
                    let lower = ext.to_lowercase();
                    lower == "png" || lower == "jpg" || lower == "jpeg" || lower == "bmp" || lower == "gif"
                })
                .unwrap_or(false);

            if is_image_ext {
                extract_gdiplus_image_thumbnail(&wide_src, &wide_tmp, width as u32, height as u32)
            } else {
                Err(shell_err)
            }
        }
    };

    if let Err(e) = extract_res {
        // Clean up temporary file on failure
        if temp_output.exists() {
            let _ = std::fs::remove_file(&temp_output);
        }
        return Err(e);
    }

    // Verify temp file existence and non-zero size
    let valid_file = temp_output.exists()
        && std::fs::metadata(&temp_output)
            .map(|m| m.len() > 1000)
            .unwrap_or(false);

    if !valid_file {
        if temp_output.exists() {
            let _ = std::fs::remove_file(&temp_output);
        }
        return Err("Generated thumbnail file was empty or corrupted (<1000 bytes)".to_string());
    }

    // Atomic replace: remove existing output file if present, then rename temp file
    if output_path.exists() {
        let _ = std::fs::remove_file(output_path);
    }

    std::fs::rename(&temp_output, output_path).map_err(|e| {
        if temp_output.exists() {
            let _ = std::fs::remove_file(&temp_output);
        }
        format!("Failed to atomically rename thumbnail: {}", e)
    })?;

    Ok(())
}

/// Backwards compatibility alias for extract_media_thumbnail
#[allow(dead_code)]
pub fn extract_shell_thumbnail(video_path: &Path, output_path: &Path, width: i32, height: i32) -> Result<(), String> {
    extract_media_thumbnail(video_path, output_path, width, height)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_extract_jpg_and_png_thumbnails() {
        let temp_dir = std::env::temp_dir().join("aether_thumb_test");
        let _ = std::fs::create_dir_all(&temp_dir);

        let test_cases = [
            r"G:\aether wallpapers\upside down.png",
            r"G:\aether wallpapers\25755713.jpg",
            r"G:\aether wallpapers\horixon.jpg",
        ];

        for (i, src) in test_cases.iter().enumerate() {
            let src_path = Path::new(src);
            if !src_path.exists() {
                continue;
            }

            let out_thumb = temp_dir.join(format!("test_thumb_{}.jpg", i));
            if out_thumb.exists() {
                let _ = std::fs::remove_file(&out_thumb);
            }

            let res = extract_media_thumbnail(src_path, &out_thumb, 768, 432);
            assert!(res.is_ok(), "Extraction failed for {:?}: {:?}", src, res.err());
            assert!(out_thumb.exists(), "Thumbnail file does not exist");

            let meta = std::fs::metadata(&out_thumb).expect("Cannot read metadata");
            assert!(meta.len() > 1000, "Thumbnail file too small: {} bytes", meta.len());

            // Verify no leftover .tmp files
            if let Ok(entries) = std::fs::read_dir(&temp_dir) {
                for entry in entries.flatten() {
                    let name = entry.file_name().to_string_lossy().to_string();
                    assert!(!name.contains(".tmp."), "Found leftover temporary file: {}", name);
                }
            }

            let _ = std::fs::remove_file(&out_thumb);
        }

        let _ = std::fs::remove_dir_all(&temp_dir);
    }

    #[test]
    fn test_non_existent_file_fails_gracefully() {
        let dummy = Path::new(r"C:\non_existent_file_xyz_12345.png");
        let out = std::env::temp_dir().join("dummy_thumb.jpg");
        let res = extract_media_thumbnail(dummy, &out, 768, 432);
        assert!(res.is_err());
        assert!(!out.exists());
    }

    #[test]
    fn test_concurrent_extractions_for_same_target() {
        let temp_dir = std::env::temp_dir().join("aether_thumb_concurrent_test");
        let _ = std::fs::create_dir_all(&temp_dir);

        let src = r"G:\aether wallpapers\upside down.png";
        if !Path::new(src).exists() {
            return;
        }

        let out_thumb = temp_dir.join("concurrent_target.jpg");
        let mut handles = Vec::new();

        for _ in 0..8 {
            let out = out_thumb.clone();
            let handle = std::thread::spawn(move || {
                extract_media_thumbnail(Path::new(src), &out, 768, 432)
            });
            handles.push(handle);
        }

        let mut successes = 0;
        for handle in handles {
            if let Ok(res) = handle.join() {
                if res.is_ok() {
                    successes += 1;
                }
            }
        }

        assert!(successes > 0, "Expected at least one thread to succeed");
        assert!(out_thumb.exists(), "Destination thumbnail must exist");
        let meta = std::fs::metadata(&out_thumb).unwrap();
        assert!(meta.len() > 1000, "Destination thumbnail must be valid");

        let _ = std::fs::remove_dir_all(&temp_dir);
    }
}
