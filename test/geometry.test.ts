import { assert, test } from 'vitest';
import * as geometry from '../src/content/geometry';

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

test('geometry.getVideoBox - null or undefined rects fallback to zero box', () => {
  const box1 = geometry.getVideoBox(null, { left: 0, top: 0, width: 100, height: 100 }, 1920, 1080);
  assert.deepEqual(box1, { left: 0, top: 0, width: 0, height: 0 });

  const box2 = geometry.getVideoBox({ left: 0, top: 0, width: 100, height: 100 }, null, 1920, 1080);
  assert.deepEqual(box2, { left: 0, top: 0, width: 0, height: 0 });
});

test('geometry.getVideoBox - handles video container offset relative to player', () => {
  const playerRect = { left: 50, top: 20, width: 1280, height: 720 };
  const videoRect = { left: 80, top: 40, width: 1200, height: 675 }; // Offset: +30 left, +20 top
  const box = geometry.getVideoBox(playerRect, videoRect, 1600, 900); // 16:9 exact match

  assert.equal(box.left, 30);
  assert.equal(box.top, 20);
  assert.equal(box.width, 1200);
  assert.equal(box.height, 675);
});

test('geometry.getVideoBox - zero or negative dimensions fallback safely', () => {
  const playerRect = { left: 0, top: 0, width: 100, height: 100 };
  const videoRect = { left: 0, top: 0, width: 0, height: -10 };
  const box = geometry.getVideoBox(playerRect, videoRect, 1920, 1080);

  assert.equal(box.width, 0);
  assert.equal(box.height, 0);
});

test('geometry.toPx - null or undefined inputs return zero rect', () => {
  assert.deepEqual(geometry.toPx(null, { left: 0, top: 0, width: 100, height: 100 }), { left: 0, top: 0, width: 0, height: 0 });
  assert.deepEqual(geometry.toPx({ x: 0.1, y: 0.1, w: 0.5, h: 0.5 }, null), { left: 0, top: 0, width: 0, height: 0 });
});

test('geometry.toRatio - zero or negative box dimensions return zero rect without NaN', () => {
  const zeroBox = { left: 0, top: 0, width: 0, height: 0 };
  const result = geometry.toRatio({ left: 10, top: 10, width: 50, height: 50 }, zeroBox);
  assert.deepEqual(result, { x: 0, y: 0, w: 0, h: 0 });

  const nullBox = geometry.toRatio(null, zeroBox);
  assert.deepEqual(nullBox, { x: 0, y: 0, w: 0, h: 0 });
});

test('geometry.clampRect - null rect returns default minSize rect', () => {
  const clamped = geometry.clampRect(null, 0.05);
  assert.deepEqual(clamped, { x: 0, y: 0, w: 0.05, h: 0.05 });
});

test('geometry.clampRect - clamps at max boundaries (x + w > 1, y + h > 1)', () => {
  const overflow = { x: 0.9, y: 0.85, w: 0.3, h: 0.4 };
  const clamped = geometry.clampRect(overflow, 0.02);

  // w is 0.3, so x cannot exceed 1 - 0.3 = 0.7
  assert.equal(clamped.w, 0.3);
  assert.equal(clamped.x, 0.7);

  // h is 0.4, so y cannot exceed 1 - 0.4 = 0.6
  assert.equal(clamped.h, 0.4);
  assert.equal(clamped.y, 0.6);
});

test('geometry.clampRect - preserves zero x/y and handles NaN/negative dimensions', () => {
  const zeroOrigin = geometry.clampRect({ x: 0, y: 0, w: 0.2, h: 0.2 });
  assert.deepEqual(zeroOrigin, { x: 0, y: 0, w: 0.2, h: 0.2 });

  const invalidDims = geometry.clampRect(
    { x: Number.NaN, y: undefined, w: -0.5, h: 0 },
    0.05
  );
  assert.deepEqual(invalidDims, { x: 0, y: 0, w: 0.05, h: 0.05 });
});
