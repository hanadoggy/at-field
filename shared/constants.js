(() => {
  'use strict';

  const SCHEMA_VERSION = 1;
  const CHANNEL_KEY_PREFIX = 'ch:';
  const META_KEY = 'meta';
  const SETTINGS_KEY = 'settings';

  const DEFAULT_SETTINGS = {
    enabled: true,
    defaultStyle: {
      type: 'blur', // 'solid' | 'blur'
      color: '#000000',
      opacity: 0.45,
      blur: 16
    }
  };

  // Initial rectangle when user adds a mask to a channel
  // Positioned around bottom-right where YouTube chat overlay typically sits
  const DEFAULT_MASK_RECT = {
    x: 0.72,
    y: 0.55,
    w: 0.26,
    h: 0.42
  };

  const MIN_MASK_SIZE = 0.02; // Minimum 2% width / height

  const DEFAULT_OPACITY_SOLID = 1.0;
  const DEFAULT_OPACITY_BLUR = 0.45;

  const ATF_CONSTANTS = {
    SCHEMA_VERSION,
    CHANNEL_KEY_PREFIX,
    META_KEY,
    SETTINGS_KEY,
    DEFAULT_SETTINGS,
    DEFAULT_MASK_RECT,
    MIN_MASK_SIZE,
    DEFAULT_OPACITY_SOLID,
    DEFAULT_OPACITY_BLUR
  };

  if (typeof globalThis !== 'undefined') {
    globalThis.ATF = globalThis.ATF || {};
    globalThis.ATF.CONSTANTS = ATF_CONSTANTS;
  }
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = ATF_CONSTANTS;
  }
})();
