import { getExtensionApi } from '../../shared/browser-api';
import {
  MAX_MASKS_PER_PROFILE,
  MAX_PROFILES_PER_CHANNEL,
} from '../../shared/constants';
import { getRequiredElement } from '../../shared/dom';
import { applyI18n, getMessage } from '../../shared/i18n';
import {
  MESSAGE_TYPES,
  type AtfRequest,
  type AtfResponseMap,
} from '../../shared/messages';
import {
  addMaskToProfile,
  addProfileToPreset,
  deleteMaskFromProfile,
  deletePreset,
  deleteProfileFromPreset,
  getActiveProfile,
  getSettings,
  renameProfileInPreset,
  setSettings,
  updatePreset,
} from '../../shared/storage';
import type { ChannelInfo } from '../../types/channel';
import type {
  ChannelPreset,
  Mask,
  MaskStyle,
  Settings,
} from '../../types/schema';

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

const profileSelect = getRequiredElement<HTMLSelectElement>('profile-select');
const btnProfileAdd = getRequiredElement<HTMLButtonElement>('btn-profile-add');
const btnProfileRename =
  getRequiredElement<HTMLButtonElement>('btn-profile-rename');
const btnProfileDelete =
  getRequiredElement<HTMLButtonElement>('btn-profile-delete');
const profileInlineEditor = getRequiredElement<HTMLElement>(
  'profile-inline-editor'
);
const inputProfileName =
  getRequiredElement<HTMLInputElement>('input-profile-name');
const btnProfileSave =
  getRequiredElement<HTMLButtonElement>('btn-profile-save');
const btnProfileCancel =
  getRequiredElement<HTMLButtonElement>('btn-profile-cancel');

const btnModeView = getRequiredElement<HTMLButtonElement>('btn-mode-view');
const btnModeEdit = getRequiredElement<HTMLButtonElement>('btn-mode-edit');

const maskChipsList = getRequiredElement<HTMLElement>('mask-chips-list');
const btnAddMaskItem =
  getRequiredElement<HTMLButtonElement>('btn-add-mask-item');
const btnDeleteMask = getRequiredElement<HTMLButtonElement>('btn-delete-mask');

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
let selectedMaskId: string | null = null;
let profileEditAction: 'add' | 'rename' | null = null;
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

function getSelectedMask(): Mask | null {
  if (!currentPreset) return null;
  const activeProfile = getActiveProfile(currentPreset);
  if (selectedMaskId) {
    const found = activeProfile.masks.find((m) => m.id === selectedMaskId);
    if (found) return found;
  }
  const fallback = activeProfile.masks[0] ?? null;
  selectedMaskId = fallback ? fallback.id : null;
  return fallback;
}

function closeProfileInlineEditor(): void {
  profileEditAction = null;
  profileInlineEditor.classList.add('hidden');
  inputProfileName.value = '';
}

function openProfileInlineEditor(action: 'add' | 'rename'): void {
  if (!currentPreset) return;
  profileEditAction = action;
  if (action === 'add') {
    const nextIdx = String(currentPreset.profiles.length + 1);
    const defName = getMessage('defaultProfileName', [nextIdx]);
    inputProfileName.value =
      defName && defName !== 'defaultProfileName'
        ? defName
        : `Profile ${nextIdx}`;
  } else {
    const activeProfile = getActiveProfile(currentPreset);
    inputProfileName.value = activeProfile.name;
  }
  profileInlineEditor.classList.remove('hidden');
  inputProfileName.focus();
  inputProfileName.select();
}

function updateStyleControls(
  style: Partial<MaskStyle> | null | undefined
): void {
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

function renderProfileAndMaskControls(): void {
  if (!currentPreset) return;
  const activeProfile = getActiveProfile(currentPreset);
  const selectedMask = getSelectedMask();

  // 1. Render profile select options
  profileSelect.replaceChildren();
  for (const prof of currentPreset.profiles) {
    const opt = document.createElement('option');
    opt.value = prof.id;
    opt.textContent = prof.name;
    opt.selected = prof.id === activeProfile.id;
    profileSelect.appendChild(opt);
  }
  profileSelect.value = activeProfile.id;

  btnProfileAdd.disabled =
    currentPreset.profiles.length >= MAX_PROFILES_PER_CHANNEL;
  btnProfileDelete.disabled = currentPreset.profiles.length <= 1;

  // 2. Render mask chips
  maskChipsList.replaceChildren();
  activeProfile.masks.forEach((mask, idx) => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'mask-chip-btn';
    if (selectedMask && mask.id === selectedMask.id) {
      btn.classList.add('active');
    }

    const dot = document.createElement('span');
    dot.className = 'mask-chip-dot';
    dot.style.backgroundColor = mask.style.color || '#000000';

    const label = document.createElement('span');
    const idxStr = String(idx + 1);
    const i18nLabel = getMessage('maskItemLabel', [idxStr]);
    label.textContent =
      i18nLabel && i18nLabel !== 'maskItemLabel' ? i18nLabel : `#${idxStr}`;

    btn.appendChild(dot);
    btn.appendChild(label);

    btn.addEventListener('click', async () => {
      selectedMaskId = mask.id;
      renderProfileAndMaskControls();
      await sendMessageToTab({
        type: MESSAGE_TYPES.SELECT_MASK,
        maskId: mask.id,
      });
    });

    maskChipsList.appendChild(btn);
  });

  btnAddMaskItem.disabled = activeProfile.masks.length >= MAX_MASKS_PER_PROFILE;
  btnDeleteMask.disabled = activeProfile.masks.length <= 1;

  if (selectedMask) {
    updateStyleControls(selectedMask.style);
  }
}

