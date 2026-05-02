import { useEffect, useState } from "react";
import { isMobile as isMobilePlatform } from "./platform";

// One source of truth for "should we render the mobile layout":
// - Tauri reports platform() === "android" / "ios" → always mobile.
// - Otherwise we fall back to a viewport check so the responsive layout
//   also works in `vite` dev / a desktop browser preview.
export function useIsMobile(): boolean {
  const [mobile, setMobile] = useState<boolean>(() => {
    if (typeof window === "undefined") return false;
    if (isMobilePlatform()) return true;
    return window.matchMedia("(max-width: 720px)").matches;
  });

  useEffect(() => {
    if (isMobilePlatform()) {
      setMobile(true);
      return;
    }
    const mq = window.matchMedia("(max-width: 720px)");
    const onChange = (e: MediaQueryListEvent) => setMobile(e.matches);
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);

  return mobile;
}
