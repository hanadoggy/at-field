(() => {
  'use strict';

  const {
    SCHEMA_VERSION,
    CHANNEL_KEY_PREFIX,
    META_KEY,
    SETTINGS_KEY,
    DEFAULT_SETTINGS,
    DEFAULT_MASK_RECT,
    MIN_MASK_SIZE,
    DEFAULT_OPACITY_SOLID,
    DEFAULT_OPACITY_BLUR
  } = (globalThis.ATF && globalThis.ATF.CONSTANTS) || {};

  function getStorageArea() {
    if (typeof browser !== 'undefined' && browser.storage && browser.storage.local) {
      return browser.storage.local;
    }
    if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
      // Wrap chrome callback API into Promise if needed
      return {
        get: (keys) => new Promise((resolve) => chrome.storage.local.get(keys, resolve)),
        set: (items) => new Promise((resolve) => chrome.storage.local.set(items, resolve)),
        remove: (keys) => new Promise((resolve) => chrome.storage.local.remove(keys, resolve))
      };
    }
    return null;
  }

  function generateId(prefix = 'id') {
    return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;
  }

  function clamp(val, min, max) {
    return Math.max(min, Math.min(max, val));
  }

  function normalizeRect(rect) {
    if (!rect) return { ...DEFAULT_MASK_RECT };
    const w = clamp(Number(rect.w) || DEFAULT_MASK_RECT.w, MIN_MASK_SIZE || 0.02, 1);
    const h = clamp(Number(rect.h) || DEFAULT_MASK_RECT.h, MIN_MASK_SIZE || 0.02, 1);
    const x = clamp(Number(rect.x) || DEFAULT_MASK_RECT.x, 0, 1 - w);
    const y = clamp(Number(rect.y) || DEFAULT_MASK_RECT.y, 0, 1 - h);
    return { x, y, w, h };
  }

  function normalizeStyle(style, fallbackStyle) {
    const base = fallbackStyle || (DEFAULT_SETTINGS && DEFAULT_SETTINGS.defaultStyle) || {
      type: 'blur',
      color: '#000000',
      opacity: 0.45,
      blur: 16
    };
    const type = (style && style.type === 'solid') ? 'solid' : ((!style && base.type === 'solid') ? 'solid' : 'blur');
    const defaultOpacity = type === 'solid'
      ? (DEFAULT_OPACITY_SOLID !== undefined ? DEFAULT_OPACITY_SOLID : 1.0)
      : (DEFAULT_OPACITY_BLUR !== undefined ? DEFAULT_OPACITY_BLUR : 0.45);

    if (!style) {
      return {
        ...base,
        type,
        opacity: typeof base.opacity === 'number' ? base.opacity : defaultOpacity,
        imageId: null
      };
    }

    return {
      type,
      color: typeof style.color === 'string' && /^#[0-9a-fA-F]{3,8}$/.test(style.color) ? style.color : base.color,
      opacity: typeof style.opacity === 'number' ? clamp(style.opacity, 0, 1) : defaultOpacity,
      blur: typeof style.blur === 'number' ? clamp(style.blur, 0, 100) : base.blur,
      imageId: style.imageId || null
    };
  }

  function normalizePreset(raw, fallbackStyle) {
    if (!raw || typeof raw !== 'object' || !raw.channelId) return null;

    const channelId = String(raw.channelId);
    const channelName = String(raw.channelName || raw.channelId);
    const enabled = raw.enabled !== false;
    const createdAt = Number(raw.createdAt) || Date.now();
    const updatedAt = Number(raw.updatedAt) || Date.now();

    let profiles = Array.isArray(raw.profiles) ? raw.profiles : null;
    let activeProfileId = raw.activeProfileId;

    if (!profiles || profiles.length === 0) {
      // Backwards-compatibility or flat preset upgrade
      const singleRect = normalizeRect(raw.rect || (raw.masks && raw.masks[0] && raw.masks[0].rect));
      const singleStyle = normalizeStyle(raw.style || (raw.masks && raw.masks[0] && raw.masks[0].style), fallbackStyle);
      const defaultMaskId = generateId('m');
      const defaultProfileId = 'p_default';

      profiles = [
        {
          id: defaultProfileId,
          name: 'Default',
          masks: [
            {
              id: defaultMaskId,
              rect: singleRect,
              style: singleStyle
            }
          ]
        }
      ];
      activeProfileId = defaultProfileId;
    } else {
      profiles = profiles.map((p, pIdx) => {
        const pId = p.id || `p_${pIdx}`;
        const pName = p.name || `Profile ${pIdx + 1}`;
        const masks = Array.isArray(p.masks) && p.masks.length > 0
          ? p.masks.map((m, mIdx) => ({
              id: m.id || generateId('m'),
              rect: normalizeRect(m.rect),
              style: normalizeStyle(m.style, fallbackStyle)
            }))
          : [
              {
                id: generateId('m'),
                rect: { ...DEFAULT_MASK_RECT },
                style: normalizeStyle(null, fallbackStyle)
              }
            ];
        return { id: pId, name: pName, masks };
      });
      if (!profiles.some((p) => p.id === activeProfileId)) {
        activeProfileId = profiles[0].id;
      }
    }

    return {
      channelId,
      channelName,
      enabled,
      createdAt,
      updatedAt,
      activeProfileId,
      profiles
    };
  }

  function getChannelKey(channelId) {
    return `${CHANNEL_KEY_PREFIX}${channelId}`;
  }

  async function getSettings() {
    const storage = getStorageArea();
    if (!storage) return { ...DEFAULT_SETTINGS };
    try {
      const data = await storage.get(SETTINGS_KEY);
      const stored = data && data[SETTINGS_KEY];
      if (!stored) return { ...DEFAULT_SETTINGS };
      return {
        enabled: stored.enabled !== false,
        defaultStyle: normalizeStyle(stored.defaultStyle)
      };
    } catch (err) {
      console.error('[ATF] Failed to get settings:', err);
      return { ...DEFAULT_SETTINGS };
    }
  }

  async function setSettings(updates) {
    const storage = getStorageArea();
    if (!storage) return;
    const current = await getSettings();
    const next = {
      ...current,
      ...updates
    };
    if (updates && updates.defaultStyle) {
      next.defaultStyle = normalizeStyle(updates.defaultStyle, current.defaultStyle);
    }
    await storage.set({ [SETTINGS_KEY]: next });
    return next;
  }

  async function getPreset(channelId) {
    if (!channelId) return null;
    const storage = getStorageArea();
    if (!storage) return null;
    try {
      const key = getChannelKey(channelId);
      const data = await storage.get(key);
      const raw = data && data[key];
      if (!raw) return null;
      const settings = await getSettings();
      return normalizePreset(raw, settings.defaultStyle);
    } catch (err) {
      console.error('[ATF] Failed to get preset for', channelId, err);
      return null;
    }
  }

  async function savePreset(preset) {
    if (!preset || !preset.channelId) throw new Error('Invalid preset');
    const storage = getStorageArea();
    if (!storage) return null;
    const settings = await getSettings();
    const normalized = normalizePreset(
      {
        ...preset,
        updatedAt: Date.now()
      },
      settings.defaultStyle
    );
    const key = getChannelKey(normalized.channelId);
    await storage.set({ [key]: normalized });
    return normalized;
  }

  async function updatePreset(channelId, mutatorFn) {
    if (!channelId || typeof mutatorFn !== 'function') return null;
    const current = await getPreset(channelId);
    if (!current) return null;
    const mutated = (await mutatorFn(current)) || current;
    return await savePreset(mutated);
  }

  async function deletePreset(channelId) {
    if (!channelId) return;
    const storage = getStorageArea();
    if (!storage) return;
    const key = getChannelKey(channelId);
    await storage.remove(key);
  }

  async function listPresets() {
    const storage = getStorageArea();
    if (!storage) return [];
    try {
      const all = await storage.get(null);
      const settings = await getSettings();
      const list = [];
      for (const [key, val] of Object.entries(all || {})) {
        if (key.startsWith(CHANNEL_KEY_PREFIX)) {
          const normalized = normalizePreset(val, settings.defaultStyle);
          if (normalized) list.push(normalized);
        }
      }
      list.sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
      return list;
    } catch (err) {
      console.error('[ATF] Failed to list presets:', err);
      return [];
    }
  }

  function createDefaultPreset(channelId, channelName, defaultStyle) {
    const now = Date.now();
    const pId = 'p_default';
    const mId = generateId('m');
    return {
      channelId,
      channelName: channelName || channelId,
      enabled: true,
      createdAt: now,
      updatedAt: now,
      activeProfileId: pId,
      profiles: [
        {
          id: pId,
          name: 'Default',
          masks: [
            {
              id: mId,
              rect: { ...DEFAULT_MASK_RECT },
              style: normalizeStyle(defaultStyle)
            }
          ]
        }
      ]
    };
  }

  async function migrate() {
    const storage = getStorageArea();
    if (!storage) return;
    try {
      const data = await storage.get([META_KEY, SETTINGS_KEY]);
      const meta = data && data[META_KEY];
      if (!meta || meta.schemaVersion !== SCHEMA_VERSION) {
        await storage.set({
          [META_KEY]: { schemaVersion: SCHEMA_VERSION, initializedAt: Date.now() }
        });
      }
      if (!data || !data[SETTINGS_KEY]) {
        await storage.set({ [SETTINGS_KEY]: { ...DEFAULT_SETTINGS } });
      }
    } catch (err) {
      console.error('[ATF] Migration failed:', err);
    }
  }

  const ATF_STORAGE = {
    getSettings,
    setSettings,
    getPreset,
    savePreset,
    updatePreset,
    deletePreset,
    listPresets,
    createDefaultPreset,
    normalizePreset,
    normalizeRect,
    normalizeStyle,
    generateId,
    migrate
  };

  if (typeof globalThis !== 'undefined') {
    globalThis.ATF = globalThis.ATF || {};
    globalThis.ATF.STORAGE = ATF_STORAGE;
  }
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = ATF_STORAGE;
  }
})();