function triggerPresetSave(): void {
  if (!currentPreset) return;
  if (saveTimer) clearTimeout(saveTimer);
  const targetChannelId = currentPreset.channelId;
  const activeProfile = getActiveProfile(currentPreset);
  const currentMask = getSelectedMask();
  if (!currentMask) return;

  const targetProfileId = activeProfile.id;
  const targetMaskId = currentMask.id;
  const styleSnapshot: MaskStyle = { ...currentMask.style };
  const enabledSnapshot = currentPreset.enabled;

  saveTimer = setTimeout(async () => {
    await updatePreset(targetChannelId, (latest) => {
      latest.enabled = enabledSnapshot;
      const prof =
        latest.profiles.find((pr) => pr.id === targetProfileId) ||
        getActiveProfile(latest);
      const mask =
        prof.masks.find((m) => m.id === targetMaskId) || prof.masks[0];
      if (mask) {
        mask.style = { ...styleSnapshot };
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
  selectedMaskId = state.selectedMaskId ?? selectedMaskId;
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
  closeProfileInlineEditor();
  hasPresetChannelName.textContent =
    currentPreset.channelName || currentChannel.channelName;
  channelToggle.checked = currentPreset.enabled !== false;

  renderProfileAndMaskControls();

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
    selectedMaskId = null;
    refresh();
  }
});

btnModeView.addEventListener('click', async () => {
  await sendMessageToTab({ type: MESSAGE_TYPES.SET_EDIT_MODE, on: false });
  updateModeButtons(false);
});

btnModeEdit.addEventListener('click', async () => {
  const mask = getSelectedMask();
  await sendMessageToTab({
    type: MESSAGE_TYPES.SET_EDIT_MODE,
    on: true,
    ...(mask ? { maskId: mask.id } : {}),
  });
  updateModeButtons(true);
});

channelToggle.addEventListener('change', async () => {
  if (!currentPreset) return;
  const enabled = channelToggle.checked;
  currentPreset.enabled = enabled;
  if (!enabled) {
    updateModeButtons(false);
  }
  await updatePreset(currentPreset.channelId, (latest) => {
    latest.enabled = enabled;
    return latest;
  });
});

// Profile Event Handlers
profileSelect.addEventListener('change', async () => {
  if (!currentPreset) return;
  const nextProfileId = profileSelect.value;
  closeProfileInlineEditor();
  currentPreset.activeProfileId = nextProfileId;
  selectedMaskId = null;

  const updated = await updatePreset(currentPreset.channelId, (latest) => {
    latest.activeProfileId = nextProfileId;
    return latest;
  });
  if (updated) currentPreset = updated;

  const firstMask = getSelectedMask();
  renderProfileAndMaskControls();
  if (firstMask) {
    await sendMessageToTab({
      type: MESSAGE_TYPES.SELECT_MASK,
      maskId: firstMask.id,
    });
  }
});

btnProfileAdd.addEventListener('click', () => {
  openProfileInlineEditor('add');
});

btnProfileRename.addEventListener('click', () => {
  openProfileInlineEditor('rename');
});

async function commitProfileInlineEdit(): Promise<void> {
  if (!currentPreset || !profileEditAction) return;
  const name = inputProfileName.value.trim();
  if (!name) {
    closeProfileInlineEditor();
    return;
  }

  const action = profileEditAction;
  closeProfileInlineEditor();

  if (action === 'add') {
    let createdMaskId: string | null = null;
    const updated = await updatePreset(currentPreset.channelId, (latest) => {
      const res = addProfileToPreset(
        latest,
        name,
        currentSettings ? currentSettings.defaultStyle : undefined
      );
      createdMaskId = res.profile.masks[0]?.id ?? null;
      return res.preset;
    });
    if (updated) {
      currentPreset = updated;
      selectedMaskId = createdMaskId;
      renderProfileAndMaskControls();
      if (createdMaskId) {
        await sendMessageToTab({
          type: MESSAGE_TYPES.SELECT_MASK,
          maskId: createdMaskId,
        });
      }
    }
  } else if (action === 'rename') {
    const activeProfile = getActiveProfile(currentPreset);
    const updated = await updatePreset(currentPreset.channelId, (latest) =>
      renameProfileInPreset(latest, activeProfile.id, name)
    );
    if (updated) {
      currentPreset = updated;
      renderProfileAndMaskControls();
    }
  }
}

btnProfileSave.addEventListener('click', () => {
  void commitProfileInlineEdit();
});

btnProfileCancel.addEventListener('click', () => {
  closeProfileInlineEditor();
});

inputProfileName.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') {
    e.preventDefault();
    void commitProfileInlineEdit();
  } else if (e.key === 'Escape') {
    e.preventDefault();
    closeProfileInlineEditor();
  }
});

