const test = require('node:test');
const assert = require('node:assert/strict');
require('../content/geometry.js');
const mask = require('../content/mask.js');

test('mask.applyMaskStyle - solid style sets background color with opacity and clears blur', () => {
  const el = { style: {} };
  mask.applyMaskStyle(el, {
    type: 'solid',
    color: '#ff0000',
    opacity: 0.8
  });

  assert.equal(el.style.backgroundColor, 'rgba(255, 0, 0, 0.8)');
  assert.equal(el.style.backdropFilter, 'none');
  assert.equal(el.style.webkitBackdropFilter, 'none');
});

test('mask.applyMaskStyle - blur style sets backdrop filter and semi-transparent tint', () => {
  const el = { style: {} };
  mask.applyMaskStyle(el, {
    type: 'blur',
    color: '#000000',
    opacity: 0.45,
    blur: 20
  });

  assert.equal(el.style.backdropFilter, 'blur(20px)');
  assert.equal(el.style.webkitBackdropFilter, 'blur(20px)');
  assert.equal(el.style.backgroundColor, 'rgba(0, 0, 0, 0.45)');
});

test('mask.updateMaskPosition - calculates and sets pixel coordinates', () => {
  const maskEl = { style: {} };
  const playerEl = {
    getBoundingClientRect: () => ({ left: 0, top: 0, width: 1280, height: 720 })
  };
  const videoEl = {
    getBoundingClientRect: () => ({ left: 0, top: 0, width: 1280, height: 720 }),
    videoWidth: 1920,
    videoHeight: 1080
  };

  const rect = { x: 0.5, y: 0.5, w: 0.25, h: 0.25 };
  mask.updateMaskPosition(maskEl, rect, playerEl, videoEl);

  assert.equal(maskEl.style.left, '640px'); // 0.5 * 1280
  assert.equal(maskEl.style.top, '360px');  // 0.5 * 720
  assert.equal(maskEl.style.width, '320px'); // 0.25 * 1280
  assert.equal(maskEl.style.height, '180px'); // 0.25 * 720
});

test('mask.insertMaskIntoPlayer - places mask right after html5-video-container', () => {
  const videoContainer = { nextSibling: { name: 'controls' } };
  let insertedElement = null;
  let insertedBefore = null;

  const playerEl = {
    querySelector: (sel) => sel === '.html5-video-container' ? videoContainer : null,
    insertBefore: (el, ref) => {
      insertedElement = el;
      insertedBefore = ref;
    },
    appendChild: (el) => {
      insertedElement = el;
    }
  };

  const mockMask = {
    parentElement: null,
    isConnected: false
  };

  mask.insertMaskIntoPlayer(mockMask, playerEl);

  assert.equal(insertedElement, mockMask);
  assert.equal(insertedBefore, videoContainer.nextSibling);
});
