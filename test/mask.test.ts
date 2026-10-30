import { assert, test } from 'vitest';
import * as mask from '../src/content/mask';

test('mask.applyMaskStyle - solid style sets background color with opacity and clears blur', () => {
  const el = { style: {} as Record<string, string> } as unknown as HTMLElement;
  mask.applyMaskStyle(el, {
    type: 'solid',
    color: '#ff0000',
    opacity: 0.8
  });

  assert.equal(el.style.backgroundColor, 'rgba(255, 0, 0, 0.8)');
  assert.equal(el.style.backdropFilter, 'none');
  assert.equal((el.style as unknown as Record<string, string>).webkitBackdropFilter, 'none');
});

test('mask.applyMaskStyle - blur style sets backdrop filter and semi-transparent tint', () => {
  const el = { style: {} as Record<string, string> } as unknown as HTMLElement;
  mask.applyMaskStyle(el, {
    type: 'blur',
    color: '#000000',
    opacity: 0.45,
    blur: 20
  });

  assert.equal(el.style.backdropFilter, 'blur(20px)');
  assert.equal((el.style as unknown as Record<string, string>).webkitBackdropFilter, 'blur(20px)');
  assert.equal(el.style.backgroundColor, 'rgba(0, 0, 0, 0.45)');
});

test('mask.updateMaskPosition - calculates and sets pixel coordinates', () => {
  const maskEl = { style: {} as Record<string, string> } as unknown as HTMLElement;
  const playerEl = {
    getBoundingClientRect: () => ({ left: 0, top: 0, width: 1280, height: 720 })
  } as unknown as HTMLElement;
  const videoEl = {
    getBoundingClientRect: () => ({ left: 0, top: 0, width: 1280, height: 720 }),
    videoWidth: 1920,
    videoHeight: 1080
  } as unknown as HTMLVideoElement;

  const rect = { x: 0.5, y: 0.5, w: 0.25, h: 0.25 };
  mask.updateMaskPosition(maskEl, rect, playerEl, videoEl);

  assert.equal(maskEl.style.left, '640px'); // 0.5 * 1280
  assert.equal(maskEl.style.top, '360px');  // 0.5 * 720
  assert.equal(maskEl.style.width, '320px'); // 0.25 * 1280
  assert.equal(maskEl.style.height, '180px'); // 0.25 * 720
});

test('mask.insertMaskIntoPlayer - places mask right after html5-video-container', () => {
  const videoContainer = { nextSibling: { name: 'controls' } };
  let insertedElement: unknown = null;
  let insertedBefore: unknown = null;

  const playerEl = {
    querySelector: (sel: string) => sel === '.html5-video-container' ? videoContainer : null,
    insertBefore: (el: unknown, ref: unknown) => {
      insertedElement = el;
      insertedBefore = ref;
    },
    appendChild: (el: unknown) => {
      insertedElement = el;
    }
  } as unknown as HTMLElement;

  const mockMask = {
    parentElement: null,
    isConnected: false
  } as unknown as HTMLElement;

  mask.insertMaskIntoPlayer(mockMask, playerEl);

  assert.equal(insertedElement, mockMask);
  assert.equal(insertedBefore, videoContainer.nextSibling);
});

test('mask.syncProfileMasks - creates/updates multiple masks and removes stale mask elements', () => {
  const createdElements: Array<{
    id: string;
    index: string;
    removed: boolean;
    el: HTMLElement;
  }> = [];

  let staleRemoved = false;
  const staleEl = {
    getAttribute: (k: string) => (k === 'data-atf-mask-id' ? 'm_stale' : null),
    remove() {
      staleRemoved = true;
    },
  } as unknown as HTMLElement;

  const playerEl = {
    getBoundingClientRect: () => ({ left: 0, top: 0, width: 1000, height: 500 }),
    querySelector: (sel: string) => {
      const match = sel.match(/data-atf-mask-id="([^"]+)"/);
      if (match) {
        const found = createdElements.find((c) => c.id === match[1]);
        return found ? found.el : null;
      }
      return null;
    },
    querySelectorAll: () => [
      staleEl,
      ...createdElements.map((c) => c.el),
    ],
    appendChild: () => {},
  } as unknown as HTMLElement;

  const videoEl = {
    getBoundingClientRect: () => ({ left: 0, top: 0, width: 1000, height: 500 }),
    videoWidth: 1000,
    videoHeight: 500,
  } as unknown as HTMLVideoElement;

  const prevDoc = (globalThis as Record<string, unknown>).document;
  (globalThis as Record<string, unknown>).document = {
    createElement: () => {
      const attrs = new Map<string, string>();
      const filterChild = { style: {} as Record<string, string>, className: '' };
      const record = {
        id: '',
        index: '',
        removed: false,
        el: null as unknown as HTMLElement,
      };
      const el = {
        className: '',
        style: {} as Record<string, string>,
        parentElement: playerEl,
        isConnected: true,
        setAttribute: (k: string, v: string) => {
          attrs.set(k, v);
          if (k === 'data-atf-mask-id') record.id = v;
          if (k === 'data-atf-mask-index') record.index = v;
        },
        getAttribute: (k: string) => attrs.get(k) ?? null,
        appendChild: () => filterChild,
        querySelector: () => filterChild,
        remove: () => {
          record.removed = true;
        },
      } as unknown as HTMLElement;
      record.el = el;
      createdElements.push(record);
      return el;
    },
  };

  try {
    const map = mask.syncProfileMasks(playerEl, videoEl, [
      {
        id: 'm_1',
        rect: { x: 0.1, y: 0.2, w: 0.3, h: 0.4 },
        style: { type: 'blur', color: '#000000', opacity: 0.5, blur: 12 },
      },
      {
        id: 'm_2',
        rect: { x: 0.5, y: 0.5, w: 0.2, h: 0.2 },
        style: { type: 'solid', color: '#ff0000', opacity: 1.0, blur: 16 },
      },
    ]);

    assert.equal(map.size, 2);
    assert.ok(map.has('m_1'));
    assert.ok(map.has('m_2'));
    assert.equal(
      staleRemoved,
      true,
      'Stale mask element should be removed'
    );
    assert.equal(map.get('m_1')?.getAttribute('data-atf-mask-index'), '1');
    assert.equal(map.get('m_2')?.getAttribute('data-atf-mask-index'), '2');
  } finally {
    if (prevDoc === undefined) {
      delete (globalThis as Record<string, unknown>).document;
    } else {
      (globalThis as Record<string, unknown>).document = prevDoc;
    }
  }
});
