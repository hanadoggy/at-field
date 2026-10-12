(() => {
  'use strict';

  const { getVideoBox, toPx } = (globalThis.ATF && globalThis.ATF.GEOMETRY) || {};

  function hexToRgba(hex, opacity = 1) {
    if (!hex || typeof hex !== 'string') return `rgba(0, 0, 0, ${opacity})`;
    let clean = hex.replace('#', '');
    if (clean.length === 3) {
      clean = clean.split('').map((c) => c + c).join('');
    }
    const num = parseInt(clean.slice(0, 6), 16);
    if (Number.isNaN(num)) return `rgba(0, 0, 0, ${opacity})`;
    const r = (num >> 16) & 255;
    const g = (num >> 8) & 255;
    const b = num & 255;
    return `rgba(${r}, ${g}, ${b}, ${Math.max(0, Math.min(1, opacity))})`;
  }

  /**
   * Applies visual styling to mask element.
   *
   * @param {HTMLElement} maskEl
   * @param {{type: string, color: string, opacity: number, blur: number}} style
   */
  function applyMaskStyle(maskEl, style) {
    if (!maskEl || !style) return;

    const type = style.type || 'blur';
    const color = style.color || '#000000';
    const opacity = typeof style.opacity === 'number' ? style.opacity : (type === 'solid' ? 1.0 : 0.45);
    const blur = typeof style.blur === 'number' ? style.blur : 16;

    if (type === 'solid') {
      maskEl.style.backdropFilter = 'none';
      maskEl.style.webkitBackdropFilter = 'none';
      maskEl.style.backgroundColor = hexToRgba(color, opacity);
    } else {
      // Blur type: backdrop blur filter + subtle color tint overlay
      const blurValue = `blur(${Math.max(0, blur)}px)`;
      maskEl.style.backdropFilter = blurValue;
      maskEl.style.webkitBackdropFilter = blurValue;
      maskEl.style.backgroundColor = hexToRgba(color, opacity);
    }
  }

  /**
   * Updates mask element position & size in pixel coordinates relative to player.
   *
   * @param {HTMLElement} maskEl
   * @param {{x: number, y: number, w: number, h: number}} rect
   * @param {HTMLElement} playerEl
   * @param {HTMLVideoElement} videoEl
   * @returns {{box: Object, px: Object}}
   */
  function updateMaskPosition(maskEl, rect, playerEl, videoEl) {
    if (!maskEl || !rect || !playerEl || !videoEl) {
      return null;
    }

    const playerRect = playerEl.getBoundingClientRect();
    const videoRect = videoEl.getBoundingClientRect();
    const box = getVideoBox(playerRect, videoRect, videoEl.videoWidth, videoEl.videoHeight);
    const px = toPx(rect, box);

    maskEl.style.left = `${Math.round(px.left)}px`;
    maskEl.style.top = `${Math.round(px.top)}px`;
    maskEl.style.width = `${Math.round(px.width)}px`;
    maskEl.style.height = `${Math.round(px.height)}px`;

    return { box, px };
  }

  function insertMaskIntoPlayer(maskEl, playerEl) {
    if (!maskEl || !playerEl) return;
    if (maskEl.parentElement === playerEl && maskEl.isConnected) return;

    const videoContainer = playerEl.querySelector('.html5-video-container');
    if (videoContainer && videoContainer.nextSibling) {
      playerEl.insertBefore(maskEl, videoContainer.nextSibling);
    } else if (videoContainer) {
      playerEl.appendChild(maskEl);
    } else {
      playerEl.appendChild(maskEl);
    }
  }

  /**
   * Creates or ensures a mask container inside #movie_player right after .html5-video-container.
   *
   * @param {HTMLElement} playerEl
   * @param {string} maskId
   * @returns {HTMLElement}
   */
  function createMaskElement(playerEl, maskId) {
    let maskEl = playerEl.querySelector(`.atf-mask[data-atf-mask-id="${maskId}"]`);
    if (maskEl) {
      insertMaskIntoPlayer(maskEl, playerEl);
      return maskEl;
    }

    maskEl = document.createElement('div');
    maskEl.className = 'atf-mask';
    maskEl.setAttribute('data-atf-mask-id', maskId);

    // Inner element for backdrop filter rendering
    const filterEl = document.createElement('div');
    filterEl.className = 'atf-mask-filter';
    maskEl.appendChild(filterEl);

    insertMaskIntoPlayer(maskEl, playerEl);
    return maskEl;
  }

  /**
   * Removes all A.T.Field mask elements from player.
   *
   * @param {HTMLElement} playerEl
   */
  function removeAllMasks(playerEl) {
    if (!playerEl) return;
    const masks = playerEl.querySelectorAll('.atf-mask');
    for (const m of masks) {
      m.remove();
    }
  }

  const ATF_MASK = {
    hexToRgba,
    applyMaskStyle,
    updateMaskPosition,
    createMaskElement,
    insertMaskIntoPlayer,
    removeAllMasks
  };

  if (typeof globalThis !== 'undefined') {
    globalThis.ATF = globalThis.ATF || {};
    globalThis.ATF.MASK = ATF_MASK;
  }
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = ATF_MASK;
  }
})();
