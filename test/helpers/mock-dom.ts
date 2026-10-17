import type { Rect } from '../../src/types/schema';

const g = globalThis as Record<string, unknown>;

/**
 * Temporarily assigns properties on `globalThis` for the duration of `fn`,
 * restoring previous values (or deleting keys that were previously undefined)
 * in a `finally` block. Supports both sync and async callbacks.
 */
export function withMockGlobals<T>(
  overrides: Record<string, unknown>,
  fn: () => T
): T {
  const keys = Object.keys(overrides);
  const previous = new Map<string, { existed: boolean; value: unknown }>();

  for (const key of keys) {
    previous.set(key, {
      existed: Object.prototype.hasOwnProperty.call(g, key),
      value: g[key],
    });
    g[key] = overrides[key];
  }

  const restore = () => {
    for (const [key, prev] of previous.entries()) {
      if (prev.existed) {
        g[key] = prev.value;
      } else {
        delete g[key];
      }
    }
  };

  try {
    const result = fn();
    if (result instanceof Promise) {
      return result.finally(restore) as unknown as T;
    }
    restore();
    return result;
  } catch (err) {
    restore();
    throw err;
  }
}

export class MockHTMLElement {
  tagName = 'DIV';
  className = '';
  textContent = '';
  isContentEditable = false;
  style: Record<string, string> = {};
  attributes = new Map<string, string>();
  children: MockHTMLElement[] = [];
  listeners = new Map<string, Set<(e: any) => void>>();
  removed = false;
  private boundingRect = { left: 0, top: 0, width: 1000, height: 500 };

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

  constructor(tagName = 'DIV', rect?: { left: number; top: number; width: number; height: number }) {
    this.tagName = tagName.toUpperCase();
    if (rect) {
      this.boundingRect = { ...rect };
    }
  }

  setAttribute(k: string, v: string): void {
    this.attributes.set(k, v);
  }

  getAttribute(k: string): string | null {
    return this.attributes.get(k) ?? null;
  }

  hasAttribute(k: string): boolean {
    return this.attributes.has(k);
  }

  appendChild(child: MockHTMLElement): MockHTMLElement {
    this.children.push(child);
    return child;
  }

  remove(): void {
    this.removed = true;
  }

  addEventListener(type: string, fn: (e: any) => void): void {
    if (!this.listeners.has(type)) this.listeners.set(type, new Set());
    this.listeners.get(type)!.add(fn);
  }

  removeEventListener(type: string, fn: (e: any) => void): void {
    this.listeners.get(type)?.delete(fn);
  }

  dispatchEvent(type: string, eventInit: Record<string, unknown> = {}): {
    defaultPrevented: boolean;
    propagationStopped: boolean;
  } {
    let defaultPrevented = false;
    let propagationStopped = false;
    const evt = {
      type,
      target: this,
      button: 0,
      pointerId: 1,
      clientX: 0,
      clientY: 0,
      ...eventInit,
      preventDefault: () => {
        defaultPrevented = true;
      },
      stopPropagation: () => {
        propagationStopped = true;
      },
    };
    for (const fn of this.listeners.get(type) ?? []) {
      fn(evt);
    }
    return { defaultPrevented, propagationStopped };
  }

  setPointerCapture(_pointerId: number): void {}
  releasePointerCapture(_pointerId: number): void {}

  getBoundingClientRect(): { left: number; top: number; width: number; height: number } {
    return { ...this.boundingRect };
  }
}

export interface MockEditorEnv {
  maskEl: HTMLElement;
  maskMock: MockHTMLElement;
  playerEl: HTMLElement;
  videoEl: HTMLVideoElement;
  getHandleElement: (dir: string) => MockHTMLElement | null;
  dispatchKeyDown: (init: {
    key: string;
    shiftKey?: boolean;
    ctrlKey?: boolean;
    metaKey?: boolean;
    altKey?: boolean;
    target?: unknown;
  }) => { defaultPrevented: boolean; propagationStopped: boolean };
  dispatchPointerDown: (init: {
    clientX: number;
    clientY: number;
    button?: number;
    target?: unknown;
  }) => { defaultPrevented: boolean; propagationStopped: boolean };
  dispatchPointerMove: (init: { clientX: number; clientY: number }) => void;
  dispatchPointerUp: (init?: { clientX?: number; clientY?: number }) => void;
  flushAnimationFrames: () => void;
  cleanup: () => void;
}

