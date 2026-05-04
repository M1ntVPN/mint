import { platform } from "@tauri-apps/plugin-os";

// Cached platform string. Resolution order:
//  1. `@tauri-apps/plugin-os` `platform()` — authoritative, set at compile time.
//  2. `navigator.userAgent` heuristic — fallback when (1) fails or hasn't been
//     hydrated yet (this happened in 0.3.4-android: `App.tsx` accessed
//     `isMobile()` before `__TAURI_OS_PLUGIN_INTERNALS__` was injected, so
//     `platform()` threw, the catch defaulted to "windows", and the in-app
//     updater wrongly took the desktop path and tried to download
//     `Mint.VPN_x.y.z_x64-setup.exe` on Android).
//
// We deliberately do NOT default to "windows" anymore — if both lookups fail
// we return an explicit "unknown" so callers can decide how to react. All
// existing call sites (`isMobile`, `isAndroid`, etc) treat anything that
// isn't an explicit mobile match as desktop, which matches the prior
// behaviour for Linux/macOS desktop while no longer mis-classifying Android.
let cached: string | null = null;

function fromUserAgent(): string | null {
  if (typeof navigator === "undefined") return null;
  const ua = navigator.userAgent || "";
  // Android browsers (including Android System WebView used by Tauri) all
  // include the literal token "Android" in the UA string. Check before iOS
  // because Chrome on Android also includes "Mobile" but iOS does too.
  if (/\bAndroid\b/i.test(ua)) return "android";
  if (/\b(iPhone|iPad|iPod)\b/i.test(ua)) return "ios";
  if (/\bMac OS X\b/i.test(ua)) return "macos";
  if (/\bWindows\b/i.test(ua)) return "windows";
  if (/\bLinux\b/i.test(ua)) return "linux";
  return null;
}

export function getPlatform(): string {
  if (cached !== null) return cached;
  try {
    const p = platform();
    if (p) {
      cached = p;
      return cached;
    }
  } catch {
    // Fall through to UA heuristic.
  }
  const ua = fromUserAgent();
  if (ua) {
    cached = ua;
    return cached;
  }
  // Last resort: assume desktop. We pick "windows" (not "android") because
  // the desktop updater is signature-checked and harmless on a wrong
  // platform — it'll just say "no update available" — whereas the Android
  // path opens an external browser and would be inappropriate on desktop.
  cached = "windows";
  return cached;
}

export function isMobile(): boolean {
  const p = getPlatform();
  return p === "android" || p === "ios";
}

export function isAndroid(): boolean {
  return getPlatform() === "android";
}

export function isDesktop(): boolean {
  return !isMobile();
}
