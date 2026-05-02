
import { create } from "zustand";
import { persist } from "zustand/middleware";

type Value = string | boolean | number;

interface SettingsState {
  values: Record<string, Value>;
  set: (key: string, val: Value) => void;
}

export const useSettingsStore = create<SettingsState>()(
  persist(
    (set) => ({
      values: {},
      set: (key, val) =>
        set((st) => ({ values: { ...st.values, [key]: val } })),
    }),
    { name: "mint.settings.v1", version: 1 }
  )
);

export function useSetting<T extends Value>(key: string, fallback: T): [T, (v: T) => void] {
  const v = useSettingsStore((s) => s.values[key]);
  const setter = useSettingsStore((s) => s.set);
  const value = (v === undefined ? fallback : (v as T));
  return [value, (next) => setter(key, next)];
}
