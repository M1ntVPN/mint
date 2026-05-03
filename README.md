<div align="center">

<br>

<img src=".github/assets/logo.png" width="140" alt="Mint VPN" />

<br>

# Mint VPN

### Premium VPN client for Windows

<br>

[![Version](https://img.shields.io/badge/version-0.2.4-8b5cf6?style=for-the-badge)](https://github.com/M1ntVPN/mint/releases)
[![Download](https://img.shields.io/badge/Download-Windows%20x64-0078D6?style=for-the-badge&logo=windows&logoColor=white)](https://github.com/M1ntVPN/mint/actions/workflows/build.yml)
[![License](https://img.shields.io/badge/license-MIT-10b981?style=for-the-badge)](LICENSE)

<br>

[![Tauri 2](https://img.shields.io/badge/Tauri_2-24C8DB?style=flat-square&logo=tauri&logoColor=white)](https://tauri.app)
[![React 19](https://img.shields.io/badge/React_19-61dafb?style=flat-square&logo=react&logoColor=black)](https://react.dev)
[![TypeScript](https://img.shields.io/badge/TypeScript-3178C6?style=flat-square&logo=typescript&logoColor=white)](https://www.typescriptlang.org)
[![Rust](https://img.shields.io/badge/Rust-000000?style=flat-square&logo=rust&logoColor=white)](https://www.rust-lang.org)
[![Tailwind](https://img.shields.io/badge/Tailwind_v4-06B6D4?style=flat-square&logo=tailwindcss&logoColor=white)](https://tailwindcss.com)
[![sing-box](https://img.shields.io/badge/sing--box-1.10-FF6B35?style=flat-square)](https://github.com/SagerNet/sing-box)

<br>

<img src=".github/assets/dashboard.png" alt="Mint VPN Dashboard" width="820" />

<br>
<br>

</div>

## Features

<table>
  <tr>
    <td width="60" align="center">&#x1F6E1;&#xFE0F;</td>
    <td><b>Multi-protocol VPN engine</b><br>Powered by <a href="https://github.com/SagerNet/sing-box">sing-box</a>. Supports <b>VLESS</b>, <b>VMess</b>, <b>Trojan</b>, <b>Shadowsocks</b>, and <b>Reality</b></td>
  </tr>
  <tr>
    <td align="center">&#x1F9E9;</td>
    <td><b>Split tunneling</b><br>Route traffic per-app, per-folder, or per-CIDR. Pick from installed apps or live processes</td>
  </tr>
  <tr>
    <td align="center">&#x1F512;</td>
    <td><b>Kill switch</b><br>Windows Firewall blocks all egress unless routed through the VPN tunnel</td>
  </tr>
  <tr>
    <td align="center">&#x1F310;</td>
    <td><b>Multi-hop routing</b><br>Chain multiple servers for an extra layer of privacy</td>
  </tr>
  <tr>
    <td align="center">&#x1F4E5;</td>
    <td><b>Subscription import</b><br>Paste a share-URI list, base64 blob, Clash YAML, or sing-box JSON config</td>
  </tr>
  <tr>
    <td align="center">&#x1F3A8;</td>
    <td><b>Polished UI</b><br>Frameless dark window, iOS-style animations, live RTT ping, traffic stats, accent themes</td>
  </tr>
  <tr>
    <td align="center">&#x1F504;</td>
    <td><b>Auto-updates</b><br>Built-in updater checks for new releases and installs them in-app</td>
  </tr>
  <tr>
    <td align="center">&#x1F4BB;</td>
    <td><b>System tray &amp; autostart</b><br>Minimize to tray, launch on Windows startup</td>
  </tr>
</table>

<br>

## Download

> **System requirements:** Windows 10 (1809+) or Windows 11, x64

<div align="center">

### [&#x2B07;&#xFE0F;&ensp;Download latest installer](https://github.com/M1ntVPN/mint/actions/workflows/build.yml)

Download **`Mint.VPN_x64-setup.exe`** from the latest successful CI build artifacts.

A portable **`Mint VPN-Windows-Portable-x64.zip`** is also available.

</div>

<br>

## Quick start

```
1.  Open Mint VPN
2.  Go to Profiles  ->  paste a subscription URL  ->  Import
3.  Select a server from the list
4.  Hit Connect
```

<br>

## Tech stack

| Layer | Technology |
|:------|:-----------|
| Native shell | **Tauri 2** (Rust) |
| UI | **React 19** &middot; Framer Motion &middot; Tailwind v4 &middot; Zustand |
| VPN engine | **sing-box** sidecar |
| Build | Vite 7 &middot; TypeScript 5.9 &middot; Cargo |
| Packaging | NSIS installer &mdash; EN / RU language selector, LZMA compression |

<br>

## Development

```bash
# Clone
git clone https://github.com/M1ntVPN/mint.git
cd mint

# Install dependencies
npm install

# Development mode
npm run tauri:dev

# Production build
npm run tauri:build
# -> src-tauri/target/release/bundle/nsis/Mint.VPN_*_x64-setup.exe
```

**Prerequisites:** Node 20+, Rust stable, [Tauri prerequisites](https://tauri.app/start/prerequisites/)

<br>

## Project structure

```
mint/
├── src/                  # React frontend
│   ├── components/       # UI components (Dashboard, Sidebar, Settings ...)
│   ├── store/            # Zustand state (servers, tunneling, settings)
│   ├── engine/           # sing-box integration layer
│   └── assets/           # Backgrounds & textures
├── src-tauri/            # Rust backend (Tauri commands, tray, firewall)
├── .github/workflows/    # CI — build & publish artifacts
└── package.json
```

<br>

## License

[MIT](https://opensource.org/licenses/MIT) &copy; 2025 &ndash; present M1ntVPN

<br>

<div align="center">

<sub>Built with Tauri 2 &middot; Powered by sing-box</sub>

</div>
