export const LEGACY_POS_STORAGE_KEY = "kicks-center-pos-v1";

export function clearSensitiveBrowserState() {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem(LEGACY_POS_STORAGE_KEY);
  window.sessionStorage.removeItem(LEGACY_POS_STORAGE_KEY);
}
