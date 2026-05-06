import { invoke } from "@tauri-apps/api/core";
import { useFolders } from "../store/folders";
import { useServers, type SavedServer } from "../store/servers";
import {
  capDescription,
  decodeProfileTitle,
  extractShareUris,
  parseUserInfo,
  urisToServers,
  useSubscriptions,
  type Subscription,
} from "../store/subscriptions";
import { probeServer } from "./ping";

// Fire-and-forget background ping pass for every server in a
// subscription whose ping is currently null. Used after the initial
// import and after each refresh so that genuinely new rows (or rows
// that were left null by a pre-0.3.25 refresh wipe) get measured
// without the user having to press "Пинговать всё" manually.
//
// Errors are swallowed per-server: a single unreachable host should
// not abort the rest. Concurrency is bounded so we don't hammer the
// network or starve sing-box's TUN with hundreds of parallel TCP
// dials when the user has a 100+ server subscription.
export function pingMissingServersForSubscription(
  subscriptionId: string
): void {
  const targets: SavedServer[] = useServers
    .getState()
    .servers.filter(
      (s) => s.subscriptionId === subscriptionId && s.ping == null
    );
  if (targets.length === 0) return;
  const setPing = useServers.getState().setPing;
  const CONCURRENCY = 6;
  let nextIdx = 0;
  const run = async (): Promise<void> => {
    for (;;) {
      const i = nextIdx++;
      if (i >= targets.length) return;
      const srv = targets[i];
      try {
        const ms = await probeServer(srv);
        setPing(srv.id, ms);
      } catch {
        setPing(srv.id, null);
      }
    }
  };
  void Promise.all(
    Array.from({ length: Math.min(CONCURRENCY, targets.length) }, run)
  );
}

interface FetchResp {
  body: string;
  user_info: string | null;
  update_interval: string | null;
  title: string | null;
  // Optional metadata. Older Mint servers and any non-Mint
  // subscription provider leave these as null.
  server_description: string | null;
  profile_description: string | null;
  support_url: string | null;
  web_page_url: string | null;
}

export interface RefreshSubscriptionResult {
  ok: boolean;
  error?: string;
}

