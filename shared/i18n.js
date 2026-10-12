(() => {
  'use strict';

  function getMessage(key, substitutions) {
    if (typeof browser !== 'undefined' && browser.i18n && browser.i18n.getMessage) {
      const msg = browser.i18n.getMessage(key, substitutions);
      if (msg) return msg;
    }
    if (typeof chrome !== 'undefined' && chrome.i18n && chrome.i18n.getMessage) {
      const msg = chrome.i18n.getMessage(key, substitutions);
      if (msg) return msg;
    }
    return key;
  }

  function applyI18n(root = document) {
    // 1. data-i18n="messageKey" -> textContent
    const textEls = root.querySelectorAll('[data-i18n]');
    for (const el of textEls) {
      const key = el.getAttribute('data-i18n');
      if (key) {
        const msg = getMessage(key);
        if (msg) el.textContent = msg;
      }
    }

    // 2. data-i18n-placeholder="messageKey" -> placeholder
    const placeholderEls = root.querySelectorAll('[data-i18n-placeholder]');
    for (const el of placeholderEls) {
      const key = el.getAttribute('data-i18n-placeholder');
      if (key) {
        const msg = getMessage(key);
        if (msg) el.setAttribute('placeholder', msg);
      }
    }

    // 3. data-i18n-attr="attrName:messageKey;attrName2:messageKey2"
    const attrEls = root.querySelectorAll('[data-i18n-attr]');
    for (const el of attrEls) {
      const spec = el.getAttribute('data-i18n-attr');
      if (spec) {
        const pairs = spec.split(';');
        for (const pair of pairs) {
          const [attr, key] = pair.split(':').map((s) => s.trim());
          if (attr && key) {
            const msg = getMessage(key);
            if (msg) el.setAttribute(attr, msg);
          }
        }
      }
    }
  }

  const ATF_I18N = {
    getMessage,
    applyI18n
  };

  if (typeof globalThis !== 'undefined') {
    globalThis.ATF = globalThis.ATF || {};
    globalThis.ATF.I18N = ATF_I18N;
  }
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = ATF_I18N;
  }
})();
