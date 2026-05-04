import path from "path";
import { fileURLToPath } from "url";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const host = process.env.TAURI_DEV_HOST;

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "src"),
    },
  },
  // Tauri expects a fixed port, fail if that port is not available.
  clearScreen: false,
  server: {
    port: 1420,
    strictPort: true,
    host: host || false,
    hmr: host
      ? {
          protocol: "ws",
          host,
          port: 1421,
        }
      : undefined,
    watch: {
      // Tell Vite to ignore Tauri side files.
      ignored: ["**/src-tauri/**"],
    },
  },
  // Tauri's WebView differs per platform:
  //   Windows  -> Chromium (WebView2)
  //   Android  -> Chromium (Android System WebView)
  //   macOS/iOS-> Safari/WebKit
  //   Linux    -> WebKitGTK
  // Targeting `safari13` for Android collapses Tailwind v4 (which emits
  // `@layer`, CSS nesting, container queries) — those features need
  // Chromium 105+. Map Chromium platforms to `chrome105` and only fall
  // back to `safari13` for actual WebKit-based targets.
  build: {
    target: (() => {
      const p = process.env.TAURI_ENV_PLATFORM;
      if (p === "windows" || p === "android") return "chrome105";
      return "safari13";
    })(),
    minify: !process.env.TAURI_ENV_DEBUG ? "esbuild" : false,
    sourcemap: !!process.env.TAURI_ENV_DEBUG,
  },
});
