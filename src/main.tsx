import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "@fontsource-variable/inter";
import "@fontsource-variable/jetbrains-mono";
import "./index.css";
import App from "./App";
import { ThemeProvider } from "./theme";

if (typeof window !== "undefined") {
  window.addEventListener(
    "contextmenu",
    (e) => {
      e.preventDefault();
    },
    { capture: true }
  );

  window.addEventListener(
    "keydown",
    (e) => {
      const k = e.key.toLowerCase();
      const ctrl = e.ctrlKey || e.metaKey;

      if (
        e.key === "F1" ||
        e.key === "F3" ||
        e.key === "F5" ||
        e.key === "F6" ||
        e.key === "F7"
      ) {
        e.preventDefault();
      }

      if (
        !import.meta.env.DEV &&
        (e.key === "F12" || (ctrl && e.shiftKey && (k === "i" || k === "j")))
      ) {
        e.preventDefault();
      }

      if (ctrl && (k === "r" || (e.shiftKey && k === "r"))) {
        e.preventDefault();
      }

      if (ctrl && (k === "p" || k === "s" || k === "u" || k === "g")) {
        e.preventDefault();
      }

      if (ctrl && k === "f") {
        e.preventDefault();
      }
    },
    { capture: true }
  );

  document.addEventListener("selectstart", (e) => {
    const target = e.target as HTMLElement | null;
    if (!target) return;
    const tag = target.tagName;
    const editable =
      tag === "INPUT" ||
      tag === "TEXTAREA" ||
      target.isContentEditable ||
      target.closest("[data-allow-select]") !== null;
    if (!editable) e.preventDefault();
  });
}

function mount() {
  createRoot(document.getElementById("root")!).render(
    <StrictMode>
      <ThemeProvider>
        <App />
      </ThemeProvider>
    </StrictMode>
  );
}

async function waitForFonts() {
  if (typeof document === "undefined") return;
  const fontSet = (document as Document & { fonts?: FontFaceSet }).fonts;
  if (!fontSet) return;
  try {
    await Promise.race([
      Promise.all([
        fontSet.load("400 14px \"Inter Variable\""),
        fontSet.load("500 14px \"Inter Variable\""),
        fontSet.load("600 14px \"Inter Variable\""),
        fontSet.load("700 14px \"Inter Variable\""),
        fontSet.load("400 14px \"JetBrains Mono Variable\""),
        fontSet.ready,
      ]),
      new Promise<void>((resolve) => setTimeout(resolve, 800)),
    ]);
  } catch {
  }
}

waitForFonts().then(mount);
