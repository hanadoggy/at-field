import { getExtensionApi } from '../../shared/browser-api';
import { getRequiredElement } from '../../shared/dom';
import { applyI18n, getMessage } from '../../shared/i18n';
import {
  MESSAGE_TYPES,
  type AtfRequest,
  type AtfResponseMap,
} from '../../shared/messages';
import {
  deletePreset,
  getSettings,
  setSettings,
  updatePreset,
} from '../../shared/storage';
import type { ChannelInfo } from '../../types/channel';
import type { ChannelPreset, MaskStyle, Settings } from '../../types/schema';

// DOM Elements
const globalToggle = getRequiredElement<HTMLInputElement>('global-toggle');
const bannerEl = getRequiredElement<HTMLElement>('state-banner');
const bannerText = getRequiredElement<HTMLElement>('banner-text');
const bannerIcon = getRequiredElement<HTMLElement>('banner-icon');

const stateLoading = getRequiredElement<HTMLElement>('state-loading');
const stateNoPreset = getRequiredElement<HTMLElement>('state-no-preset');
const stateHasPreset = getRequiredElement<HTMLElement>('state-has-preset');

const noPresetChannelName = getRequiredElement<HTMLElement>(
  'no-preset-channel-name'
);
const btnAddMask = getRequiredElement<HTMLButtonElement>('btn-add-mask');

const hasPresetChannelName = getRequiredElement<HTMLElement>(
  'has-preset-channel-name'
);
const channelToggle = getRequiredElement<HTMLInputElement>('channel-toggle');
const btnModeView = getRequiredElement<HTMLButtonElement>('btn-mode-view');
const btnModeEdit = getRequiredElement<HTMLButtonElement>('btn-mode-edit');

const chipBlur = getRequiredElement<HTMLButtonElement>('chip-blur');
const chipSolid = getRequiredElement<HTMLButtonElement>('chip-solid');
const inputColor = getRequiredElement<HTMLInputElement>('input-color');
const colorHexDisplay = getRequiredElement<HTMLElement>('color-hex-display');
const inputOpacity = getRequiredElement<HTMLInputElement>('input-opacity');
const opacityValDisplay = getRequiredElement<HTMLElement>(
  'opacity-val-display'
);
const rowBlur = getRequiredElement<HTMLElement>('row-blur');
const inputBlur = getRequiredElement<HTMLInputElement>('input-blur');
const blurValDisplay = getRequiredElement<HTMLElement>('blur-val-display');

const btnDeletePreset =
  getRequiredElement<HTMLButtonElement>('btn-delete-preset');
const linkOptions = getRequiredElement<HTMLAnchorElement>('link-options');

let activeTabId: number | null | undefined = null;
let currentSettings: Settings | null = null;
let currentChannel: ChannelInfo | null = null;
let currentPreset: ChannelPreset | null = null;
let isEditing = false;
let saveTimer: ReturnType<typeof setTimeout> | null = null;
let channelDetectTimer: ReturnType<typeof setTimeout> | null = null;

async function getActiveTab(): Promise<browser.tabs.Tab | null> {
  const tabsApi = getExtensionApi()?.tabs;
  if (!tabsApi) return null;
  try {
    const tabs = await tabsApi.query({ active: true, currentWindow: true });
    return tabs && tabs[0] ? tabs[0] : null;
  } catch {
    return null;
  }
}

