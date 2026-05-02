
import { useSettingsStore } from "../store/settings";

export async function notify(
  title: string,
  body: string,
): Promise<void> {
  const enabled = useSettingsStore.getState().values["mint.notifications"];
  if (enabled !== true) return;
  try {
    const { isPermissionGranted, requestPermission, sendNotification } =
      await import("@tauri-apps/plugin-notification");
    let granted = await isPermissionGranted();
    if (!granted) {
      const perm = await requestPermission();
      granted = perm === "granted";
    }
    if (!granted) return;
    sendNotification({ title, body });
  } catch {
  }
}
