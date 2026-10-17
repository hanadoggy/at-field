import type { Rect, Settings } from '../types/schema';

export const SCHEMA_VERSION = 1;
export const CHANNEL_KEY_PREFIX = 'ch:';
export const META_KEY = 'meta';
export const SETTINGS_KEY = 'settings';

export const DEFAULT_SETTINGS = {
  enabled: true,
  defaultStyle: {
    type: 'blur', // 'solid' | 'blur'
    color: '#000000',
    opacity: 0.45,
    blur: 16,
  },
} as const satisfies Settings;

// Initial rectangle when user adds a mask to a channel
// Positioned around bottom-right where YouTube chat overlay typically sits
export const DEFAULT_MASK_RECT = {
  x: 0.72,
  y: 0.55,
  w: 0.26,
  h: 0.42,
} as const satisfies Rect;

export const MIN_MASK_SIZE = 0.02; // Minimum 2% width / height

export const DEFAULT_OPACITY_SOLID = 1.0;
export const DEFAULT_OPACITY_BLUR = 0.45;
