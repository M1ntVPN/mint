import { platform } from "@tauri-apps/plugin-os";

let cached: string | null = null;

export function getPlatform(): string {
  if (cached !== null) return cached;
  try {
    cached = platform();
  } catch {
    cached = "windows";
  }
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
