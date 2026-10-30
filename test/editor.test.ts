import { assert, test } from 'vitest';
import { HANDLES, MaskEditor } from '../src/content/editor';
import type { Rect } from '../src/types/schema';
import {
  assertRectClose,
  createMockEditorEnv,
  MockHTMLElement,
} from './helpers/mock-dom';

test('MaskEditor - Escape cancels pending debounced save, rolls back to initialRect, and awaits onSave before onExit', async () => {
  const env = createMockEditorEnv();
  try {
    const initialRect: Rect = { x: 0.5, y: 0.5, w: 0.2, h: 0.2 };
    const events: string[] = [];
    const savedRects: Rect[] = [];
    let latestUpdatedRect: Rect | null = null;

    const editor = new MaskEditor({
      maskEl: env.maskEl,
      playerEl: env.playerEl,
      videoEl: env.videoEl,
      initialRect,
      onUpdate: (r) => {
        latestUpdatedRect = { ...r };
      },
      onSave: async (r) => {
        events.push('save:start');
        savedRects.push({ ...r });
        await new Promise((resolve) => setTimeout(resolve, 20));
        events.push('save:end');
      },
      onExit: () => {
        events.push('exit');
        editor.destroy();
      },
    });

    // 1. Nudge with ArrowRight (triggers 300ms debounce timer and updates currentRect)
    env.dispatchKeyDown({ key: 'ArrowRight', shiftKey: true });
    assertRectClose(latestUpdatedRect, { x: 0.51, y: 0.5, w: 0.2, h: 0.2 });

    // 2. Immediately press Escape before the 300ms debounce fires
    env.dispatchKeyDown({ key: 'Escape' });

    // Wait for async onSave + past the 300ms debounce window
    await new Promise((resolve) => setTimeout(resolve, 350));

    // Only the Escape rollback save should have executed, and exit must happen after save:end
    assert.deepEqual(events, ['save:start', 'save:end', 'exit']);
    assert.equal(savedRects.length, 1);
    assert.deepEqual(savedRects[0], initialRect);
    assert.deepEqual(latestUpdatedRect, initialRect);
  } finally {
    env.cleanup();
  }
});

test('MaskEditor - Enter saves current modified rect and exits', async () => {
  const env = createMockEditorEnv();
  try {
    const initialRect: Rect = { x: 0.2, y: 0.2, w: 0.3, h: 0.3 };
    let savedRect: Rect | null = null;
    let exited = false;

    const editor = new MaskEditor({
      maskEl: env.maskEl,
      playerEl: env.playerEl,
      videoEl: env.videoEl,
      initialRect,
      onSave: async (r) => {
        savedRect = { ...r };
      },
      onExit: () => {
        exited = true;
        editor.destroy();
      },
    });

    env.dispatchKeyDown({ key: 'ArrowDown', shiftKey: true });
    env.dispatchKeyDown({ key: 'Enter' });

    await new Promise((resolve) => setTimeout(resolve, 20));

    assert.equal(exited, true);
    assertRectClose(savedRect, { x: 0.2, y: 0.21, w: 0.3, h: 0.3 });
  } finally {
    env.cleanup();
  }
});

test('MaskEditor - pointer drag moves mask and clamps within video box bounds', () => {
  // Video box is 1000 x 500
  const env = createMockEditorEnv({ width: 1000, height: 500 });
  try {
    let updatedRect: Rect | null = null;
    const editor = new MaskEditor({
      maskEl: env.maskEl,
      playerEl: env.playerEl,
      videoEl: env.videoEl,
      initialRect: { x: 0.1, y: 0.2, w: 0.3, h: 0.4 },
      onUpdate: (r) => {
        updatedRect = { ...r };
      },
    });

    // Initial pixel position: left=100px, top=100px, width=300px, height=200px
    assert.equal(env.maskMock.style.left, '100px');
    assert.equal(env.maskMock.style.top, '100px');

    // Drag by (+200px, +50px) -> (+0.2x, +0.1y) => x=0.3, y=0.3
    env.dispatchPointerDown({ clientX: 150, clientY: 150 });
    env.dispatchPointerMove({ clientX: 350, clientY: 200 });
    env.flushAnimationFrames();
    env.dispatchPointerUp({ clientX: 350, clientY: 200 });

    assertRectClose(updatedRect, { x: 0.3, y: 0.3, w: 0.3, h: 0.4 });
    assert.equal(env.maskMock.style.left, '300px');
    assert.equal(env.maskMock.style.top, '150px');

    // Drag far beyond top-left (-500px, -500px) -> clamps to x=0, y=0
    env.dispatchPointerDown({ clientX: 300, clientY: 150 });
    env.dispatchPointerMove({ clientX: -200, clientY: -350 });
    env.dispatchPointerUp({ clientX: -200, clientY: -350 });

    assertRectClose(updatedRect, { x: 0, y: 0, w: 0.3, h: 0.4 });
    assert.equal(env.maskMock.style.left, '0px');
    assert.equal(env.maskMock.style.top, '0px');

    editor.destroy();
  } finally {
    env.cleanup();
  }
});

