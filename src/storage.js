const KEY = 'block-breeze.v1';

export function createStorage(host = globalThis.window?.LanMind, local) {
  return {
    async read() {
      if (host?.storage) return host.storage.get(KEY);
      const value = (local ?? globalThis.window?.localStorage)?.getItem(KEY);
      return value ? JSON.parse(value) : null;
    },
    async write(value) {
      if (host?.storage) return host.storage.set(KEY, value);
      const browserStorage = local ?? globalThis.window?.localStorage;
      if (!browserStorage) throw new Error('STORAGE_UNAVAILABLE');
      browserStorage.setItem(KEY, JSON.stringify(value));
    },
  };
}

// Serialize host writes so a slow older save cannot overwrite the latest turn.
export function saveQueue(storage, onStatus = () => {}) {
  let pending = Promise.resolve();
  return value => {
    const snapshot = structuredClone(value);
    pending = pending.catch(() => {}).then(() => storage.write(snapshot));
    pending.then(() => onStatus(true), () => onStatus(false));
    return pending;
  };
}
