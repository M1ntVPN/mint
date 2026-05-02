
export type BrandHint = { brand?: string; brandColor?: string };

const TABLE: Record<string, BrandHint> = {
  firefox: { brand: "firefoxbrowser", brandColor: "FF7139" },
  "firefox-esr": { brand: "firefoxbrowser", brandColor: "FF7139" },
  chrome: { brand: "googlechrome", brandColor: "4285F4" },
  "google-chrome": { brand: "googlechrome", brandColor: "4285F4" },
  "google-chrome-stable": { brand: "googlechrome", brandColor: "4285F4" },
  chromium: { brand: "chromium", brandColor: "4285F4" },
  "chromium-browser": { brand: "chromium", brandColor: "4285F4" },
  brave: { brand: "brave", brandColor: "FB542B" },
  "brave-browser": { brand: "brave", brandColor: "FB542B" },
  msedge: { brand: "microsoftedge", brandColor: "0078D7" },
  "microsoft-edge": { brand: "microsoftedge", brandColor: "0078D7" },
  opera: { brand: "opera", brandColor: "FF1B2D" },
  vivaldi: { brand: "vivaldi", brandColor: "EF3939" },
  safari: { brand: "safari", brandColor: "006CFF" },
  tor: { brand: "torbrowser", brandColor: "7D4698" },
  "tor-browser": { brand: "torbrowser", brandColor: "7D4698" },
  yandex: { brand: "yandex", brandColor: "FFCC00" },

  telegram: { brand: "telegram", brandColor: "26A5E4" },
  "telegram-desktop": { brand: "telegram", brandColor: "26A5E4" },
  discord: { brand: "discord", brandColor: "5865F2" },
  slack: { brand: "slack", brandColor: "4A154B" },
  teams: { brand: "microsoftteams", brandColor: "6264A7" },
  "ms-teams": { brand: "microsoftteams", brandColor: "6264A7" },
  zoom: { brand: "zoom", brandColor: "2D8CFF" },
  skype: { brand: "skype", brandColor: "00AFF0" },
  whatsapp: { brand: "whatsapp", brandColor: "25D366" },
  signal: { brand: "signal", brandColor: "3A76F0" },
  "signal-desktop": { brand: "signal", brandColor: "3A76F0" },
  thunderbird: { brand: "thunderbird", brandColor: "0A84FF" },
  viber: { brand: "viber", brandColor: "7360F2" },
  element: { brand: "element", brandColor: "0DBD8B" },

  spotify: { brand: "spotify", brandColor: "1DB954" },
  vlc: { brand: "vlcmediaplayer", brandColor: "FF8800" },
  obs: { brand: "obsstudio", brandColor: "9CA3AF" },
  obs64: { brand: "obsstudio", brandColor: "9CA3AF" },
  "obs-studio": { brand: "obsstudio", brandColor: "9CA3AF" },

  steam: { brand: "steam", brandColor: "9CA3AF" },
  "steam-runtime": { brand: "steam", brandColor: "9CA3AF" },
  "battle.net": { brand: "battledotnet", brandColor: "148EFF" },
  epicgameslauncher: { brand: "epicgames", brandColor: "313131" },
  origin: { brand: "ea", brandColor: "FF4747" },
  riotclientservices: { brand: "riotgames", brandColor: "D32936" },
  minecraft: { brand: "minecraft", brandColor: "62B47A" },
  "minecraft-launcher": { brand: "minecraft", brandColor: "62B47A" },
  steamwebhelper: { brand: "steam", brandColor: "9CA3AF" },

  code: { brand: "visualstudiocode", brandColor: "007ACC" },
  "code-oss": { brand: "visualstudiocode", brandColor: "007ACC" },
  "vscode": { brand: "visualstudiocode", brandColor: "007ACC" },
  cursor: { brand: "cursor", brandColor: "EFEFEF" },
  webstorm: { brand: "webstorm", brandColor: "07C3F2" },
  pycharm: { brand: "pycharm", brandColor: "21D789" },
  intellij: { brand: "intellijidea", brandColor: "FE315D" },
  "intellij-idea": { brand: "intellijidea", brandColor: "FE315D" },
  goland: { brand: "goland", brandColor: "00ACD7" },
  rustrover: { brand: "rust", brandColor: "F74C00" },
  androidstudio: { brand: "androidstudio", brandColor: "3DDC84" },
  sublime: { brand: "sublimetext", brandColor: "FF9800" },
  "sublime-text": { brand: "sublimetext", brandColor: "FF9800" },
  "sublime_text": { brand: "sublimetext", brandColor: "FF9800" },
  atom: { brand: "atom", brandColor: "66595C" },
  vim: { brand: "vim", brandColor: "019733" },
  nvim: { brand: "neovim", brandColor: "57A143" },
  "neovim-qt": { brand: "neovim", brandColor: "57A143" },
  emacs: { brand: "gnuemacs", brandColor: "7F5AB6" },
  bash: { brand: "gnubash", brandColor: "FFFFFF" },
  zsh: { brand: "zsh", brandColor: "FFFFFF" },
  fish: { brand: "fishshell", brandColor: "34C5B8" },
  alacritty: { brand: "alacritty", brandColor: "F46D01" },
  kitty: { brand: "kittycat", brandColor: "FFFFFF" },
  "windows-terminal": { brand: "windowsterminal", brandColor: "4D4D4D" },
  wezterm: { brand: "wezterm", brandColor: "4E49EE" },
  podman: { brand: "podman", brandColor: "892CA0" },
  docker: { brand: "docker", brandColor: "2496ED" },
  postman: { brand: "postman", brandColor: "FF6C37" },
  insomnia: { brand: "insomnia", brandColor: "4000BF" },
  bruno: { brand: "bruno", brandColor: "FBCD0E" },
  notion: { brand: "notion", brandColor: "FFFFFF" },
  obsidian: { brand: "obsidian", brandColor: "7C3AED" },
  figma: { brand: "figma", brandColor: "F24E1E" },
  github: { brand: "github", brandColor: "FFFFFF" },
  githubdesktop: { brand: "github", brandColor: "FFFFFF" },
  "github-desktop": { brand: "github", brandColor: "FFFFFF" },
  gitkraken: { brand: "gitkraken", brandColor: "179287" },
  gitlab: { brand: "gitlab", brandColor: "FCA121" },

  nautilus: { brand: "gnome", brandColor: "4A86CF" },
  "org.gnome.nautilus": { brand: "gnome", brandColor: "4A86CF" },
  dolphin: { brand: "kde", brandColor: "1D99F3" },
  thunar: { brand: "xfce", brandColor: "31AEEC" },
  files: { brand: "files", brandColor: "FFFFFF" },
  explorer: { brand: "windows", brandColor: "0078D7" },
  finder: { brand: "macos", brandColor: "FFFFFF" },
};

function normalize(s: string): string {
  return s.toLowerCase().replace(/\.(exe|appimage|app)$/, "").replace(/^\.\//, "");
}

export function brandFor(...candidates: (string | undefined | null)[]): BrandHint {
  for (const c of candidates) {
    if (!c) continue;
    const k = normalize(c);
    if (TABLE[k]) return TABLE[k];
    const stripped = k.replace(/[-_](bin|stable|esr|nightly|beta|dev|preview)$/, "")
      .replace(/[-_][0-9.]+$/, "");
    if (stripped !== k && TABLE[stripped]) return TABLE[stripped];
  }
  return {};
}
