import { assert, test } from 'vitest';
import { getExtensionApi, getStorageArea } from '../src/shared/browser-api';

const g = globalThis as Record<string, unknown>;

test('browser-api - prefers browser when available', async () => {
  const mockLocal = {
    get: async () => ({ foo: 'from-browser' }),
    set: async () => {},
    remove: async () => {},
  };
  g.browser = { storage: { local: mockLocal } };
  g.chrome = {
    storage: {
      local: {
        get: (_k: unknown, cb: (r: Record<string, unknown>) => void) =>
          cb({ foo: 'from-chrome' }),
      },
    },
  };

  try {
    const api = getExtensionApi();
    assert.equal(api, g.browser);

    const area = getStorageArea();
    assert.ok(area);
    const data = await area.get('foo');
    assert.deepEqual(data, { foo: 'from-browser' });
  } finally {
    delete g.browser;
    delete g.chrome;
  }
});

test('browser-api - wraps chrome callback storage API into Promises when browser is absent', async () => {
  const store: Record<string, unknown> = { a: 1 };
  g.chrome = {
    storage: {
      local: {
        get: (keys: string | string[] | null, cb: (r: Record<string, unknown>) => void) => {
          if (keys === null) cb({ ...store });
          else if (typeof keys === 'string') cb({ [keys]: store[keys] });
          else cb({});
        },
        set: (items: Record<string, unknown>, cb?: () => void) => {
          Object.assign(store, items);
          if (cb) cb();
        },
        remove: (keys: string | string[], cb?: () => void) => {
          const arr = Array.isArray(keys) ? keys : [keys];
          for (const k of arr) delete store[k];
          if (cb) cb();
        },
      },
    },
  };

  try {
    const api = getExtensionApi();
    assert.equal(api, g.chrome);

    const area = getStorageArea();
    assert.ok(area);

    const initial = await area.get('a');
    assert.deepEqual(initial, { a: 1 });

    await area.set({ b: 2 });
    assert.equal(store.b, 2);

    await area.remove('a');
    assert.equal(store.a, undefined);
  } finally {
    delete g.chrome;
  }
});

test('browser-api - returns null when neither browser nor chrome exists', () => {
  delete g.browser;
  delete g.chrome;
  assert.equal(getExtensionApi(), null);
  assert.equal(getStorageArea(), null);
});
