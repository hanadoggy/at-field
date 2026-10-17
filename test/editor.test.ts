import { assert, test } from 'vitest';
import { MaskEditor } from '../src/content/editor';
import type { Rect } from '../src/types/schema';

const g = globalThis as Record<string, any>;

interface MockEnv {
  maskEl: HTMLElement;
  playerEl: HTMLElement;
  videoEl: HTMLVideoElement;
  dispatchKeyDown: (init: {
    key: string;
    shiftKey?: boolean;
    ctrlKey?: boolean;
    metaKey?: boolean;
    altKey?: boolean;
    target?: unknown;
  }) => { defaultPrevented: boolean; propagationStopped: boolean };
  cleanup: () => void;
}

function createMockEditorEnv(): MockEnv {
  const windowListeners = new Map<string, Set<(e: any) => void>>();

  class MockHTMLElement {
    tagName = 'DIV';
    className = '';
    textContent = '';
    isContentEditable = false;
    style: Record<string, string> = {};
    attributes = new Map<string, string>();
    children: MockHTMLElement[] = [];
    listeners = new Map<string, Set<(e: any) => void>>();
    removed = false;

    classList = {
      classes: new Set<string>(),
      add: (c: string) => {
        this.classList.classes.add(c);
      },
      remove: (c: string) => {
        this.classList.classes.delete(c);
      },
      contains: (c: string) => this.classList.classes.has(c),
    };

    setAttribute(k: string, v: string) {
      this.attributes.set(k, v);
    }
    getAttribute(k: string) {
      return this.attributes.get(k) ?? null;
    }
    appendChild(child: MockHTMLElement) {
      this.children.push(child);
      return child;
    }
    remove() {
      this.removed = true;
    }
    addEventListener(type: string, fn: (e: any) => void) {
      if (!this.listeners.has(type)) this.listeners.set(type, new Set());
      this.listeners.get(type)!.add(fn);
    }
    removeEventListener(type: string, fn: (e: any) => void) {
      this.listeners.get(type)?.delete(fn);
    }
    getBoundingClientRect() {
      return { left: 0, top: 0, width: 1000, height: 500 };
    }
  }

  g.HTMLElement = MockHTMLElement;
  g.Element = MockHTMLElement;
  g.document = {
    createElement: (tag: string) => {
      const el = new MockHTMLElement();
      el.tagName = tag.toUpperCase();
      return el;
    },
  };
  g.window = {
    addEventListener: (type: string, fn: (e: any) => void) => {
      if (!windowListeners.has(type)) windowListeners.set(type, new Set());
      windowListeners.get(type)!.add(fn);
    },
    removeEventListener: (type: string, fn: (e: any) => void) => {
      windowListeners.get(type)?.delete(fn);
    },
  };

  const maskEl = new MockHTMLElement() as unknown as HTMLElement;
  const playerEl = new MockHTMLElement() as unknown as HTMLElement;
  const videoEl = Object.assign(new MockHTMLElement(), {
    videoWidth: 1920,
    videoHeight: 1080,
  }) as unknown as HTMLVideoElement;

  return {
    maskEl,
    playerEl,
    videoEl,
    dispatchKeyDown(init) {
      let defaultPrevented = false;
      let propagationStopped = false;
      const evt = {
        key: init.key,
        shiftKey: !!init.shiftKey,
        ctrlKey: !!init.ctrlKey,
        metaKey: !!init.metaKey,
        altKey: !!init.altKey,
        target: init.target ?? null,
        preventDefault: () => {
          defaultPrevented = true;
        },
        stopPropagation: () => {
          propagationStopped = true;
        },
      };
      for (const fn of windowListeners.get('keydown') ?? []) {
        fn(evt);
      }
      return { defaultPrevented, propagationStopped };
    },
    cleanup() {
      delete g.HTMLElement;
      delete g.Element;
      delete g.document;
      delete g.window;
    },
  };
}

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
    assert.ok(latestUpdatedRect);
    assert.ok(Math.abs((latestUpdatedRect as Rect).x - 0.51) < 1e-6);

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

test('MaskEditor - blocks YouTube hotkeys during edit mode but allows typing in INPUT elements', () => {
  const env = createMockEditorEnv();
  try {
    const editor = new MaskEditor({
      maskEl: env.maskEl,
      playerEl: env.playerEl,
      videoEl: env.videoEl,
      initialRect: { x: 0.2, y: 0.2, w: 0.3, h: 0.3 },
    });

    // 'k' and ' ' should be blocked when focus is not in an input
    const resK = env.dispatchKeyDown({ key: 'k' });
    assert.equal(resK.defaultPrevented, true);
    assert.equal(resK.propagationStopped, true);

    const resDigit = env.dispatchKeyDown({ key: '5' });
    assert.equal(resDigit.defaultPrevented, true);

    // Typing 'k' inside an <input> element should NOT be blocked
    const inputEl = g.document.createElement('input');
    const resInput = env.dispatchKeyDown({ key: 'k', target: inputEl });
    assert.equal(resInput.defaultPrevented, false);
    assert.equal(resInput.propagationStopped, false);

    editor.destroy();
  } finally {
    env.cleanup();
  }
});
