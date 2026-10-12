(() => {
  'use strict';

  /**
   * Computes the rendered video bounding box relative to player element.
   * Eliminates Letterbox (top/bottom) and Pillarbox (left/right) black bars.
   *
   * @param {DOMRect|Object} playerRect - Bounding rect of #movie_player
   * @param {DOMRect|Object} videoRect - Bounding rect of <video>
   * @param {number} videoWidth - video.videoWidth
   * @param {number} videoHeight - video.videoHeight
   * @returns {{left: number, top: number, width: number, height: number}} Box in player coords
   */
  function getVideoBox(playerRect, videoRect, videoWidth, videoHeight) {
    if (!playerRect || !videoRect) {
      return { left: 0, top: 0, width: 0, height: 0 };
    }

    const elLeft = videoRect.left - playerRect.left;
    const elTop = videoRect.top - playerRect.top;
    const elWidth = videoRect.width;
    const elHeight = videoRect.height;

    if (!videoWidth || !videoHeight || elWidth <= 0 || elHeight <= 0) {
      return {
        left: elLeft,
        top: elTop,
        width: Math.max(0, elWidth),
        height: Math.max(0, elHeight)
      };
    }

    const videoRatio = videoWidth / videoHeight;
    const elemRatio = elWidth / elHeight;

    let renderWidth = elWidth;
    let renderHeight = elHeight;
    let offsetX = 0;
    let offsetY = 0;

    // Epsilon to avoid tiny float rounding discrepancies
    if (Math.abs(videoRatio - elemRatio) > 0.001) {
      if (videoRatio > elemRatio) {
        // Video is wider than element -> Letterbox (black bars on top and bottom)
        renderWidth = elWidth;
        renderHeight = elWidth / videoRatio;
        offsetY = (elHeight - renderHeight) / 2;
      } else {
        // Video is narrower than element -> Pillarbox (black bars on left and right)
        renderHeight = elHeight;
        renderWidth = elHeight * videoRatio;
        offsetX = (elWidth - renderWidth) / 2;
      }
    }

    return {
      left: elLeft + offsetX,
      top: elTop + offsetY,
      width: renderWidth,
      height: renderHeight
    };
  }

  /**
   * Converts 0.0-1.0 relative percentage coordinates to pixel coordinates
   * within the player coordinate space.
   *
   * @param {{x: number, y: number, w: number, h: number}} rect
   * @param {{left: number, top: number, width: number, height: number}} box
   * @returns {{left: number, top: number, width: number, height: number}}
   */
  function toPx(rect, box) {
    if (!rect || !box) {
      return { left: 0, top: 0, width: 0, height: 0 };
    }
    return {
      left: box.left + (rect.x || 0) * box.width,
      top: box.top + (rect.y || 0) * box.height,
      width: (rect.w || 0) * box.width,
      height: (rect.h || 0) * box.height
    };
  }

  /**
   * Converts pixel coordinates within the player space back to 0.0-1.0 relative
   * coordinates relative to the rendered video box.
   *
   * @param {{left: number, top: number, width: number, height: number}} px
   * @param {{left: number, top: number, width: number, height: number}} box
   * @returns {{x: number, y: number, w: number, h: number}}
   */
  function toRatio(px, box) {
    if (!px || !box || box.width <= 0 || box.height <= 0) {
      return { x: 0, y: 0, w: 0, h: 0 };
    }
    return {
      x: (px.left - box.left) / box.width,
      y: (px.top - box.top) / box.height,
      w: px.width / box.width,
      h: px.height / box.height
    };
  }

  /**
   * Clamps relative coordinates within valid [0, 1] range ensuring minimum dimension.
   *
   * @param {{x: number, y: number, w: number, h: number}} rect
   * @param {number} [minSize=0.02]
   * @returns {{x: number, y: number, w: number, h: number}}
   */
  function clampRect(rect, minSize = 0.02) {
    if (!rect) return { x: 0, y: 0, w: minSize, h: minSize };
    const min = Math.max(0.001, Math.min(1, minSize));
    const w = Math.max(min, Math.min(1, Number(rect.w) || min));
    const h = Math.max(min, Math.min(1, Number(rect.h) || min));
    const x = Math.max(0, Math.min(1 - w, Number(rect.x) || 0));
    const y = Math.max(0, Math.min(1 - h, Number(rect.y) || 0));
    return { x, y, w, h };
  }

  const ATF_GEOMETRY = {
    getVideoBox,
    toPx,
    toRatio,
    clampRect
  };

  if (typeof globalThis !== 'undefined') {
    globalThis.ATF = globalThis.ATF || {};
    globalThis.ATF.GEOMETRY = ATF_GEOMETRY;
  }
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = ATF_GEOMETRY;
  }
})();
