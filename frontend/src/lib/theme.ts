export type Theme = 'light' | 'dark';
export const themeStorageKey = 'racing-gang:theme';
export function readTheme(storage: Pick<Storage, 'getItem'> | null): Theme {
  try { return storage?.getItem(themeStorageKey) === 'dark' ? 'dark' : 'light'; } catch { return 'light'; }
}
export function saveTheme(theme: Theme, storage: Pick<Storage, 'setItem'> | null) {
  try { storage?.setItem(themeStorageKey, theme); } catch { /* A blocked preference store must not block the UI. */ }
}
export function browserStorage(): Storage | null {
  try { return window.localStorage; } catch { return null; }
}
