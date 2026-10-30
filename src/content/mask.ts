import { getVideoBox, toPx } from './geometry';
import type { PxBox } from '../types/geometry';
import type { Mask, MaskStyle, Rect } from '../types/schema';

export function hexToRgba(hex: string, opacity = 1): string {
  if (!hex || typeof hex !== 'string') return `rgba(0, 0, 0, ${opacity})`;
  let clean = hex.replace('#', '');
  if (clean.length === 3) {
    clean = clean
      .split('')
      .map((c) => c + c)
      .join('');
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
 */
export function applyMaskStyle(
  maskEl: HTMLElement | null | undefined,
  style: Partial<MaskStyle> | null | undefined
): void {
  if (!maskEl || !style) return;

  const type = style.type || 'blur';
  const color = style.color || '#000000';
  const opacity =
    typeof style.opacity === 'number'
      ? style.opacity
      : type === 'solid'
        ? 1.0
        : 0.45;
  const blur = typeof style.blur === 'number' ? style.blur : 16;

  if (type === 'solid') {
    maskEl.style.backdropFilter = 'none';
    if (typeof maskEl.style.setProperty === 'function') {
      maskEl.style.setProperty('-webkit-backdrop-filter', 'none');
    } else {
      (maskEl.style as unknown as Record<string, string>).webkitBackdropFilter =
        'none';
    }
    maskEl.style.backgroundColor = hexToRgba(color, opacity);
  } else {
    // Blur type: backdrop blur filter + subtle color tint overlay
    const blurValue = `blur(${Math.max(0, blur)}px)`;
    maskEl.style.backdropFilter = blurValue;
    if (typeof maskEl.style.setProperty === 'function') {
      maskEl.style.setProperty('-webkit-backdrop-filter', blurValue);
    } else {
      (maskEl.style as unknown as Record<string, string>).webkitBackdropFilter =
        blurValue;
    }
    maskEl.style.backgroundColor = hexToRgba(color, opacity);
  }
}

/**
 * Updates mask element position & size in pixel coordinates relative to player.
 */
export function updateMaskPosition(
  maskEl: HTMLElement | null | undefined,
  rect: Rect | null | undefined,
  playerEl: HTMLElement | null | undefined,
  videoEl: HTMLVideoElement | null | undefined
): { box: PxBox; px: PxBox } | null {
  if (!maskEl || !rect || !playerEl || !videoEl) {
    return null;
  }

  const playerRect = playerEl.getBoundingClientRect();
  const videoRect = videoEl.getBoundingClientRect();
  const box = getVideoBox(
    playerRect,
    videoRect,
    videoEl.videoWidth,
    videoEl.videoHeight
  );
  const px = toPx(rect, box);

  maskEl.style.left = `${Math.round(px.left)}px`;
  maskEl.style.top = `${Math.round(px.top)}px`;
  maskEl.style.width = `${Math.round(px.width)}px`;
  maskEl.style.height = `${Math.round(px.height)}px`;

  return { box, px };
}

export function insertMaskIntoPlayer(
  maskEl: HTMLElement | null | undefined,
  playerEl: HTMLElement | null | undefined
): void {
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
 */
export function createMaskElement(
  playerEl: HTMLElement,
  maskId: string
): HTMLElement {
  let maskEl = playerEl.querySelector<HTMLElement>(
    `.atf-mask[data-atf-mask-id="${maskId}"]`
  );
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
 * Synchronizes all masks of the active profile inside #movie_player,
 * updating styles and positions, and removing any stale mask DOM elements.
 */
export function syncProfileMasks(
  playerEl: HTMLElement,
  videoEl: HTMLVideoElement,
  masks: readonly Mask[]
): Map<string, HTMLElement> {
  const activeMap = new Map<string, HTMLElement>();

  for (let i = 0; i < masks.length; i++) {
    const maskData = masks[i]!;
    const maskEl = createMaskElement(playerEl, maskData.id);
    maskEl.setAttribute('data-atf-mask-index', String(i + 1));

    const filterEl =
      maskEl.querySelector<HTMLElement>('.atf-mask-filter') || maskEl;
    applyMaskStyle(filterEl, maskData.style);
    updateMaskPosition(maskEl, maskData.rect, playerEl, videoEl);

    activeMap.set(maskData.id, maskEl);
  }

  const existing = playerEl.querySelectorAll<HTMLElement>('.atf-mask');
  for (const el of existing) {
    const id = el.getAttribute('data-atf-mask-id');
    if (!id || !activeMap.has(id)) {
      el.remove();
    }
  }

  return activeMap;
}

/**
 * Removes all A.T.Field mask elements from player.
 */
export function removeAllMasks(playerEl: HTMLElement | null | undefined): void {
  if (!playerEl) return;
  const masks = playerEl.querySelectorAll('.atf-mask');
  for (const m of masks) {
    m.remove();
  }
}