// Re-fetches the subscription URL, replaces the underlying server list while
// preserving user-customized fields (renames, descriptions, favorite/pinned
// flags) on rows whose `address` URI survives the refresh, and keeps the
// associated folder synced. Single source of truth used both by the
// Profiles page and the dashboard's per-folder refresh button — having two
// implementations made them drift (the dashboard side previously had no
// refresh at all and was the cause of bug 1).
export async function refreshSubscription(
  sub: Subscription
): Promise<RefreshSubscriptionResult> {
  const updateSub = useSubscriptions.getState().update;
  try {
    const resp = await invoke<FetchResp>("fetch_subscription", { url: sub.url });
    const uris = extractShareUris(resp.body);
    if (uris.length === 0) {
      const err = "Подписка пуста или формат не распознан";
      updateSub(sub.id, { lastError: err });
      return { ok: false, error: err };
    }
    const userInfo = parseUserInfo(resp.user_info);
    const title = decodeProfileTitle(resp.title);
    const profileDescription = capDescription(resp.profile_description);
    const serverDescription = capDescription(resp.server_description);
    const supportUrl = resp.support_url?.trim() || undefined;
    const webPageUrl = resp.web_page_url?.trim() || undefined;
    const oldServers = useServers
      .getState()
      .servers.filter((s) => s.subscriptionId === sub.id);
    // For each old server we record (a) what the user currently has
    // and (b) what *we last received from the server* via the
    // subscription's per-server description. We store the latter on
    // the subscription itself (sub.backendDescription) rather than
    // per-server because all servers in a subscription share the same
    // backend-provided description. If `prev.description` differs
    // from `prev.backendDescription`, the user has typed something
    // distinct → preserve it; otherwise the user has not customised
    // anything → accept the new server value.
    const prevBackendDescription = sub.backendDescription;
    const customMeta = new Map<
      string,
      {
        name: string;
        description?: string;
        favorite?: boolean;
        pinned?: boolean;
        // Preserved across refresh so the dashboard / Profiles
        // doesn't visibly "reset" every time the user pulls fresh
        // servers from the subscription. Without this, all rows
        // showed `n/a` for ping and "1 мин назад" for added time.
        addedAt: number;
        ping: number | null;
        load: number | null;
        pingedAt?: number;
      }
    >();
    for (const s of oldServers) {
      customMeta.set(s.address, {
        name: s.name,
        description: s.description,
        favorite: s.favorite,
        pinned: s.pinned,
        addedAt: s.addedAt,
        ping: s.ping,
        load: s.load,
        pingedAt: s.pingedAt,
      });
    }
    useServers.getState().removeBySubscription(sub.id);
    const freshServers = urisToServers(uris, sub.id, {
      description: serverDescription,
    }).map((s) => {
      const prev = customMeta.get(s.address);
      if (!prev) return s;
      const userOverrodeDescription =
        prev.description !== prevBackendDescription;
      return {
        ...s,
        name: prev.name,
        description: userOverrodeDescription ? prev.description : s.description,
        favorite: prev.favorite,
        pinned: prev.pinned,
        addedAt: prev.addedAt,
        ping: prev.ping,
        load: prev.load,
        pingedAt: prev.pingedAt,
      };
    });
    const newIds = useServers.getState().addMany(freshServers);
    const friendly = title || sub.name;
    const fState = useFolders.getState();
    const existing = fState.findBySubscription(sub.id);
    const folderId = existing
      ? existing.id
      : fState.create(friendly, { subscriptionId: sub.id });
    fState.setServerIds(folderId, newIds);
    // Folder name + description: same smart-merge story. If the
    // folder's current description equals what the server last sent,
    // the user has not customised it → accept the new value.
    const currentFolder = fState.folders.find((f) => f.id === folderId);
    const folderDescriptionUntouched =
      !currentFolder ||
      currentFolder.description === prevBackendDescription;
    if (folderDescriptionUntouched) {
      fState.setNameAndDescription(
        folderId,
        currentFolder?.name ?? friendly,
        profileDescription ?? ""
      );
    }
    updateSub(sub.id, {
      name: friendly,
      syncedAt: Date.now(),
      uploadBytes: userInfo.upload,
      downloadBytes: userInfo.download,
      totalBytes: userInfo.total,
      expiresAt: userInfo.expire,
      updateIntervalHours: resp.update_interval
        ? Number(resp.update_interval)
        : sub.updateIntervalHours,
      lastError: null,
      // Preserve the user's edit on `description` if they made one;
      // otherwise the new server value wins.
      description:
        sub.description !== prevBackendDescription
          ? sub.description
          : profileDescription,
      backendDescription: profileDescription,
      supportUrl,
      webPageUrl,
    });
    // Auto-ping any server in this subscription whose ping is null
    // — typically: brand-new rows the subscription just added, plus
    // rows whose ping got wiped by a pre-0.3.25 refresh. Background,
    // bounded concurrency, errors swallowed per server.
    pingMissingServersForSubscription(sub.id);
    return { ok: true };
  } catch (e) {
    const err = typeof e === "string" ? e : "Не удалось обновить";
    updateSub(sub.id, { lastError: err });
    return { ok: false, error: err };
  }
}

// Removes a subscription, its folder, and every server belonging to it in a
// single atomic-feeling operation. Matches the user-mental-model of
// "delete profile" in Hiddify / NekoBox where pressing the trash icon on a
// subscription group purges the entire profile, instead of just unwiring
// the folder grouping (the old behaviour, which was the cause of bug 2 —
// deleted folders kept their subscription + servers visible on the
// Profiles page).
export function deleteSubscriptionEverywhere(subscriptionId: string): void {
  useServers.getState().removeBySubscription(subscriptionId);
  useFolders.getState().removeBySubscription(subscriptionId);
  useSubscriptions.getState().remove(subscriptionId);
}
