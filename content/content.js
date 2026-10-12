(() => {
  'use strict';

  const { SETTINGS_KEY, CHANNEL_KEY_PREFIX } = (globalThis.ATF && globalThis.ATF.CONSTANTS) || {};
  const { TYPES } = (globalThis.ATF && globalThis.ATF.MESSAGES) || {};
  const {
    getSettings,
    getPreset,
    savePreset,
    createDefaultPreset,
    migrate
  } = (globalThis.ATF && globalThis.ATF.STORAGE) || {};
  const { resolveChannel, getCurrentVideoId } = (globalThis.ATF && globalThis.ATF.CHANNEL) || {};
  const { getExclusionReason, observeExclusions } = (globalThis.ATF && globalThis.ATF.EXCLUSION) || {};
  const {
    applyMaskStyle,
    updateMaskPosition,
    createMaskElement,
    removeAllMasks
  } = (globalThis.ATF && globalThis.ATF.MASK) || {};
  const { MaskEditor } = (globalThis.ATF && globalThis.ATF.EDITOR) || {};

  let currentSettings = null;
  let currentChannel = null;
  let currentPreset = null;
  let isEditMode = false;
  let activeEditor = null;
  let currentMaskEl = null;

  let playerEl = null;
  let videoEl = null;
  let currentObservedPlayerEl = null;
  let currentObservedVideoEl = null;
  let globalListenersAttached = false;
  let resizeObserver = null;
  let animFrameId = null;
  let unobserveExclusions = null;

  function ensurePlayerElements() {
    if (!playerEl || !playerEl.isConnected || !videoEl || !videoEl.isConnected) {
      return findPlayerElements();
    }
    return true;
  }

  function schedulePositionUpdate() {
    if (animFrameId) cancelAnimationFrame(animFrameId);
    animFrameId = requestAnimationFrame(() => {
      animFrameId = null;
      ensurePlayerElements();
      if (currentMaskEl && currentPreset && playerEl && videoEl) {
        const activeProfile = currentPreset.profiles && currentPreset.profiles.find((p) => p.id === currentPreset.activeProfileId);
        const maskData = activeProfile && activeProfile.masks && activeProfile.masks[0];
        if (maskData) {
          updateMaskPosition(currentMaskEl, maskData.rect, playerEl, videoEl);
          if (activeEditor) {
            activeEditor.refresh();
          }
        }
      }
    });
  }

  function setEditMode(on) {
    if (isEditMode === on) return;
    isEditMode = on;

    if (!isEditMode) {
      if (activeEditor) {
        activeEditor.destroy();
        activeEditor = null;
      }
      return;
    }

    // Entering Edit Mode
    if (!currentPreset || !playerEl || !videoEl || !currentMaskEl) {
      isEditMode = false;
      return;
    }

    const activeProfile = currentPreset.profiles.find((p) => p.id === currentPreset.activeProfileId);
    const maskData = activeProfile && activeProfile.masks[0];
    if (!maskData) {
      isEditMode = false;
      return;
    }

    const targetMaskId = maskData.id;

    function getTargetMask() {
      if (!currentPreset || !currentPreset.profiles) return null;
      const profile = currentPreset.profiles.find((p) => p.id === currentPreset.activeProfileId);
      if (!profile || !profile.masks) return null;
      return profile.masks.find((m) => m.id === targetMaskId) || profile.masks[0] || null;
    }

    if (activeEditor) activeEditor.destroy();

    activeEditor = new MaskEditor({
      maskEl: currentMaskEl,
      playerEl,
      videoEl,
      initialRect: maskData.rect,
      onUpdate: (updatedRect) => {
        const target = getTargetMask();
        if (target) {
          target.rect = { ...updatedRect };
        }
      },
      onSave: async (savedRect) => {
        const target = getTargetMask();
        if (target) {
          target.rect = { ...savedRect };
        }
        if (currentPreset) {
          await savePreset(currentPreset);
        }
      },
      onExit: () => {
        setEditMode(false);
      }
    });
  }

  async function sync() {
    const isWatch = window.location.pathname === '/watch';
    const exclusionReason = getExclusionReason();

    // Hide everything if not on watch, global disabled, or excluded (ad/miniplayer/etc.)
    if (!isWatch || (currentSettings && !currentSettings.enabled) || exclusionReason !== null) {
      if (isEditMode) setEditMode(false);
      if (playerEl) removeAllMasks(playerEl);
      currentMaskEl = null;
      return;
    }

    // Channel check
    if (!currentChannel) {
      if (playerEl) removeAllMasks(playerEl);
      currentMaskEl = null;
      return;
    }

    // Load or reload preset
    currentPreset = await getPreset(currentChannel.channelId);

    // If channel preset doesn't exist or is disabled
    if (!currentPreset || !currentPreset.enabled) {
      if (isEditMode) setEditMode(false);
      if (playerEl) removeAllMasks(playerEl);
      currentMaskEl = null;
      return;
    }

    // Preset is active! Ensure elements
    if (!ensurePlayerElements()) return;

    const activeProfile = currentPreset.profiles && currentPreset.profiles.find((p) => p.id === currentPreset.activeProfileId);
    const maskData = activeProfile && activeProfile.masks && activeProfile.masks[0];
    if (!maskData) return;

    // Create or re-attach mask element if disconnected
    if (!currentMaskEl || !currentMaskEl.isConnected) {
      currentMaskEl = createMaskElement(playerEl, maskData.id);
    }
    const filterEl = currentMaskEl.querySelector('.atf-mask-filter') || currentMaskEl;
    applyMaskStyle(filterEl, maskData.style);
    updateMaskPosition(currentMaskEl, maskData.rect, playerEl, videoEl);

    // If edit mode was on, maintain editor
    if (isEditMode) {
      if (!activeEditor) {
        setEditMode(true);
      } else {
        activeEditor.refresh();
      }
    }
  }

  async function handleNavigation() {
    // Immediately clear mask when navigation starts/finishes to prevent flicker
    if (playerEl) removeAllMasks(playerEl);
    currentMaskEl = null;
    if (isEditMode) setEditMode(false);

    if (window.location.pathname !== '/watch') {
      currentChannel = null;
      currentPreset = null;
      return;
    }

    // Resolve channel with retries
    const resolved = await resolveChannel();
    currentChannel = resolved;
    await sync();
  }

  function findPlayerElements() {
    playerEl = document.querySelector('#movie_player');
    videoEl = playerEl ? playerEl.querySelector('video') : document.querySelector('video');

    if (playerEl && videoEl) {
      attachPlayerListeners();
      return true;
    }
    return false;
  }

  function attachPlayerListeners() {
    if (!videoEl || !playerEl) return;

    // 1. Global listeners: attach only once across extension lifecycle
    if (!globalListenersAttached) {
      document.addEventListener('fullscreenchange', schedulePositionUpdate);
      window.addEventListener('resize', schedulePositionUpdate);
      globalListenersAttached = true;
    }

    // 2. Element-specific listeners: skip if already attached to these exact connected elements
    if (playerEl === currentObservedPlayerEl && videoEl === currentObservedVideoEl) {
      return;
    }

    // Clean up previous video listeners if video element changed
    if (currentObservedVideoEl && currentObservedVideoEl !== videoEl) {
      currentObservedVideoEl.removeEventListener('loadedmetadata', schedulePositionUpdate);
      currentObservedVideoEl.removeEventListener('resize', schedulePositionUpdate);
    }

    currentObservedPlayerEl = playerEl;
    currentObservedVideoEl = videoEl;

    videoEl.addEventListener('loadedmetadata', schedulePositionUpdate);
    videoEl.addEventListener('resize', schedulePositionUpdate);

    if (resizeObserver) {
      resizeObserver.disconnect();
    }
    if (typeof ResizeObserver !== 'undefined') {
      resizeObserver = new ResizeObserver(() => {
        schedulePositionUpdate();
      });
      resizeObserver.observe(playerEl);
      resizeObserver.observe(videoEl);
    }
  }

  function handleStorageChange(changes, areaName) {
    if (areaName !== 'local') return;

    let shouldSync = false;

    if (changes[SETTINGS_KEY]) {
      currentSettings = changes[SETTINGS_KEY].newValue;
      shouldSync = true;
    }

    if (currentChannel) {
      const channelKey = `${CHANNEL_KEY_PREFIX}${currentChannel.channelId}`;
      if (changes[channelKey]) {
        currentPreset = changes[channelKey].newValue;
        shouldSync = true;
      }
    }

    if (shouldSync) {
      sync();
    }
  }

  function handleMessage(message, sender, sendResponse) {
    if (!message || !message.type) return;

    if (message.type === TYPES.GET_STATE) {
      const isWatch = window.location.pathname === '/watch';
      const exclusionReason = getExclusionReason();
      sendResponse({
        isWatch,
        exclusionReason,
        channel: currentChannel,
        hasPreset: !!(currentPreset && currentPreset.profiles && currentPreset.profiles.length > 0),
        preset: currentPreset,
        editMode: isEditMode,
        globalEnabled: currentSettings ? currentSettings.enabled !== false : true
      });
      return true;
    }

    if (message.type === TYPES.SET_EDIT_MODE) {
      setEditMode(!!message.on);
      sendResponse({ editMode: isEditMode });
      return true;
    }

    if (message.type === TYPES.CREATE_PRESET) {
      (async () => {
        if (!currentChannel) {
          sendResponse({ success: false, error: 'No channel detected' });
          return;
        }
        const newPreset = createDefaultPreset(
          currentChannel.channelId,
          currentChannel.channelName,
          currentSettings && currentSettings.defaultStyle
        );
        const saved = await savePreset(newPreset);
        currentPreset = saved;
        await sync();
        setEditMode(true);
        sendResponse({ success: true, preset: currentPreset, editMode: isEditMode });
      })();
      return true; // Keep message channel open for async response
    }
  }

  async function init() {
    await migrate();
    currentSettings = await getSettings();

    // Listen to storage changes
    const storageApi = (typeof browser !== 'undefined' ? browser : chrome)?.storage;
    if (storageApi && storageApi.onChanged) {
      storageApi.onChanged.addListener(handleStorageChange);
    }

    // Listen to messages from popup
    const runtimeApi = (typeof browser !== 'undefined' ? browser : chrome)?.runtime;
    if (runtimeApi && runtimeApi.onMessage) {
      runtimeApi.onMessage.addListener(handleMessage);
    }

    // SPA Navigation Listeners
    window.addEventListener('yt-navigate-start', () => {
      if (playerEl) removeAllMasks(playerEl);
      currentMaskEl = null;
    });
    window.addEventListener('yt-navigate-finish', handleNavigation);

    // Exclusion observer (ads, miniplayer)
    unobserveExclusions = observeExclusions(() => {
      sync();
    });

    // Wait for player elements and initial channel
    findPlayerElements();
    if (window.location.pathname === '/watch') {
      handleNavigation();
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
