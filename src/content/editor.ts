import { clampRect, getVideoBox, toPx, toRatio } from './geometry';
import { getMessage, type MessageKey } from '../shared/i18n';
import type { PxBox } from '../types/geometry';
import type { Rect } from '../types/schema';

function getEditorMessage(
  key: MessageKey | string,
  fallback: string,
  substitutions?: string | string[]
): string {
  const msg = getMessage(key, substitutions);
  if (msg && msg !== key) return msg;
  return fallback;
}

export const HANDLES = ['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w'] as const;
export type HandleDir = (typeof HANDLES)[number];
export type DragMode = 'move' | HandleDir;

export interface MaskEditorOptions {
  maskEl: HTMLElement;
  playerEl: HTMLElement;
  videoEl: HTMLVideoElement;
  initialRect: Rect;
  maskIndex?: number;
  totalMasks?: number;
  onUpdate?: (rect: Rect) => void;
  onSave?: (rect: Rect) => void | Promise<void>;
  onExit?: () => void;
  onCycleMask?: (delta: 1 | -1) => void;
}

export class MaskEditor {
  private maskEl: HTMLElement;
  private playerEl: HTMLElement;
  private videoEl: HTMLVideoElement;
  private initialRect: Rect;
  private currentRect: Rect;
  private maskIndex?: number;
  private totalMasks?: number;
  private onUpdate?: (rect: Rect) => void;
  private onSave?: (rect: Rect) => void | Promise<void>;
  private onExit?: () => void;
  private onCycleMask?: (delta: 1 | -1) => void;

  private isDragging = false;
  private dragMode: DragMode | null = null;
  private dragStartPoint: { x: number; y: number } | null = null;
  private dragStartPx: PxBox | null = null;
  private currentBox: PxBox | null = null;

  private saveDebounceTimer: ReturnType<typeof setTimeout> | null = null;
  private moveAnimFrameId: number | null = null;
  private pendingPointerPoint: { x: number; y: number } | null = null;
  private handlesContainer: HTMLDivElement | null = null;
  private bannerEl: HTMLDivElement | null = null;
  private isCommitting = false;

  private boundPreventNative = (e: Event): void => {
    e.stopPropagation();
  };

  private boundOnPointerDown = (e: PointerEvent): void => {
    if (this.isCommitting) return;
    // Left click only
    if (e.button !== 0) return;
    e.preventDefault();
    e.stopPropagation();

    const handleDir =
      e.target instanceof Element
        ? (e.target.getAttribute('data-handle-dir') as HandleDir | null)
        : null;
    this.dragMode = handleDir || 'move';
    this.isDragging = true;

    const playerRect = this.playerEl.getBoundingClientRect();
    const videoRect = this.videoEl.getBoundingClientRect();
    this.currentBox = getVideoBox(
      playerRect,
      videoRect,
      this.videoEl.videoWidth,
      this.videoEl.videoHeight
    );

    this.dragStartPoint = { x: e.clientX, y: e.clientY };
    this.dragStartPx = toPx(this.currentRect, this.currentBox);

    try {
      this.maskEl.setPointerCapture(e.pointerId);
    } catch {}

    window.addEventListener('pointermove', this.boundOnPointerMove, true);
    window.addEventListener('pointerup', this.boundOnPointerUp, true);
    window.addEventListener('pointercancel', this.boundOnPointerUp, true);
  };

  private boundOnPointerMove = (e: PointerEvent): void => {
    if (
      !this.isDragging ||
      !this.dragStartPoint ||
      !this.dragStartPx ||
      !this.currentBox
    )
      return;
    e.preventDefault();
    e.stopPropagation();

    this.pendingPointerPoint = { x: e.clientX, y: e.clientY };

    if (!this.moveAnimFrameId) {
      this.moveAnimFrameId = requestAnimationFrame(() => {
        this.moveAnimFrameId = null;
        this.applyPointerMove();
      });
    }
  };

  private boundOnPointerUp = (e: PointerEvent): void => {
    if (!this.isDragging) return;
    e.preventDefault();
    e.stopPropagation();

    if (this.moveAnimFrameId) {
      cancelAnimationFrame(this.moveAnimFrameId);
      this.moveAnimFrameId = null;
    }
    this.applyPointerMove();

    this.isDragging = false;
    this.dragMode = null;
    this.dragStartPoint = null;
    this.dragStartPx = null;
    this.pendingPointerPoint = null;

    try {
      this.maskEl.releasePointerCapture(e.pointerId);
    } catch {}

    window.removeEventListener('pointermove', this.boundOnPointerMove, true);
    window.removeEventListener('pointerup', this.boundOnPointerUp, true);
    window.removeEventListener('pointercancel', this.boundOnPointerUp, true);

    this.triggerDebouncedSave();
  };