export function createMockEditorEnv(
  boxSize: { width: number; height: number } = { width: 1000, height: 500 }
): MockEditorEnv {
  const windowListeners = new Map<string, Set<(e: any) => void>>();
  const rafQueue = new Map<number, FrameRequestCallback>();
  let nextRafId = 1;

  const rect = { left: 0, top: 0, width: boxSize.width, height: boxSize.height };
  const maskMock = new MockHTMLElement('DIV', rect);
  const playerMock = new MockHTMLElement('DIV', rect);
  const videoMock = Object.assign(new MockHTMLElement('VIDEO', rect), {
    videoWidth: boxSize.width,
    videoHeight: boxSize.height,
  });

  const prevGlobals = {
    HTMLElement: g.HTMLElement,
    Element: g.Element,
    document: g.document,
    window: g.window,
    requestAnimationFrame: g.requestAnimationFrame,
    cancelAnimationFrame: g.cancelAnimationFrame,
  };

  g.HTMLElement = MockHTMLElement;
  g.Element = MockHTMLElement;
  g.document = {
    createElement: (tag: string) => new MockHTMLElement(tag, rect),
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
  g.requestAnimationFrame = (cb: FrameRequestCallback): number => {
    const id = nextRafId++;
    rafQueue.set(id, cb);
    return id;
  };
  g.cancelAnimationFrame = (id: number): void => {
    rafQueue.delete(id);
  };

  return {
    maskEl: maskMock as unknown as HTMLElement,
    maskMock,
    playerEl: playerMock as unknown as HTMLElement,
    videoEl: videoMock as unknown as HTMLVideoElement,
    getHandleElement(dir: string): MockHTMLElement | null {
      const container = maskMock.children.find(
        (c) => c.className === 'atf-handles-container'
      );
      if (!container) return null;
      return (
        container.children.find(
          (h) => h.getAttribute('data-handle-dir') === dir
        ) ?? null
      );
    },
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
    dispatchPointerDown(init) {
      return maskMock.dispatchEvent('pointerdown', {
        button: init.button ?? 0,
        pointerId: 1,
        clientX: init.clientX,
        clientY: init.clientY,
        target: init.target ?? maskMock,
      });
    },
    dispatchPointerMove(init) {
      const evt = {
        pointerId: 1,
        clientX: init.clientX,
        clientY: init.clientY,
        preventDefault: () => {},
        stopPropagation: () => {},
      };
      for (const fn of windowListeners.get('pointermove') ?? []) {
        fn(evt);
      }
    },
    dispatchPointerUp(init = {}) {
      const evt = {
        pointerId: 1,
        clientX: init.clientX ?? 0,
        clientY: init.clientY ?? 0,
        preventDefault: () => {},
        stopPropagation: () => {},
      };
      for (const fn of windowListeners.get('pointerup') ?? []) {
        fn(evt);
      }
    },
    flushAnimationFrames() {
      const callbacks = Array.from(rafQueue.values());
      rafQueue.clear();
      for (const cb of callbacks) {
        cb(16);
      }
    },
    cleanup() {
      for (const [k, v] of Object.entries(prevGlobals)) {
        if (v === undefined) {
          delete g[k];
        } else {
          g[k] = v;
        }
      }
    },
  };
}

export function assertRectClose(
  actual: Rect | null | undefined,
  expected: Rect,
  eps = 1e-6
): void {
  if (!actual) {
    throw new Error(`Expected Rect ${JSON.stringify(expected)}, got ${actual}`);
  }
  if (
    Math.abs(actual.x - expected.x) > eps ||
    Math.abs(actual.y - expected.y) > eps ||
    Math.abs(actual.w - expected.w) > eps ||
    Math.abs(actual.h - expected.h) > eps
  ) {
    throw new Error(
      `Rect mismatch: actual=${JSON.stringify(actual)}, expected=${JSON.stringify(expected)}`
    );
  }
}
