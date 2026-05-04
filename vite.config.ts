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
  //   Windows  -> Chromium (WebView2, evergreen)
  //   Android  -> Android System WebView (frequently older — many users
  //               are stuck on whatever ships with their Android build,
  //               which can be Chromium 90-something)
  //   macOS/iOS-> Safari/WebKit
  //   Linux    -> WebKitGTK
  //
  // For Android we deliberately target older Chromium and feed the CSS
  // through Lightning CSS so that modern features Tailwind v4 emits
  // (`@layer`, `oklch()`, `color-mix()`, CSS nesting) get either
  // hoisted (via the postcss-cascade-layers plugin in postcss.config.mjs)
  // or lowered to widely-supported syntax. Without this, on older
  // Android System WebViews every Tailwind utility silently disappears
  // and the UI renders unstyled.
  build: {
    target: (() => {
      const p = process.env.TAURI_ENV_PLATFORM;
      if (p === "windows") return "chrome105";
      if (p === "android") return "chrome90";
      return "safari13";
    })(),
    cssTarget:
      process.env.TAURI_ENV_PLATFORM === "android" ? "chrome90" : undefined,
    cssMinify:
      process.env.TAURI_ENV_PLATFORM === "android" ? "lightningcss" : undefined,
    minify: !process.env.TAURI_ENV_DEBUG ? "esbuild" : false,
    sourcemap: !!process.env.TAURI_ENV_DEBUG,
  },
});