  private boundOnKeyDown = (e: KeyboardEvent): void => {
    if (this.isCommitting) return;

    // 1. Allow browser and system modifier combinations (Cmd+C, Ctrl+F, Alt+Tab, etc.)
    if (e.ctrlKey || e.metaKey || e.altKey) {
      return;
    }

    // 2. Allow typing in input fields, textareas, or contenteditable elements
    const target = e.target;
    if (
      target instanceof HTMLElement &&
      (target.tagName === 'INPUT' ||
        target.tagName === 'TEXTAREA' ||
        target.isContentEditable)
    ) {
      return;
    }

    // Escape: Cancel and rollback to initial rect
    if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      void this.commitAndExit(this.initialRect);
      return;
    }

    // Enter: Save and exit edit mode
    if (e.key === 'Enter') {
      e.preventDefault();
      e.stopPropagation();
      void this.commitAndExit(this.currentRect);
      return;
    }

    // Tab / Shift+Tab: Cycle between multiple masks
    if (e.key === 'Tab' && this.onCycleMask) {
      e.preventDefault();
      e.stopPropagation();
      void this.flushPendingSave();
      this.onCycleMask(e.shiftKey ? -1 : 1);
      return;
    }

    // Arrow keys: fine-tune positioning
    if (e.key.startsWith('Arrow')) {
      e.preventDefault();
      e.stopPropagation();
      const step = e.shiftKey ? 0.01 : 0.002;
      if (e.key === 'ArrowUp') this.currentRect.y -= step;
      if (e.key === 'ArrowDown') this.currentRect.y += step;
      if (e.key === 'ArrowLeft') this.currentRect.x -= step;
      if (e.key === 'ArrowRight') this.currentRect.x += step;

      this.currentRect = clampRect(this.currentRect);
      this.refresh();
      if (this.onUpdate) {
        this.onUpdate(this.currentRect);
      }
      this.triggerDebouncedSave();
      return;
    }

