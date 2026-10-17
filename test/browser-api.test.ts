import { assert, test } from 'vitest';
import { getExtensionApi, getStorageArea } from '../src/shared/browser-api';
import { withMockGlobals } from './helpers/mock-dom';

test('browser-api - prefers browser when available', async () => {
  const mockBrowser = {
    storage: {
      local: {
        get: async () => ({ foo: 'from-browser' }),
        set: async () => {},
        remove: async () => {},
      },
    },
  };
  const mockChrome = {
    storage: {
      local: {
        get: (_k: unknown, cb: (r: Record<string, unknown>) => void) =>
          cb({ foo: 'from-chrome' }),
      },
    },
  };

  await withMockGlobals({ browser: mockBrowser, chrome: mockChrome }, async () => {
    const api = getExtensionApi();
    assert.equal<unknown>(api, mockBrowser);

    const area = getStorageArea();
    assert.ok(area);
    const data = await area.get('foo');
    assert.deepEqual(data, { foo: 'from-browser' });
  });
});

test('browser-api - wraps chrome callback storage API into Promises when browser is absent', async () => {
  const store: Record<string, unknown> = { a: 1 };
  const mockChrome = {
    storage: {
      local: {
        get: (
          keys: string | string[] | null,
          cb: (r: Record<string, unknown>) => void
        ) => {
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

  await withMockGlobals({ browser: undefined, chrome: mockChrome }, async () => {
    const api = getExtensionApi();
    assert.equal<unknown>(api, mockChrome);

    const area = getStorageArea();
    assert.ok(area);

    const initial = await area.get('a');
    assert.deepEqual(initial, { a: 1 });

    await area.set({ b: 2 });
    assert.equal(store.b, 2);

    await area.remove('a');
    assert.equal(store.a, undefined);
  });
});

test('browser-api - returns null when neither browser nor chrome exists', () => {
  withMockGlobals({ browser: undefined, chrome: undefined }, () => {
    assert.equal(getExtensionApi(), null);
    assert.equal(getStorageArea(), null);
  });
});
