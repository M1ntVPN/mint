<div align="center">

<br>

<picture>
  <img src=".github/assets/logo.png" width="128" alt="Mint VPN" />
</picture>

<br>
<br>

<h1>Mint VPN</h1>

<h4>Fast. Private. Beautiful.<br>A premium VPN client for Windows.</h4>

<br>

<a href="https://getmint.club">
  <img src="https://img.shields.io/badge/Website-getmint.club-8b5cf6?style=for-the-badge&logo=googlechrome&logoColor=white" alt="Website" />
</a>&nbsp;
<a href="https://github.com/M1ntVPN/mint/actions/workflows/build.yml">
  <img src="https://img.shields.io/badge/Download-Windows%20x64-0078D6?style=for-the-badge&logo=windows11&logoColor=white" alt="Download" />
</a>&nbsp;
<a href="https://github.com/M1ntVPN/mint/releases">
  <img src="https://img.shields.io/github/v/release/M1ntVPN/mint?style=for-the-badge&color=10b981&label=Release" alt="Release" />
</a>

<br>
<br>

<a href="https://tauri.app"><img src="https://img.shields.io/badge/Tauri_2-24C8DB?style=flat-square&logo=tauri&logoColor=white" alt="Tauri 2" /></a>
<a href="https://react.dev"><img src="https://img.shields.io/badge/React_19-61dafb?style=flat-square&logo=react&logoColor=black" alt="React 19" /></a>
<a href="https://www.typescriptlang.org"><img src="https://img.shields.io/badge/TypeScript-3178C6?style=flat-square&logo=typescript&logoColor=white" alt="TypeScript" /></a>
<a href="https://www.rust-lang.org"><img src="https://img.shields.io/badge/Rust-000000?style=flat-square&logo=rust&logoColor=white" alt="Rust" /></a>
<a href="https://tailwindcss.com"><img src="https://img.shields.io/badge/Tailwind_v4-06B6D4?style=flat-square&logo=tailwindcss&logoColor=white" alt="Tailwind" /></a>
<a href="https://github.com/SagerNet/sing-box"><img src="https://img.shields.io/badge/sing--box-FF6B35?style=flat-square" alt="sing-box" /></a>
<img src="https://img.shields.io/badge/license-MIT-22c55e?style=flat-square" alt="MIT License" />

<br>
<br>

<img src=".github/assets/dashboard.png" alt="Mint VPN Dashboard" width="820" />

</div>

<br>

---

<br>

## Why Mint?

<table>
<tr>
<td width="50%" valign="top">

### &#x1F6E1;&#xFE0F; Multi-Protocol Engine
Powered by [sing-box](https://github.com/SagerNet/sing-box) core.
Supports **VLESS** &middot; **VMess** &middot; **Trojan** &middot; **Shadowsocks** &middot; **Reality** out of the box.

### &#x1F9E9; Smart Split Tunneling
Route traffic per-app, per-folder, or per-CIDR.
Pick from installed apps or live running processes.

### &#x1F512; Kill Switch
Hardware-level protection &mdash; Windows Firewall blocks **all** egress unless it goes through the VPN tunnel.

### &#x1F310; Multi-Hop
Chain multiple servers for an additional layer of anonymity.

</td>
<td width="50%" valign="top">

### &#x1F4E5; Universal Import
Paste a share-URI list, Base64 blob, Clash YAML, or native sing-box JSON &mdash; everything auto-detected.

### &#x1F3A8; Premium UI / UX
Frameless dark window, iOS-style fold animations, live RTT ping, traffic quota bar, customizable accent themes.

### &#x1F504; Auto Updates
Built-in updater checks for new releases and installs seamlessly in-app.

### &#x1F4BB; System Integration
Minimize to system tray, launch on Windows startup, native notifications.

</td>
</tr>
</table>

<br>

## Download

<div align="center">

> **Windows 10** (1809+) or **Windows 11** &mdash; x64

<br>

<a href="https://getmint.club">
  <img src="https://img.shields.io/badge/&#x1F310;%20Website-getmint.club-8b5cf6?style=for-the-badge" alt="Website" />
</a>
&emsp;
<a href="https://github.com/M1ntVPN/mint/actions/workflows/build.yml">
  <img src="https://img.shields.io/badge/&#x2B07;&#xFE0F;%20Installer-NSIS%20Setup%20(.exe)-0078D6?style=for-the-badge" alt="Installer" />
</a>
&emsp;
<a href="https://github.com/M1ntVPN/mint/actions/workflows/build.yml">
  <img src="https://img.shields.io/badge/&#x1F4E6;%20Portable-ZIP%20Archive-6366f1?style=for-the-badge" alt="Portable" />
</a>

<br>
<br>

<sub>Download artifacts from the latest successful CI build, or visit <a href="https://getmint.club"><b>getmint.club</b></a></sub>

</div>

<br>

## Quick Start

```
1.  Launch Mint VPN
2.  Profiles  →  paste subscription URL  →  Import
3.  Pick a server
4.  Connect
```

<br>

## Tech Stack

| Layer | Technology |
|:--|:--|
| **Desktop shell** | [Tauri 2](https://tauri.app) &mdash; Rust |
| **Frontend** | [React 19](https://react.dev) &middot; Framer Motion &middot; Tailwind v4 &middot; Zustand |
| **VPN core** | [sing-box](https://github.com/SagerNet/sing-box) sidecar |
| **Tooling** | Vite 7 &middot; TypeScript 5.9 &middot; Cargo |
| **Installer** | NSIS &mdash; EN / RU language selector, LZMA compression |

<br>

## Development

```bash
git clone https://github.com/M1ntVPN/mint.git && cd mint
npm install          # install frontend deps
npm run tauri:dev    # development mode with hot reload
npm run tauri:build  # production build → src-tauri/target/release/bundle/nsis/
```

**Prerequisites:** Node 20+, Rust stable, [Tauri v2 prerequisites](https://tauri.app/start/prerequisites/)

<br>

## Project Layout

```
mint/
├── src/                  # React UI
│   ├── components/       # Dashboard, Sidebar, Settings, Tunneling …
│   ├── store/            # Zustand stores (servers, settings, tunneling)
│   ├── engine/           # sing-box IPC layer
│   └── assets/           # Backgrounds, textures
├── src-tauri/            # Rust backend — Tauri commands, tray, firewall
├── .github/workflows/    # CI — build & publish
└── package.json
```

<br>

## License

[MIT](https://opensource.org/licenses/MIT) &copy; 2025 M1ntVPN

<br>

<div align="center">

<a href="https://getmint.club"><b>getmint.club</b></a>

<br>
<br>

<sub>Built with <a href="https://tauri.app">Tauri</a> &middot; Powered by <a href="https://github.com/SagerNet/sing-box">sing-box</a></sub>

</div>