async function sendMessageToTab<R extends AtfRequest>(
  message: R,
  timeoutMs = 2500
): Promise<AtfResponseMap[R['type']] | null> {
  if (!activeTabId) return null;
  const tabId = activeTabId;
  const tabsApi = getExtensionApi()?.tabs;
  if (!tabsApi) return null;

  return new Promise((resolve) => {
    let resolved = false;
    const timer = setTimeout(() => {
      if (!resolved) {
        resolved = true;
        resolve(null);
      }
    }, timeoutMs);

    tabsApi
      .sendMessage(tabId, message)
      .then((res) => {
        if (!resolved) {
          resolved = true;
          clearTimeout(timer);
          resolve(res as AtfResponseMap[R['type']]);
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

function hideAllStates(): void {
  if (channelDetectTimer) clearTimeout(channelDetectTimer);
  bannerEl.classList.add('hidden');
  stateLoading.classList.add('hidden');
  stateNoPreset.classList.add('hidden');
  stateHasPreset.classList.add('hidden');
}

function showBanner(text: string, icon = 'ℹ️'): void {
  hideAllStates();
  bannerIcon.textContent = icon;
  bannerText.textContent = text;
  bannerEl.classList.remove('hidden');
}

function updateModeButtons(editing: boolean): void {
  isEditing = editing;
  void isEditing;
  if (editing) {
    btnModeEdit.classList.add('active');
    btnModeView.classList.remove('active');
  } else {
    btnModeView.classList.add('active');
    btnModeEdit.classList.remove('active');
  }
}

function updateStyleControls(style: Partial<MaskStyle> | null | undefined): void {
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

  const opacityPercent = Math.round(
    (typeof style.opacity === 'number' ? style.opacity : 0.45) * 100
  );
  inputOpacity.value = String(opacityPercent);
  opacityValDisplay.textContent = `${opacityPercent}%`;

  const blurVal = typeof style.blur === 'number' ? style.blur : 16;
  inputBlur.value = String(blurVal);
  blurValDisplay.textContent = `${blurVal}px`;
}

function triggerPresetSave(): void {
  if (!currentPreset) return;
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = setTimeout(async () => {
    if (!currentPreset) return;
    const presetSnapshot = currentPreset;
    const channelId = presetSnapshot.channelId;
    const activeProfile = presetSnapshot.profiles.find(
      (p) => p.id === presetSnapshot.activeProfileId
    );
    const currentMask = activeProfile && activeProfile.masks[0];
    if (!currentMask) return;

    await updatePreset(channelId, (latest) => {
      latest.enabled = presetSnapshot.enabled;
      const p =
        latest.profiles.find((pr) => pr.id === latest.activeProfileId) ||
        latest.profiles[0];
      if (p && p.masks[0]) {
        p.masks[0].style = { ...currentMask.style };
      }
      return latest;
    });
  }, 200);
}

async function refresh(): Promise<void> {
  currentSettings = await getSettings();
  globalToggle.checked = currentSettings.enabled !== false;

  if (!currentSettings.enabled) {
    showBanner(
      getMessage('statusGlobalDisabled') || 'A.T.Field is currently turned off',
      '⏸️'
    );
    return;
  }

  const tab = await getActiveTab();
  if (!tab || !tab.url || !tab.url.includes('youtube.com')) {
    showBanner(
      getMessage('statusNotYouTube') || 'Not on a YouTube video page',
      '📺'
    );
    return;
  }
  activeTabId = tab.id;

  const state = await sendMessageToTab({ type: MESSAGE_TYPES.GET_STATE });
  if (!state) {
    // Content script didn't answer or page is not /watch
    if (!tab.url.includes('/watch')) {
      showBanner(
        getMessage('statusNotYouTube') || 'Not on a YouTube video page',
        '📺'
      );
    } else {
      showBanner(
        getMessage('statusNeedReload') ||
          'Please refresh the page (F5) or check extension permissions',
        '⚠️'
      );
    }
    return;
  }

  if (!state.isWatch) {
    showBanner(
      getMessage('statusNotYouTube') || 'Not on a YouTube video page',
      '📺'
    );
    return;
  }

  if (state.exclusionReason === 'ad') {
    showBanner(
      getMessage('statusExcludedAd') || 'Mask is hidden while ads are playing',
      '📢'
    );
    return;
  }
  if (state.exclusionReason === 'miniplayer') {
    showBanner(
      getMessage('statusExcludedMiniplayer') ||
        'Mask is hidden in miniplayer mode',
      '🔲'
    );
    return;
  }
  if (state.exclusionReason === 'shorts') {
    showBanner(
      getMessage('statusExcludedShorts') || 'Shorts are not supported',
      '📱'
    );
    return;
  }

  if (!state.channel) {
    hideAllStates();
    stateLoading.classList.remove('hidden');
    channelDetectTimer = setTimeout(() => {
      showBanner(
        getMessage('statusNeedReload') ||
          'Please refresh the page (F5) or check extension permissions',
        '⚠️'
      );
    }, 3000);
    return;
  }

  currentChannel = state.channel;
  currentPreset = state.preset;
  updateModeButtons(state.editMode);

  if (!state.hasPreset || !currentPreset) {
    hideAllStates();
    noPresetChannelName.textContent =
      currentChannel.channelName || currentChannel.channelId;
    stateNoPreset.classList.remove('hidden');
    return;
  }

  // Has Preset
  hideAllStates();
  hasPresetChannelName.textContent =
    currentPreset.channelName || currentChannel.channelName;
  channelToggle.checked = currentPreset.enabled !== false;

  const preset = currentPreset;
  const activeProfile = preset.profiles.find(
    (p) => p.id === preset.activeProfileId
  );
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
  const res = await sendMessageToTab({ type: MESSAGE_TYPES.CREATE_PRESET });
  btnAddMask.disabled = false;
  if (res && res.success) {
    currentPreset = res.preset;
    refresh();
  }
});

btnModeView.addEventListener('click', async () => {
  await sendMessageToTab({ type: MESSAGE_TYPES.SET_EDIT_MODE, on: false });
  updateModeButtons(false);
});

btnModeEdit.addEventListener('click', async () => {
  await sendMessageToTab({ type: MESSAGE_TYPES.SET_EDIT_MODE, on: true });
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
  const preset = currentPreset;
  const profile = preset.profiles.find((p) => p.id === preset.activeProfileId);
  const firstMask = profile && profile.masks[0];
  if (!firstMask) return;
  firstMask.style.type = 'blur';
  if (firstMask.style.opacity === 1.0) {
    firstMask.style.opacity = 0.45;
  }
  updateStyleControls(firstMask.style);
  triggerPresetSave();
});

chipSolid.addEventListener('click', () => {
  if (!currentPreset) return;
  const preset = currentPreset;
  const profile = preset.profiles.find((p) => p.id === preset.activeProfileId);
  const firstMask = profile && profile.masks[0];
  if (!firstMask) return;
  firstMask.style.type = 'solid';
  firstMask.style.opacity = 1.0;
  updateStyleControls(firstMask.style);
  triggerPresetSave();
});

inputColor.addEventListener('input', () => {
  if (!currentPreset) return;
  const preset = currentPreset;
  const profile = preset.profiles.find((p) => p.id === preset.activeProfileId);
  const firstMask = profile && profile.masks[0];
  if (!firstMask) return;
  firstMask.style.color = inputColor.value;
  colorHexDisplay.textContent = inputColor.value.toUpperCase();
  triggerPresetSave();
});

inputOpacity.addEventListener('input', () => {
  if (!currentPreset) return;
  const preset = currentPreset;
  const profile = preset.profiles.find((p) => p.id === preset.activeProfileId);
  const firstMask = profile && profile.masks[0];
  if (!firstMask) return;
  const pct = parseInt(inputOpacity.value, 10);
  firstMask.style.opacity = pct / 100;
  opacityValDisplay.textContent = `${pct}%`;
  triggerPresetSave();
});

inputBlur.addEventListener('input', () => {
  if (!currentPreset) return;
  const preset = currentPreset;
  const profile = preset.profiles.find((p) => p.id === preset.activeProfileId);
  const firstMask = profile && profile.masks[0];
  if (!firstMask) return;
  const blurPx = parseInt(inputBlur.value, 10);
  firstMask.style.blur = blurPx;
  blurValDisplay.textContent = `${blurPx}px`;
  triggerPresetSave();
});

btnDeletePreset.addEventListener('click', async () => {
  if (!currentPreset) return;
  const confirmMsg =
    getMessage('deleteConfirm') || 'Delete mask for this channel?';
  if (!window.confirm(confirmMsg)) return;

  await deletePreset(currentPreset.channelId);
  await sendMessageToTab({ type: MESSAGE_TYPES.SET_EDIT_MODE, on: false });
  currentPreset = null;
  refresh();
});

linkOptions.addEventListener('click', (e) => {
  e.preventDefault();
  const runtimeApi = getExtensionApi()?.runtime;
  if (runtimeApi && runtimeApi.openOptionsPage) {
    runtimeApi.openOptionsPage();
  }
});

document.addEventListener('DOMContentLoaded', () => {
  applyI18n();
  refresh();
});