btnProfileDelete.addEventListener('click', async () => {
  if (!currentPreset || currentPreset.profiles.length <= 1) return;
  const activeProfile = getActiveProfile(currentPreset);
  const confirmMsg =
    getMessage('deleteProfileConfirm', [activeProfile.name]) ||
    `Delete profile '${activeProfile.name}'?`;
  if (!window.confirm(confirmMsg)) return;

  closeProfileInlineEditor();
  const updated = await updatePreset(currentPreset.channelId, (latest) =>
    deleteProfileFromPreset(latest, activeProfile.id)
  );
  if (updated) {
    currentPreset = updated;
    selectedMaskId = null;
    renderProfileAndMaskControls();
    const firstMask = getSelectedMask();
    if (firstMask) {
      await sendMessageToTab({
        type: MESSAGE_TYPES.SELECT_MASK,
        maskId: firstMask.id,
      });
    }
  }
});

// Mask Item Event Handlers
btnAddMaskItem.addEventListener('click', async () => {
  if (!currentPreset) return;
  const activeProfile = getActiveProfile(currentPreset);
  if (activeProfile.masks.length >= MAX_MASKS_PER_PROFILE) return;

  let newMaskId: string | null = null;
  const updated = await updatePreset(currentPreset.channelId, (latest) => {
    const res = addMaskToProfile(
      latest,
      activeProfile.id,
      currentSettings ? currentSettings.defaultStyle : undefined
    );
    newMaskId = res.mask.id;
    return res.preset;
  });

  if (updated && newMaskId) {
    currentPreset = updated;
    selectedMaskId = newMaskId;
    renderProfileAndMaskControls();
    await sendMessageToTab({
      type: MESSAGE_TYPES.SET_EDIT_MODE,
      on: true,
      maskId: newMaskId,
    });
    updateModeButtons(true);
  }
});

btnDeleteMask.addEventListener('click', async () => {
  if (!currentPreset) return;
  const activeProfile = getActiveProfile(currentPreset);
  if (activeProfile.masks.length <= 1) return;
  const targetMask = getSelectedMask();
  if (!targetMask) return;

  const updated = await updatePreset(currentPreset.channelId, (latest) =>
    deleteMaskFromProfile(latest, activeProfile.id, targetMask.id)
  );
  if (updated) {
    currentPreset = updated;
    selectedMaskId = null;
    const nextMask = getSelectedMask();
    renderProfileAndMaskControls();
    if (nextMask) {
      await sendMessageToTab({
        type: MESSAGE_TYPES.SELECT_MASK,
        maskId: nextMask.id,
      });
    }
  }
});

// Style Event Handlers
chipBlur.addEventListener('click', () => {
  const mask = getSelectedMask();
  if (!mask) return;
  mask.style.type = 'blur';
  if (mask.style.opacity === 1.0) {
    mask.style.opacity = 0.45;
  }
  updateStyleControls(mask.style);
  triggerPresetSave();
});

chipSolid.addEventListener('click', () => {
  const mask = getSelectedMask();
  if (!mask) return;
  mask.style.type = 'solid';
  mask.style.opacity = 1.0;
  updateStyleControls(mask.style);
  triggerPresetSave();
});

inputColor.addEventListener('input', () => {
  const mask = getSelectedMask();
  if (!mask) return;
  mask.style.color = inputColor.value;
  colorHexDisplay.textContent = inputColor.value.toUpperCase();
  const activeChipDot = maskChipsList.querySelector<HTMLElement>(
    '.mask-chip-btn.active .mask-chip-dot'
  );
  if (activeChipDot) {
    activeChipDot.style.backgroundColor = inputColor.value;
  }
  triggerPresetSave();
});

inputOpacity.addEventListener('input', () => {
  const mask = getSelectedMask();
  if (!mask) return;
  const pct = parseInt(inputOpacity.value, 10);
  mask.style.opacity = pct / 100;
  opacityValDisplay.textContent = `${pct}%`;
  triggerPresetSave();
});

inputBlur.addEventListener('input', () => {
  const mask = getSelectedMask();
  if (!mask) return;
  const blurPx = parseInt(inputBlur.value, 10);
  mask.style.blur = blurPx;
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
  selectedMaskId = null;
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
