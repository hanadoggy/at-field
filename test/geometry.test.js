const test = require('node:test');
const assert = require('node:assert/strict');
const geometry = require('../content/geometry.js');

test('geometry.getVideoBox - exact aspect ratio match (16:9)', () => {
  const playerRect = { left: 100, top: 50, width: 1280, height: 720 };
  const videoRect = { left: 100, top: 50, width: 1280, height: 720 };
  const box = geometry.getVideoBox(playerRect, videoRect, 1920, 1080);

  assert.equal(box.left, 0);
  assert.equal(box.top, 0);
  assert.equal(box.width, 1280);
  assert.equal(box.height, 720);
});

test('geometry.getVideoBox - pillarbox (4:3 video in 16:9 container)', () => {
  const playerRect = { left: 0, top: 0, width: 1600, height: 900 };
  const videoRect = { left: 0, top: 0, width: 1600, height: 900 };
  // 4:3 video -> renderHeight = 900, renderWidth = 900 * (4/3) = 1200
  // offsetX = (1600 - 1200) / 2 = 200
  const box = geometry.getVideoBox(playerRect, videoRect, 1440, 1080);

  assert.equal(box.top, 0);
  assert.equal(box.height, 900);
  assert.equal(box.width, 1200);
  assert.equal(box.left, 200);
});

test('geometry.getVideoBox - letterbox (21:9 ultrawide in 16:9 container)', () => {
  const playerRect = { left: 0, top: 0, width: 1600, height: 900 };
  const videoRect = { left: 0, top: 0, width: 1600, height: 900 };
  // 21:9 video (e.g. 2560x1080) -> renderWidth = 1600, renderHeight = 1600 / (2560/1080) = 675
  // offsetY = (900 - 675) / 2 = 112.5
  const box = geometry.getVideoBox(playerRect, videoRect, 2560, 1080);

  assert.equal(box.left, 0);
  assert.equal(box.width, 1600);
  assert.equal(box.height, 675);
  assert.equal(box.top, 112.5);
});

test('geometry.getVideoBox - fallback when metadata not loaded (videoWidth = 0)', () => {
  const playerRect = { left: 50, top: 50, width: 800, height: 600 };
  const videoRect = { left: 50, top: 50, width: 800, height: 600 };
  const box = geometry.getVideoBox(playerRect, videoRect, 0, 0);

  assert.equal(box.left, 0);
  assert.equal(box.top, 0);
  assert.equal(box.width, 800);
  assert.equal(box.height, 600);
});

test('geometry.toPx and toRatio roundtrip', () => {
  const box = { left: 50, top: 100, width: 1000, height: 500 };
  const rect = { x: 0.25, y: 0.5, w: 0.3, h: 0.4 };

  const px = geometry.toPx(rect, box);
  assert.equal(px.left, 300); // 50 + 0.25 * 1000
  assert.equal(px.top, 350);  // 100 + 0.5 * 500
  assert.equal(px.width, 300); // 0.3 * 1000
  assert.equal(px.height, 200); // 0.4 * 500

  const roundtrip = geometry.toRatio(px, box);
  assert.ok(Math.abs(roundtrip.x - rect.x) < 1e-6);
  assert.ok(Math.abs(roundtrip.y - rect.y) < 1e-6);
  assert.ok(Math.abs(roundtrip.w - rect.w) < 1e-6);
  assert.ok(Math.abs(roundtrip.h - rect.h) < 1e-6);
});

test('geometry.clampRect ensures rect stays within [0, 1] bounds and enforces minSize', () => {
  const outOfBounds = { x: -0.2, y: 0.8, w: 0.5, h: 0.5 };
  const clamped = geometry.clampRect(outOfBounds, 0.05);

  assert.equal(clamped.x, 0); // clamped to 0
  assert.equal(clamped.w, 0.5);
  assert.equal(clamped.h, 0.5);
  assert.equal(clamped.y, 0.5); // 0.8 + 0.5 > 1, so y clamped to 1 - 0.5 = 0.5

  const tooSmall = { x: 0.1, y: 0.1, w: 0.001, h: 0.005 };
  const minClamped = geometry.clampRect(tooSmall, 0.05);
  assert.equal(minClamped.w, 0.05);
  assert.equal(minClamped.h, 0.05);
});
