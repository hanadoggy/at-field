import { MIN_MASK_SIZE } from '../shared/constants';
import type { ClientRectLike, PxBox } from '../types/geometry';
import type { Rect } from '../types/schema';

export function toFiniteNumber(val: unknown, fallback: number): number {
  if (typeof val === 'number' && Number.isFinite(val)) return val;
  if (typeof val === 'string' && val.trim() !== '') {
    const parsed = Number(val);
    if (Number.isFinite(parsed)) return parsed;
  }
  return fallback;
}

/**
 * Computes the rendered video bounding box relative to player element.
 * Eliminates Letterbox (top/bottom) and Pillarbox (left/right) black bars.
 */
export function getVideoBox(
  playerRect: ClientRectLike | null | undefined,
  videoRect: ClientRectLike | null | undefined,
  videoWidth: number,
  videoHeight: number
): PxBox {
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
      height: Math.max(0, elHeight),
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
    height: renderHeight,
  };
}

/**
 * Converts 0.0-1.0 relative percentage coordinates to pixel coordinates
 * within the player coordinate space.
 */
export function toPx(
  rect: Partial<Rect> | null | undefined,
  box: PxBox | null | undefined
): PxBox {
  if (!rect || !box) {
    return { left: 0, top: 0, width: 0, height: 0 };
  }
  return {
    left: box.left + toFiniteNumber(rect.x, 0) * box.width,
    top: box.top + toFiniteNumber(rect.y, 0) * box.height,
    width: toFiniteNumber(rect.w, 0) * box.width,
    height: toFiniteNumber(rect.h, 0) * box.height,
  };
}

/**
 * Converts pixel coordinates within the player space back to 0.0-1.0 relative
 * coordinates relative to the rendered video box.
 */
export function toRatio(
  px: PxBox | null | undefined,
  box: PxBox | null | undefined
): Rect {
  if (!px || !box || box.width <= 0 || box.height <= 0) {
    return { x: 0, y: 0, w: 0, h: 0 };
  }
  return {
    x: (px.left - box.left) / box.width,
    y: (px.top - box.top) / box.height,
    w: px.width / box.width,
    h: px.height / box.height,
  };
}

/**
 * Clamps relative coordinates within valid [0, 1] range ensuring minimum dimension.
 */
export function clampRect(
  rect: Partial<Rect> | null | undefined,
  minSize = MIN_MASK_SIZE
): Rect {
  if (!rect) return { x: 0, y: 0, w: minSize, h: minSize };
  const min = Math.max(0.001, Math.min(1, minSize));
  const rawW = toFiniteNumber(rect.w, min);
  const rawH = toFiniteNumber(rect.h, min);
  const w = Math.max(min, Math.min(1, rawW > 0 ? rawW : min));
  const h = Math.max(min, Math.min(1, rawH > 0 ? rawH : min));
  const x = Math.max(0, Math.min(1 - w, toFiniteNumber(rect.x, 0)));
  const y = Math.max(0, Math.min(1 - h, toFiniteNumber(rect.y, 0)));
  return { x, y, w, h };
}
