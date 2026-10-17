import type { ChromeCompat } from '../types/chrome-compat';

/** 공통 인터페이스는 firefox-webext-browser의 `typeof browser`를 기준으로 삼는다 */
export type ExtensionApi = typeof browser;

export interface StorageAreaLike {
  get(keys: string | string[] | null): Promise<Record<string, unknown>>;
  set(items: Record<string, unknown>): Promise<void>;
  remove(keys: string | string[]): Promise<void>;
}

/** browser → chrome 순서로 탐색. 둘 다 없으면 null (테스트/Node 환경) */
export function getExtensionApi(): ExtensionApi | null {
  const g = globalThis as { browser?: ExtensionApi; chrome?: ChromeCompat };
  const b = (typeof browser !== 'undefined' && browser) || g.browser;
  if (b) return b;
  const c = (typeof chrome !== 'undefined' && chrome) || g.chrome;
  if (c) return c as unknown as ExtensionApi;
  return null;
}

/** 기존 storage.js의 getStorageArea 로직 그대로: chrome 콜백 API는 Promise로 감싸서 반환 */
export function getStorageArea(): StorageAreaLike | null {
  const g = globalThis as { browser?: ExtensionApi; chrome?: ChromeCompat };
  const b = (typeof browser !== 'undefined' && browser) || g.browser;
  if (b && b.storage && b.storage.local) {
    return b.storage.local as unknown as StorageAreaLike;
  }
  const c = (typeof chrome !== 'undefined' && chrome) || g.chrome;
  const chromeLocal = c && c.storage && c.storage.local;
  if (chromeLocal) {
    return {
      get: (keys) =>
        new Promise((resolve) =>
          chromeLocal.get(keys, (items) => resolve(items || {}))
        ),
      set: (items) =>
        new Promise<void>((resolve) => chromeLocal.set(items, () => resolve())),
      remove: (keys) =>
        new Promise<void>((resolve) =>
          chromeLocal.remove(keys, () => resolve())
        ),
    };
  }
  return null;
}
