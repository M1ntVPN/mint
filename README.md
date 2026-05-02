<div align="center">

<br>

# 🍃 &nbsp; Mint VPN

**A modern, polished VPN desktop client for Windows.**
<br>
<sub>Tauri 2 · React 19 · sing-box · split-tunneling · killswitch</sub>

<br>

[![Build](https://github.com/M1ntVPN/mint/actions/workflows/build.yml/badge.svg)](https://github.com/M1ntVPN/mint/actions/workflows/build.yml)
[![Tauri 2](https://img.shields.io/badge/Tauri-2-24C8DB?logo=tauri&logoColor=white)](https://tauri.app)
[![React 19](https://img.shields.io/badge/React-19-61dafb?logo=react&logoColor=white)](https://react.dev)
[![Platform](https://img.shields.io/badge/platform-Windows%2010%2B-0078D6?logo=windows&logoColor=white)](#installation)
[![License: MIT](https://img.shields.io/badge/License-MIT-brightgreen.svg)](#license)

<br>

</div>

---

## ✨ Features

|   | |
|---|---|
| 🚀 | **Native Windows desktop client** — frameless dark UI, custom title bar, system tray, autostart, deep-link `mint://import` |
| 🛡️ | **Real VPN core** — bundles [sing-box](https://github.com/SagerNet/sing-box) sidecar. VLESS, VMess, Trojan, Shadowsocks, Reality, Hysteria 2, WireGuard |
| 🧩 | **Split-tunneling** — pick installed apps from a real Windows scan or live processes; per-app, per-folder, per-CIDR, per-domain rules |
| 🔒 | **Killswitch** — Windows Firewall blocks all egress unless it goes through sing-box. Auto-toggled with the connection |
| 🛰️ | **System proxy** — HKCU registry edits, no admin required. Cleanly restored on disconnect or quit |
| 📥 | **Subscription import** — share-URI lists, base64 blobs, Clash YAML, sing-box JSON, V2RayN arrays, plain WireGuard `.conf`. Reads `subscription-userinfo` headers (used / total / expire) |
| 🎨 | **Polished UX** — iOS-style fold animations, live RTT ping with Wi-Fi-style signal icons, traffic quota bar, multi-hop card, custom backgrounds |

<br>

## 📦 Installation

Download the latest **`Mint VPN_<version>_x64-setup.exe`** from the latest [CI build artifacts](https://github.com/M1ntVPN/mint/actions/workflows/build.yml) (or the [Releases](https://github.com/M1ntVPN/mint/releases) page once a tag is published).

Run the installer:

1. Choose installer language — **English** or **Russian**.
2. Accept UAC (the installer needs `Program Files` write access).
3. Launch from Start menu → **Mint VPN**.

> A **portable** variant is also published per build as `Mint VPN-Windows-Portable-x64.zip` — extract anywhere, run `Mint VPN.exe`. No installer, no UAC, no Start menu entry. Stores config in `%APPDATA%\com.mint.app\`.

**System requirements:** Windows 10 (1809+) or Windows 11, x64.

<br>

## 🚀 Quick start

1. Open Mint VPN.
2. **Подписки** tab → paste a subscription URL or share URI → import.
3. Servers populate the dashboard. Click any to set as active.
4. Press the big connect button. System proxy and killswitch toggle automatically.

<br>

## 🛠️ Tech stack

|     Layer      |    Tech    |
| -------------- | ---------- |
| Native shell   | **Tauri 2** (Rust) |
| UI             | **React 19**, framer-motion 12, Tailwind v4, lucide-react, zustand |
| VPN engine     | **sing-box** sidecar (bundled, pinned version) |
| Routing helpers | WinINet (sysproxy), `netsh advfirewall` (killswitch), `winreg` (autostart) |
| Build          | Vite 7, TypeScript 5.9, Cargo (Rust stable) |
| Packaging      | NSIS — per-machine, EN/RU language selector, lzma compression |

<br>

## 💻 Development

You'll need:

- **Node 20+** &nbsp;·&nbsp; **Rust stable** (`rustup default stable`)
- **Visual Studio Build Tools 2022** with the *Desktop development with C++* workload
- Tauri prerequisites — [tauri.app/start/prerequisites](https://tauri.app/start/prerequisites/)

```bash
git clone https://github.com/M1ntVPN/mint.git
cd mint
npm install
npm run tauri:dev          # dev with hot-reload
```

Production build:

```bash
npm run tauri:build        # → src-tauri/target/release/bundle/nsis/Mint VPN_*-setup.exe
```

> For full VPN-mode dev you'll also need a sing-box sidecar binary in `src-tauri/binaries/`. CI downloads it automatically; for local builds, grab a release from [SagerNet/sing-box](https://github.com/SagerNet/sing-box/releases) and rename it to `sing-box-x86_64-pc-windows-msvc.exe`.

<br>

## 🗂️ Project layout

```
mint/
├── src/                     # React UI (TS, runs inside Tauri webview)
│   ├── components/          #   Visual primitives + screen-level views
│   ├── store/               #   Zustand stores — servers, folders, subscriptions, tunneling, settings
│   ├── engine/              #   sing-box config builder, Clash API client, IPC engine wrapper
│   ├── utils/               #   Helpers — URI parsing, ping, app brand detection, exe icons
│   ├── assets/              #   Static images
│   └── theme.tsx            #   Theme + accent palette context
│
├── src-tauri/               # Rust shell
│   ├── src/
│   │   ├── lib.rs           #   App entrypoint, tray, window lifecycle, graceful shutdown
│   │   ├── singbox.rs       #   Sidecar lifecycle (spawn / stop / orphan-sweep)
│   │   ├── sysproxy.rs      #   Windows system proxy snapshot + restore
│   │   ├── killswitch.rs    #   Windows Firewall rule management
│   │   ├── sysapps.rs       #   Installed-app + live-process scan
│   │   └── commands.rs      #   #[tauri::command] glue
│   ├── icons/               #   App + tray icon set
│   └── tauri.conf.json      #   Bundle, window, NSIS settings
│
└── .github/workflows/       # CI — Windows installer + portable build on every push
```

<br>

## 🧠 How it works

```
        ┌───────────────────────── React 19 UI ─────────────────────────┐
        │   stores (zustand)  →  engine.ts  →  configBuilder.ts         │
        └────────────────────────────┬──────────────────────────────────┘
                                     │  Tauri IPC (invoke / event)
                                     ▼
        ┌──────────────────────── Rust shell ───────────────────────────┐
        │   commands.rs · singbox.rs · sysproxy.rs                      │
        │   killswitch.rs · sysapps.rs · lib.rs (tray, deep-link, quit) │
        └────────────────────────────┬──────────────────────────────────┘
                                     │  stdin/stdout, signals
                                     ▼
                          ┌─────────────────────┐
                          │   sing-box.exe      │
                          │   (bundled sidecar) │
                          └─────────────────────┘
```

The React UI never touches the OS directly — every privileged operation goes through a `#[tauri::command]` in the Rust shell. Sing-box runs as a child process; its stdout is piped back into the UI as a live log feed.

<br>

## 📄 License

[MIT](https://opensource.org/licenses/MIT) © 2026 M1ntVPN.

<br>

## 🙏 Acknowledgements

- [sing-box](https://github.com/SagerNet/sing-box) — the proxy engine inside.
- [Tauri](https://tauri.app) — the native shell.
- [WinTun](https://www.wintun.net) — TUN driver for Windows.
- [Hiddify](https://github.com/hiddify/hiddify-app) — design and feature inspiration.

<br>

<div align="center">
<sub>Built with ☕ on Tauri 2.</sub>
</div>
