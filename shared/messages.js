(() => {
  'use strict';

  const MESSAGE_TYPES = {
    GET_STATE: 'ATF_GET_STATE',
    SET_EDIT_MODE: 'ATF_SET_EDIT_MODE',
    CREATE_PRESET: 'ATF_CREATE_PRESET'
  };

  const ATF_MESSAGES = {
    TYPES: MESSAGE_TYPES
  };

  if (typeof globalThis !== 'undefined') {
    globalThis.ATF = globalThis.ATF || {};
    globalThis.ATF.MESSAGES = ATF_MESSAGES;
  }
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = ATF_MESSAGES;
  }
})();
