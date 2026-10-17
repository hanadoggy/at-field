/** Minimal ambient declaration for Chrome extension API fallback */
export interface ChromeStorageLocalCompat {
  get(
    keys: string | string[] | null,
    callback: (items: Record<string, unknown>) => void
  ): void;
  set(items: Record<string, unknown>, callback?: () => void): void;
  remove(keys: string | string[], callback?: () => void): void;
}

export interface ChromeCompat {
  storage?: {
    local?: ChromeStorageLocalCompat;
    onChanged?: typeof browser.storage.onChanged;
  };
  runtime?: {
    onMessage?: typeof browser.runtime.onMessage;
    openOptionsPage?: typeof browser.runtime.openOptionsPage;
  };
  tabs?: {
    query?: typeof browser.tabs.query;
    sendMessage?: typeof browser.tabs.sendMessage;
  };
  i18n?: {
    getMessage?: typeof browser.i18n.getMessage;
  };
}

declare global {
  // eslint-disable-next-line no-var
  var chrome: ChromeCompat | undefined;
}
