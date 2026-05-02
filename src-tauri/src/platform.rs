#![cfg(windows)]

use tauri::image::Image;
use tauri::{Runtime, WebviewWindow};

pub fn refresh_taskbar_icon<R: Runtime>(window: &WebviewWindow<R>, png_bytes: &[u8]) {
    use std::ffi::c_void;
    use windows_sys::Win32::Foundation::HWND;
    use windows_sys::Win32::UI::WindowsAndMessaging::{
        CreateIcon, DestroyIcon, SendMessageW, SetClassLongPtrW, GCLP_HICON, GCLP_HICONSM,
        ICON_BIG, ICON_SMALL, WM_SETICON,
    };

    let Ok(hwnd_raw) = window.hwnd() else {
        return;
    };
    let hwnd_isize = hwnd_raw.0 as isize;
    if hwnd_isize == 0 {
        return;
    }
    let hwnd: HWND = hwnd_isize as HWND;

    let Ok(img) = Image::from_bytes(png_bytes) else {
        return;
    };
    let width = img.width() as i32;
    let height = img.height() as i32;
    if width <= 0 || height <= 0 {
        return;
    }
    let rgba = img.rgba();
    if rgba.len() != (width * height * 4) as usize {
        return;
    }

    let mut bgra = Vec::with_capacity(rgba.len());
    for chunk in rgba.chunks_exact(4) {
        bgra.extend_from_slice(&[chunk[2], chunk[1], chunk[0], chunk[3]]);
    }

    unsafe {
        let hicon = CreateIcon(
            std::ptr::null_mut(),
            width,
            height,
            1,
            32,
            std::ptr::null(),
            bgra.as_ptr(),
        );
        if hicon.is_null() {
            return;
        }
        let _ = SendMessageW(hwnd, WM_SETICON, ICON_BIG as usize, hicon as isize);
        let _ = SendMessageW(hwnd, WM_SETICON, ICON_SMALL as usize, hicon as isize);
        for class_index in [GCLP_HICON, GCLP_HICONSM] {
            let prev = SetClassLongPtrW(hwnd, class_index, hicon as isize) as *mut c_void;
            if !prev.is_null() && prev as isize != hicon as isize {
                let _ = DestroyIcon(prev as _);
            }
        }
    }
}
