import { invoke } from "@tauri-apps/api/core";
import { useFolders } from "../store/folders";
import { useServers } from "../store/servers";
import {
  decodeProfileTitle,
  extractShareUris,
  parseUserInfo,
  urisToServers,
  useSubscriptions,
  type Subscription,
} from "../store/subscriptions";

interface FetchResp {
  body: string;
  user_info: string | null;
  update_interval: string | null;
  title: string | null;
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
    const oldServers = useServers
      .getState()
      .servers.filter((s) => s.subscriptionId === sub.id);
    const customMeta = new Map<
      string,
      {
        name: string;
        description?: string;
        favorite?: boolean;
        pinned?: boolean;
      }
    >();
    for (const s of oldServers) {
      customMeta.set(s.address, {
        name: s.name,
        description: s.description,
        favorite: s.favorite,
        pinned: s.pinned,
      });
    }
    useServers.getState().removeBySubscription(sub.id);
    const freshServers = urisToServers(uris, sub.id).map((s) => {
      const prev = customMeta.get(s.address);
      if (!prev) return s;
      return {
        ...s,
        name: prev.name,
        description: prev.description,
        favorite: prev.favorite,
        pinned: prev.pinned,
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
    });
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