    // Block YouTube hotkeys (k, j, l, f, t, m, Space, 0-9) during editing
    const blockedHotkeys = [' ', 'k', 'j', 'l', 'f', 't', 'm', 'c'];
    if (
      blockedHotkeys.includes(e.key.toLowerCase()) ||
      (e.key >= '0' && e.key <= '9')
    ) {
      e.preventDefault();
      e.stopPropagation();
    }
  };

  constructor(options: MaskEditorOptions) {
    this.maskEl = options.maskEl;
    this.playerEl = options.playerEl;
    this.videoEl = options.videoEl;
    this.initialRect = { ...options.initialRect };
    this.currentRect = { ...options.initialRect };
    this.maskIndex = options.maskIndex;
    this.totalMasks = options.totalMasks;
    this.onUpdate = options.onUpdate;
    this.onSave = options.onSave;
    this.onExit = options.onExit;
    this.onCycleMask = options.onCycleMask;

    this.setup();
  }

  private setup(): void {
    this.maskEl.classList.remove('atf-editing-inactive');
    this.maskEl.classList.add('atf-editing');

    // Create handle elements
    this.handlesContainer = document.createElement('div');
    this.handlesContainer.className = 'atf-handles-container';

    for (const dir of HANDLES) {
      const handle = document.createElement('div');
      handle.className = `atf-handle atf-handle-${dir}`;
      handle.setAttribute('data-handle-dir', dir);
      this.handlesContainer.appendChild(handle);
    }
    this.maskEl.appendChild(this.handlesContainer);

    // Create editor info banner
    this.bannerEl = document.createElement('div');
    this.bannerEl.className = 'atf-editing-banner';
    if (this.totalMasks && this.totalMasks > 1 && this.maskIndex) {
      const idxStr = String(this.maskIndex);
      this.bannerEl.textContent = getEditorMessage(
        'editingBannerMulti',
        `Editing Mask #${idxStr} · Tab to switch (Esc: Cancel, Enter: Save)`,
        [idxStr]
      );
    } else {
      this.bannerEl.textContent = getEditorMessage(
        'editingBanner',
        'Editing Mask · Drag/Resize (Esc: Cancel, Enter: Save)'
      );
    }
    this.maskEl.appendChild(this.bannerEl);

    // Attach pointer listeners
    this.maskEl.addEventListener('pointerdown', this.boundOnPointerDown);
    // Suppress native video click/dblclick events
    this.maskEl.addEventListener('click', this.boundPreventNative);
    this.maskEl.addEventListener('dblclick', this.boundPreventNative);

    // Capture key events at window level
    window.addEventListener('keydown', this.boundOnKeyDown, true);

    this.refresh();
  }

  refresh(): void {
    if (!this.playerEl || !this.videoEl) return;
    const playerRect = this.playerEl.getBoundingClientRect();
    const videoRect = this.videoEl.getBoundingClientRect();
    this.currentBox = getVideoBox(
      playerRect,
      videoRect,
      this.videoEl.videoWidth,
      this.videoEl.videoHeight
    );

    const px = toPx(this.currentRect, this.currentBox);
    this.maskEl.style.left = `${Math.round(px.left)}px`;
    this.maskEl.style.top = `${Math.round(px.top)}px`;
    this.maskEl.style.width = `${Math.round(px.width)}px`;
    this.maskEl.style.height = `${Math.round(px.height)}px`;
  }

  private applyPointerMove(): void {
    if (
      !this.isDragging ||
      !this.pendingPointerPoint ||
      !this.dragStartPoint ||
      !this.dragStartPx ||
      !this.currentBox ||
      !this.dragMode
    )
      return;

    const dx = this.pendingPointerPoint.x - this.dragStartPoint.x;
    const dy = this.pendingPointerPoint.y - this.dragStartPoint.y;

    let { left, top, width, height } = this.dragStartPx;

    if (this.dragMode === 'move') {
      left += dx;
      top += dy;
    } else {
      // Resizing with handle
      if (this.dragMode.includes('e')) {
        width += dx;
      }
      if (this.dragMode.includes('s')) {
        height += dy;
      }
      if (this.dragMode.includes('w')) {
        left += dx;
        width -= dx;
      }
      if (this.dragMode.includes('n')) {
        top += dy;
        height -= dy;
      }
    }

    // Convert to ratio and clamp
    const rawRatio = toRatio({ left, top, width, height }, this.currentBox);
    this.currentRect = clampRect(rawRatio);

    // Apply updated coordinates
    const clampedPx = toPx(this.currentRect, this.currentBox);
    this.maskEl.style.left = `${Math.round(clampedPx.left)}px`;
    this.maskEl.style.top = `${Math.round(clampedPx.top)}px`;
    this.maskEl.style.width = `${Math.round(clampedPx.width)}px`;
    this.maskEl.style.height = `${Math.round(clampedPx.height)}px`;

    if (this.onUpdate) {
      this.onUpdate(this.currentRect);
    }
  }

  private cancelPendingWork(): void {
    if (this.saveDebounceTimer) {
      clearTimeout(this.saveDebounceTimer);
      this.saveDebounceTimer = null;
    }
    if (this.moveAnimFrameId) {
      cancelAnimationFrame(this.moveAnimFrameId);
      this.moveAnimFrameId = null;
    }
    if (this.isDragging) {
      this.isDragging = false;
      this.dragMode = null;
      this.dragStartPoint = null;
      this.dragStartPx = null;
      this.pendingPointerPoint = null;
      window.removeEventListener('pointermove', this.boundOnPointerMove, true);
      window.removeEventListener('pointerup', this.boundOnPointerUp, true);
      window.removeEventListener('pointercancel', this.boundOnPointerUp, true);
    }
  }

  private async commitAndExit(targetRect: Rect): Promise<void> {
    if (this.isCommitting) return;
    this.isCommitting = true;

    this.cancelPendingWork();
    this.currentRect = { ...targetRect };
    this.refresh();

    if (this.onUpdate) {
      this.onUpdate(this.currentRect);
    }
    try {
      if (this.onSave) {
        await this.onSave(this.currentRect);
      }
    } finally {
      if (this.onExit) {
        this.onExit();
      }
    }
  }

  async flushPendingSave(): Promise<void> {
    if (this.saveDebounceTimer) {
      clearTimeout(this.saveDebounceTimer);
      this.saveDebounceTimer = null;
      if (this.onSave) {
        await this.onSave(this.currentRect);
      }
    }
  }

  private triggerDebouncedSave(): void {
    if (this.saveDebounceTimer) clearTimeout(this.saveDebounceTimer);
    this.saveDebounceTimer = setTimeout(async () => {
      this.saveDebounceTimer = null;
      if (this.onSave) {
        await this.onSave(this.currentRect);
      }
    }, 300);
  }

  destroy(): void {
    this.cancelPendingWork();

    this.maskEl.removeEventListener('pointerdown', this.boundOnPointerDown);
    this.maskEl.removeEventListener('click', this.boundPreventNative);
    this.maskEl.removeEventListener('dblclick', this.boundPreventNative);
    window.removeEventListener('keydown', this.boundOnKeyDown, true);
    window.removeEventListener('pointermove', this.boundOnPointerMove, true);
    window.removeEventListener('pointerup', this.boundOnPointerUp, true);
    window.removeEventListener('pointercancel', this.boundOnPointerUp, true);

    if (this.handlesContainer) this.handlesContainer.remove();
    if (this.bannerEl) this.bannerEl.remove();

    this.maskEl.classList.remove('atf-editing');
  }
}
