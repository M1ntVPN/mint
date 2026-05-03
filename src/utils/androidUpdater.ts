// Android-side update checker.
//
// Tauri's bundled updater plugin doesn't apply on Android (no signed bundle
// update format and no in-place install API). Instead we poll the GitHub
// Releases API for the latest `v*-android` tag, compare against the running
// app version, and — if newer — surface an update banner that links the user
// straight to the APK download in their browser.

const RELEASES_API =
  "https://api.github.com/repos/M1ntVPN/mint/releases?per_page=30";
const ANDROID_TAG_RE = /^v\d+\.\d+\.\d+(?:-[a-zA-Z0-9]+)*-android$/;

// Cache the latest release lookup for an hour. Update checks happen on every
// app cold-start; without a cache that's one GitHub API call per launch and
// the unauthenticated quota is 60 req/h per IP — easy to exhaust if many
// users share the VPN egress IP.
const CACHE_TTL_MS = 60 * 60 * 1000;
const CACHE_KEY = "mint.android.updateCache.v1";

interface CacheEntry {
  ts: number;
  release: AndroidReleaseInfo | null;
}

function readCache(): CacheEntry | null {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    const e = JSON.parse(raw) as CacheEntry;
    if (typeof e?.ts !== "number") return null;
    if (Date.now() - e.ts > CACHE_TTL_MS) return null;
    return e;
  } catch {
    return null;
  }
}

function writeCache(release: AndroidReleaseInfo | null): void {
  try {
    const entry: CacheEntry = { ts: Date.now(), release };
    localStorage.setItem(CACHE_KEY, JSON.stringify(entry));
  } catch {
  }
}

export interface AndroidReleaseInfo {
  /** Plain semver string parsed from the tag (e.g. "0.3.4"). */
  version: string;
  /** Original git tag, e.g. "v0.3.4-android". */
  tag: string;
  /** Direct download URL for the APK asset. */
  apkUrl: string;
  /** Release notes / body, if any. */
  notes?: string;
}

interface GhReleaseAsset {
  name: string;
  browser_download_url: string;
}

interface GhRelease {
  tag_name: string;
  draft: boolean;
  prerelease: boolean;
  body: string | null;
  assets: GhReleaseAsset[];
}

/**
 * Fetch the latest published Android release from GitHub. Returns null if
 * none found or the request fails (network down, rate-limited, etc).
 *
 * Results are cached for an hour to stay under the 60 req/h unauthenticated
 * GitHub API quota when many users share an egress IP.
 */
export async function fetchLatestAndroidRelease(
  opts: { force?: boolean } = {}
): Promise<AndroidReleaseInfo | null> {
  if (!opts.force) {
    const cached = readCache();
    if (cached) return cached.release;
  }

  let res: Response;
  try {
    res = await fetch(RELEASES_API, {
      headers: { Accept: "application/vnd.github+json" },
    });
  } catch {
    return null;
  }
  if (!res.ok) return null;

  let releases: GhRelease[];
  try {
    releases = (await res.json()) as GhRelease[];
  } catch {
    return null;
  }
  if (!Array.isArray(releases)) return null;

  // GitHub returns releases sorted by created_at desc, so the first match
  // is the most recent Android release.
  for (const r of releases) {
    if (r.draft) continue;
    if (!ANDROID_TAG_RE.test(r.tag_name)) continue;
    const apk = r.assets.find((a) => a.name.toLowerCase().endsWith(".apk"));
    if (!apk) continue;

    const version = r.tag_name.replace(/^v/, "").replace(/-android$/, "");
    const release: AndroidReleaseInfo = {
      version,
      tag: r.tag_name,
      apkUrl: apk.browser_download_url,
      notes: r.body ?? undefined,
    };
    writeCache(release);
    return release;
  }
  writeCache(null);
  return null;
}

/**
 * Compare two semver-ish strings. Returns 1 if a > b, -1 if a < b, 0 if
 * equal. Handles missing parts and ignores any prerelease suffix after "-".
 */
export function compareVersions(a: string, b: string): number {
  const parse = (v: string): number[] =>
    v
      .split("-")[0]
      .split(".")
      .map((p) => parseInt(p, 10) || 0);
  const ap = parse(a);
  const bp = parse(b);
  const len = Math.max(ap.length, bp.length);
  for (let i = 0; i < len; i++) {
    const av = ap[i] ?? 0;
    const bv = bp[i] ?? 0;
    if (av > bv) return 1;
    if (av < bv) return -1;
  }
  return 0;
}

/**
 * High-level helper: fetch the latest Android release, compare against the
 * current app version, return the release info iff strictly newer. Returns
 * null on no update / failure.
 */
export async function checkAndroidUpdate(
  currentVersion: string,
  opts: { force?: boolean } = {}
): Promise<AndroidReleaseInfo | null> {
  const latest = await fetchLatestAndroidRelease(opts);
  if (!latest) return null;
  if (compareVersions(latest.version, currentVersion) <= 0) return null;
  return latest;
}
