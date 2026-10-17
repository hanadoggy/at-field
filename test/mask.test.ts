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
