(() => {
  'use strict';

  const { getVideoBox, toPx, toRatio, clampRect } = (globalThis.ATF && globalThis.ATF.GEOMETRY) || {};
  function getEditorMessage(key, fallback) {
    if (globalThis.ATF && globalThis.ATF.I18N && globalThis.ATF.I18N.getMessage) {
      const msg = globalThis.ATF.I18N.getMessage(key);
      if (msg && msg !== key) return msg;
    }
    return fallback;
  }

  const HANDLES = ['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w'];

  class MaskEditor {
    /**
     * @param {Object} options
     * @param {HTMLElement} options.maskEl
     * @param {HTMLElement} options.playerEl
     * @param {HTMLVideoElement} options.videoEl
     * @param {{x: number, y: number, w: number, h: number}} options.initialRect
     * @param {(rect: Object) => void} options.onUpdate
     * @param {(rect: Object) => Promise<void>} options.onSave
     * @param {() => void} options.onExit
     */
    constructor(options) {
      this.maskEl = options.maskEl;
      this.playerEl = options.playerEl;
      this.videoEl = options.videoEl;
      this.initialRect = { ...options.initialRect };
      this.currentRect = { ...options.initialRect };
      this.onUpdate = options.onUpdate;
      this.onSave = options.onSave;
      this.onExit = options.onExit;

      this.isDragging = false;
      this.dragMode = null; // 'move' or handle direction ('nw', 'se', etc.)
      this.dragStartPoint = null;
      this.dragStartPx = null;
      this.currentBox = null;

      this.boundOnPointerDown = this.onPointerDown.bind(this);
      this.boundOnPointerMove = this.onPointerMove.bind(this);
      this.boundOnPointerUp = this.onPointerUp.bind(this);
      this.boundOnKeyDown = this.onKeyDown.bind(this);
      this.boundPreventNative = (e) => e.stopPropagation();

      this.saveDebounceTimer = null;
      this.handlesContainer = null;
      this.bannerEl = null;

      this.setup();
    }

    setup() {
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
      this.bannerEl.textContent = getEditorMessage('editingBanner', 'Editing Mask · Drag/Resize (Esc: Cancel, Enter: Save)');
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

    refresh() {
      if (!this.playerEl || !this.videoEl) return;
      const playerRect = this.playerEl.getBoundingClientRect();
      const videoRect = this.videoEl.getBoundingClientRect();
      this.currentBox = getVideoBox(playerRect, videoRect, this.videoEl.videoWidth, this.videoEl.videoHeight);

      const px = toPx(this.currentRect, this.currentBox);
      this.maskEl.style.left = `${Math.round(px.left)}px`;
      this.maskEl.style.top = `${Math.round(px.top)}px`;
      this.maskEl.style.width = `${Math.round(px.width)}px`;
      this.maskEl.style.height = `${Math.round(px.height)}px`;
    }

    onPointerDown(e) {
      // Left click only
      if (e.button !== 0) return;
      e.preventDefault();
      e.stopPropagation();

      const handleDir = e.target.getAttribute('data-handle-dir');
      this.dragMode = handleDir || 'move';
      this.isDragging = true;

      const playerRect = this.playerEl.getBoundingClientRect();
      const videoRect = this.videoEl.getBoundingClientRect();
      this.currentBox = getVideoBox(playerRect, videoRect, this.videoEl.videoWidth, this.videoEl.videoHeight);

      this.dragStartPoint = { x: e.clientX, y: e.clientY };
      this.dragStartPx = toPx(this.currentRect, this.currentBox);

      try {
        this.maskEl.setPointerCapture(e.pointerId);
      } catch {}

      window.addEventListener('pointermove', this.boundOnPointerMove, true);
      window.addEventListener('pointerup', this.boundOnPointerUp, true);
      window.addEventListener('pointercancel', this.boundOnPointerUp, true);
    }

    onPointerMove(e) {
      if (!this.isDragging || !this.dragStartPoint || !this.dragStartPx || !this.currentBox) return;
      e.preventDefault();
      e.stopPropagation();

      const dx = e.clientX - this.dragStartPoint.x;
      const dy = e.clientY - this.dragStartPoint.y;

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

    onPointerUp(e) {
      if (!this.isDragging) return;
      e.preventDefault();
      e.stopPropagation();

      this.isDragging = false;
      this.dragMode = null;
      this.dragStartPoint = null;
      this.dragStartPx = null;

      try {
        this.maskEl.releasePointerCapture(e.pointerId);
      } catch {}

      window.removeEventListener('pointermove', this.boundOnPointerMove, true);
      window.removeEventListener('pointerup', this.boundOnPointerUp, true);
      window.removeEventListener('pointercancel', this.boundOnPointerUp, true);

      this.triggerDebouncedSave();
    }

    triggerDebouncedSave() {
      if (this.saveDebounceTimer) clearTimeout(this.saveDebounceTimer);
      this.saveDebounceTimer = setTimeout(async () => {
        if (this.onSave) {
          await this.onSave(this.currentRect);
        }
      }, 300);
    }

    onKeyDown(e) {
      // Escape: Cancel and rollback to initial rect
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        this.currentRect = { ...this.initialRect };
        this.refresh();
        if (this.onSave) this.onSave(this.currentRect);
        if (this.onExit) this.onExit();
        return;
      }

      // Enter: Save and exit edit mode
      if (e.key === 'Enter') {
        e.preventDefault();
        e.stopPropagation();
        if (this.onSave) this.onSave(this.currentRect);
        if (this.onExit) this.onExit();
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
        this.triggerDebouncedSave();
        return;
      }

      // Block YouTube hotkeys (k, j, l, f, t, m, Space, 0-9) during editing
      const blockedHotkeys = [' ', 'k', 'j', 'l', 'f', 't', 'm', 'c'];
      if (blockedHotkeys.includes(e.key.toLowerCase()) || (e.key >= '0' && e.key <= '9')) {
        e.preventDefault();
        e.stopPropagation();
      }
    }

    destroy() {
      if (this.saveDebounceTimer) clearTimeout(this.saveDebounceTimer);

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

  const ATF_EDITOR = {
    MaskEditor
  };

  if (typeof globalThis !== 'undefined') {
    globalThis.ATF = globalThis.ATF || {};
    globalThis.ATF.EDITOR = ATF_EDITOR;
  }
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = ATF_EDITOR;
  }
})();