test('MaskEditor - 8-direction resize handles update rect dimensions and enforce minSize', () => {
  // Video box is 1000 x 500
  const env = createMockEditorEnv({ width: 1000, height: 500 });
  try {
    let updatedRect: Rect | null = null;
    const editor = new MaskEditor({
      maskEl: env.maskEl,
      playerEl: env.playerEl,
      videoEl: env.videoEl,
      initialRect: { x: 0.2, y: 0.2, w: 0.3, h: 0.4 },
      onUpdate: (r) => {
        updatedRect = { ...r };
      },
    });

    // Verify all 8 handles exist
    for (const dir of HANDLES) {
      assert.ok(env.getHandleElement(dir), `Handle ${dir} should exist`);
    }

    // 1. Resize with 'se' handle (+100px width = +0.1w, +50px height = +0.1h)
    const seHandle = env.getHandleElement('se')!;
    env.dispatchPointerDown({ clientX: 500, clientY: 300, target: seHandle });
    env.dispatchPointerMove({ clientX: 600, clientY: 350 });
    env.dispatchPointerUp({ clientX: 600, clientY: 350 });

    assertRectClose(updatedRect, { x: 0.2, y: 0.2, w: 0.4, h: 0.5 });

    // 2. Resize with 'nw' handle (+100px right = +0.1x & -0.1w, +50px down = +0.1y & -0.1h)
    const nwHandle = env.getHandleElement('nw')!;
    env.dispatchPointerDown({ clientX: 200, clientY: 100, target: nwHandle });
    env.dispatchPointerMove({ clientX: 300, clientY: 150 });
    env.dispatchPointerUp({ clientX: 300, clientY: 150 });

    assertRectClose(updatedRect, { x: 0.3, y: 0.3, w: 0.3, h: 0.4 });

    // 3. Resize 'se' inward past zero size -> clamps w and h to MIN_MASK_SIZE (0.02)
    env.dispatchPointerDown({ clientX: 600, clientY: 350, target: seHandle });
    env.dispatchPointerMove({ clientX: 100, clientY: 50 });
    env.dispatchPointerUp({ clientX: 100, clientY: 50 });

    assertRectClose(updatedRect, { x: 0.3, y: 0.3, w: 0.02, h: 0.02 });

    editor.destroy();
  } finally {
    env.cleanup();
  }
});

test('MaskEditor - blocks YouTube hotkeys during edit mode but allows typing in INPUT elements', () => {
  const env = createMockEditorEnv();
  try {
    const editor = new MaskEditor({
      maskEl: env.maskEl,
      playerEl: env.playerEl,
      videoEl: env.videoEl,
      initialRect: { x: 0.2, y: 0.2, w: 0.3, h: 0.3 },
    });

    // 'k' and '5' should be blocked when focus is not in an input
    const resK = env.dispatchKeyDown({ key: 'k' });
    assert.equal(resK.defaultPrevented, true);
    assert.equal(resK.propagationStopped, true);

    const resDigit = env.dispatchKeyDown({ key: '5' });
    assert.equal(resDigit.defaultPrevented, true);

    // Typing 'k' inside an <input> element should NOT be blocked
    const inputEl = new MockHTMLElement('INPUT');
    const resInput = env.dispatchKeyDown({ key: 'k', target: inputEl });
    assert.equal(resInput.defaultPrevented, false);
    assert.equal(resInput.propagationStopped, false);

    editor.destroy();
  } finally {
    env.cleanup();
  }
});

test('MaskEditor - Tab and Shift+Tab flush pending save and invoke onCycleMask', async () => {
  const env = createMockEditorEnv();
  try {
    const cycleEvents: Array<1 | -1> = [];
    const savedRects: Rect[] = [];

    const editor = new MaskEditor({
      maskEl: env.maskEl,
      playerEl: env.playerEl,
      videoEl: env.videoEl,
      initialRect: { x: 0.2, y: 0.2, w: 0.3, h: 0.3 },
      maskIndex: 1,
      totalMasks: 2,
      onSave: async (r) => {
        savedRects.push({ ...r });
      },
      onCycleMask: (delta) => {
        cycleEvents.push(delta);
      },
    });

    // Nudge mask to start debounced save, then immediately press Tab
    env.dispatchKeyDown({ key: 'ArrowRight', shiftKey: true });
    const tabRes = env.dispatchKeyDown({ key: 'Tab' });
    assert.equal(tabRes.defaultPrevented, true);

    const shiftTabRes = env.dispatchKeyDown({ key: 'Tab', shiftKey: true });
    assert.equal(shiftTabRes.defaultPrevented, true);

    assert.deepEqual(cycleEvents, [1, -1]);
    assert.equal(savedRects.length, 1);
    assertRectClose(savedRects[0], { x: 0.21, y: 0.2, w: 0.3, h: 0.3 });

    editor.destroy();
  } finally {
    env.cleanup();
  }
});
