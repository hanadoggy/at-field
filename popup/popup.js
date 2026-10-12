(() => {
  'use strict';

  const { TYPES } = (globalThis.ATF && globalThis.ATF.MESSAGES) || {};
  const {
    getSettings,
    setSettings,
    savePreset,
    updatePreset,
    deletePreset
  } = (globalThis.ATF && globalThis.ATF.STORAGE) || {};
  const { getMessage, applyI18n } = (globalThis.ATF && globalThis.ATF.I18N) || {
    getMessage: (k) => k,
    applyI18n: () => {}
  };

  // DOM Elements
  const globalToggle = document.getElementById('global-toggle');
  const bannerEl = document.getElementById('state-banner');
  const bannerText = document.getElementById('banner-text');
  const bannerIcon = document.getElementById('banner-icon');

  const stateLoading = document.getElementById('state-loading');
  const stateNoPreset = document.getElementById('state-no-preset');
  const stateHasPreset = document.getElementById('state-has-preset');

  const noPresetChannelName = document.getElementById('no-preset-channel-name');
  const btnAddMask = document.getElementById('btn-add-mask');

  const hasPresetChannelName = document.getElementById('has-preset-channel-name');
  const channelToggle = document.getElementById('channel-toggle');
  const btnModeView = document.getElementById('btn-mode-view');
  const btnModeEdit = document.getElementById('btn-mode-edit');

  const chipBlur = document.getElementById('chip-blur');
  const chipSolid = document.getElementById('chip-solid');
  const inputColor = document.getElementById('input-color');
  const colorHexDisplay = document.getElementById('color-hex-display');
  const inputOpacity = document.getElementById('input-opacity');
  const opacityValDisplay = document.getElementById('opacity-val-display');
  const rowBlur = document.getElementById('row-blur');
  const inputBlur = document.getElementById('input-blur');
  const blurValDisplay = document.getElementById('blur-val-display');

  const btnDeletePreset = document.getElementById('btn-delete-preset');
  const linkOptions = document.getElementById('link-options');

  let activeTabId = null;
  let currentSettings = null;
  let currentChannel = null;
  let currentPreset = null;
  let isEditing = false;
  let saveTimer = null;
  let channelDetectTimer = null;

  async function getActiveTab() {
    const tabsApi = (typeof browser !== 'undefined' ? browser : chrome)?.tabs;
    if (!tabsApi) return null;
    try {
      const tabs = await tabsApi.query({ active: true, currentWindow: true });
      return tabs && tabs[0] ? tabs[0] : null;
    } catch {
      return null;
    }
  }

  async function sendMessageToTab(message, timeoutMs = 2500) {
    if (!activeTabId) return null;
    const tabsApi = (typeof browser !== 'undefined' ? browser : chrome)?.tabs;
    if (!tabsApi) return null;

    return new Promise((resolve) => {
      let resolved = false;
      const timer = setTimeout(() => {
        if (!resolved) {
          resolved = true;
          resolve(null);
        }
      }, timeoutMs);

      tabsApi.sendMessage(activeTabId, message)
        .then((res) => {
          if (!resolved) {
            resolved = true;
            clearTimeout(timer);
            resolve(res);
          }
        })
        .catch(() => {
          if (!resolved) {
            resolved = true;
            clearTimeout(timer);
            resolve(null);
          }
        });
    });
  }

  function hideAllStates() {
    if (channelDetectTimer) clearTimeout(channelDetectTimer);
    bannerEl.classList.add('hidden');
    stateLoading.classList.add('hidden');
    stateNoPreset.classList.add('hidden');
    stateHasPreset.classList.add('hidden');
  }

  function showBanner(text, icon = 'ℹ️') {
    hideAllStates();
    bannerIcon.textContent = icon;
    bannerText.textContent = text;
    bannerEl.classList.remove('hidden');
  }

  function updateModeButtons(editing) {
    isEditing = editing;
    if (editing) {
      btnModeEdit.classList.add('active');
      btnModeView.classList.remove('active');
    } else {
      btnModeView.classList.add('active');
      btnModeEdit.classList.remove('active');
    }
  }

  function updateStyleControls(style) {
    if (!style) return;

    if (style.type === 'solid') {
      chipSolid.classList.add('active');
      chipBlur.classList.remove('active');
      rowBlur.classList.add('hidden');
    } else {
      chipBlur.classList.add('active');
      chipSolid.classList.remove('active');
      rowBlur.classList.remove('hidden');
    }

    inputColor.value = style.color || '#000000';
    colorHexDisplay.textContent = (style.color || '#000000').toUpperCase();

    const opacityPercent = Math.round((typeof style.opacity === 'number' ? style.opacity : 0.45) * 100);
    inputOpacity.value = opacityPercent;
    opacityValDisplay.textContent = `${opacityPercent}%`;

    const blurVal = typeof style.blur === 'number' ? style.blur : 16;
    inputBlur.value = blurVal;
    blurValDisplay.textContent = `${blurVal}px`;
  }

  function triggerPresetSave() {
    if (!currentPreset) return;
    if (saveTimer) clearTimeout(saveTimer);
    saveTimer = setTimeout(async () => {
      const channelId = currentPreset.channelId;
      const activeProfile = currentPreset.profiles.find((p) => p.id === currentPreset.activeProfileId);
      const currentMask = activeProfile && activeProfile.masks[0];
      if (!currentMask) return;

      await updatePreset(channelId, (latest) => {
        latest.enabled = currentPreset.enabled;
        const p = latest.profiles.find((pr) => pr.id === latest.activeProfileId) || latest.profiles[0];
        if (p && p.masks[0]) {
          p.masks[0].style = { ...currentMask.style };
        }
        return latest;
      });
    }, 200);
  }

  async function refresh() {
    currentSettings = await getSettings();
    globalToggle.checked = currentSettings.enabled !== false;

    if (!currentSettings.enabled) {
      showBanner(getMessage('statusGlobalDisabled') || 'A.T.Field is currently turned off', '⏸️');
      return;
    }

    const tab = await getActiveTab();
    if (!tab || !tab.url || !tab.url.includes('youtube.com')) {
      showBanner(getMessage('statusNotYouTube') || 'Not on a YouTube video page', '📺');
      return;
    }
    activeTabId = tab.id;

    const state = await sendMessageToTab({ type: TYPES.GET_STATE });
    if (!state) {
      // Content script didn't answer or page is not /watch
      if (!tab.url.includes('/watch')) {
        showBanner(getMessage('statusNotYouTube') || 'Not on a YouTube video page', '📺');
      } else {
        showBanner(getMessage('statusNeedReload') || 'Please refresh the page (F5) or check extension permissions', '⚠️');
      }
      return;
    }

    if (!state.isWatch) {
      showBanner(getMessage('statusNotYouTube') || 'Not on a YouTube video page', '📺');
      return;
    }

    if (state.exclusionReason === 'ad') {
      showBanner(getMessage('statusExcludedAd') || 'Mask is hidden while ads are playing', '📢');
      return;
    }
    if (state.exclusionReason === 'miniplayer') {
      showBanner(getMessage('statusExcludedMiniplayer') || 'Mask is hidden in miniplayer mode', '🔲');
      return;
    }
    if (state.exclusionReason === 'shorts') {
      showBanner(getMessage('statusExcludedShorts') || 'Shorts are not supported', '📱');
      return;
    }

    if (!state.channel) {
      hideAllStates();
      stateLoading.classList.remove('hidden');
      channelDetectTimer = setTimeout(() => {
        showBanner(getMessage('statusNeedReload') || 'Please refresh the page (F5) or check extension permissions', '⚠️');
      }, 3000);
      return;
    }

    currentChannel = state.channel;
    currentPreset = state.preset;
    updateModeButtons(state.editMode);

    if (!state.hasPreset || !currentPreset) {
      hideAllStates();
      noPresetChannelName.textContent = currentChannel.channelName || currentChannel.channelId;
      stateNoPreset.classList.remove('hidden');
      return;
    }

    // Has Preset
    hideAllStates();
    hasPresetChannelName.textContent = currentPreset.channelName || currentChannel.channelName;
    channelToggle.checked = currentPreset.enabled !== false;

    const activeProfile = currentPreset.profiles.find((p) => p.id === currentPreset.activeProfileId);
    const maskData = activeProfile && activeProfile.masks[0];
    if (maskData) {
      updateStyleControls(maskData.style);
    }

    stateHasPreset.classList.remove('hidden');
  }

  // Event Handlers
  globalToggle.addEventListener('change', async () => {
    await setSettings({ enabled: globalToggle.checked });
    refresh();
  });

  btnAddMask.addEventListener('click', async () => {
    btnAddMask.disabled = true;
    const res = await sendMessageToTab({ type: TYPES.CREATE_PRESET });
    btnAddMask.disabled = false;
    if (res && res.success) {
      currentPreset = res.preset;
      refresh();
    }
  });

  btnModeView.addEventListener('click', async () => {
    await sendMessageToTab({ type: TYPES.SET_EDIT_MODE, on: false });
    updateModeButtons(false);
  });

  btnModeEdit.addEventListener('click', async () => {
    await sendMessageToTab({ type: TYPES.SET_EDIT_MODE, on: true });
    updateModeButtons(true);
  });

  channelToggle.addEventListener('change', async () => {
    if (!currentPreset) return;
    currentPreset.enabled = channelToggle.checked;
    await updatePreset(currentPreset.channelId, (latest) => {
      latest.enabled = channelToggle.checked;
      return latest;
    });
  });

  chipBlur.addEventListener('click', () => {
    if (!currentPreset) return;
    const profile = currentPreset.profiles.find((p) => p.id === currentPreset.activeProfileId);
    if (!profile || !profile.masks[0]) return;
    profile.masks[0].style.type = 'blur';
    if (profile.masks[0].style.opacity === 1.0) {
      profile.masks[0].style.opacity = 0.45;
    }
    updateStyleControls(profile.masks[0].style);
    triggerPresetSave();
  });

  chipSolid.addEventListener('click', () => {
    if (!currentPreset) return;
    const profile = currentPreset.profiles.find((p) => p.id === currentPreset.activeProfileId);
    if (!profile || !profile.masks[0]) return;
    profile.masks[0].style.type = 'solid';
    profile.masks[0].style.opacity = 1.0;
    updateStyleControls(profile.masks[0].style);
    triggerPresetSave();
  });

  inputColor.addEventListener('input', () => {
    if (!currentPreset) return;
    const profile = currentPreset.profiles.find((p) => p.id === currentPreset.activeProfileId);
    if (!profile || !profile.masks[0]) return;
    profile.masks[0].style.color = inputColor.value;
    colorHexDisplay.textContent = inputColor.value.toUpperCase();
    triggerPresetSave();
  });

  inputOpacity.addEventListener('input', () => {
    if (!currentPreset) return;
    const profile = currentPreset.profiles.find((p) => p.id === currentPreset.activeProfileId);
    if (!profile || !profile.masks[0]) return;
    const pct = parseInt(inputOpacity.value, 10);
    profile.masks[0].style.opacity = pct / 100;
    opacityValDisplay.textContent = `${pct}%`;
    triggerPresetSave();
  });

  inputBlur.addEventListener('input', () => {
    if (!currentPreset) return;
    const profile = currentPreset.profiles.find((p) => p.id === currentPreset.activeProfileId);
    if (!profile || !profile.masks[0]) return;
    const blurPx = parseInt(inputBlur.value, 10);
    profile.masks[0].style.blur = blurPx;
    blurValDisplay.textContent = `${blurPx}px`;
    triggerPresetSave();
  });

  btnDeletePreset.addEventListener('click', async () => {
    if (!currentPreset) return;
    const confirmMsg = getMessage('deleteConfirm') || 'Delete mask for this channel?';
    if (!window.confirm(confirmMsg)) return;

    await deletePreset(currentPreset.channelId);
    await sendMessageToTab({ type: TYPES.SET_EDIT_MODE, on: false });
    currentPreset = null;
    refresh();
  });

  linkOptions.addEventListener('click', (e) => {
    e.preventDefault();
    const runtimeApi = (typeof browser !== 'undefined' ? browser : chrome)?.runtime;
    if (runtimeApi && runtimeApi.openOptionsPage) {
      runtimeApi.openOptionsPage();
    }
  });

  document.addEventListener('DOMContentLoaded', () => {
    applyI18n();
    refresh();
  });
})();
