import './style.css';
import { defineContentScript } from 'wxt/utils/define-content-script';
import {
  initChannelTracking,
  resolveChannel,
  resolveChannelOnce,
} from '../../content/channel';
import { MaskEditor } from '../../content/editor';
import { getExclusionReason, observeExclusions } from '../../content/exclusion';
import {
  removeAllMasks,
  syncProfileMasks,
  updateMaskPosition,
} from '../../content/mask';
import { getExtensionApi } from '../../shared/browser-api';
import { CHANNEL_KEY_PREFIX, SETTINGS_KEY } from '../../shared/constants';
import { MESSAGE_TYPES, type AtfRequest } from '../../shared/messages';
import {
  createDefaultPreset,
  getActiveProfile,
  getPreset,
  getSettings,
  migrate,
  normalizePreset,
  normalizeSettings,
  savePreset,
} from '../../shared/storage';
import type { ChannelInfo } from '../../types/channel';
import type { ChannelPreset, Mask, Settings } from '../../types/schema';

function isAtfRequest(msg: unknown): msg is AtfRequest {
  if (!msg || typeof msg !== 'object') return false;
  const type = (msg as { type?: unknown }).type;
  return (
    type === MESSAGE_TYPES.GET_STATE ||
    type === MESSAGE_TYPES.SET_EDIT_MODE ||
    type === MESSAGE_TYPES.TOGGLE_EDIT_MODE ||
    type === MESSAGE_TYPES.CREATE_PRESET ||
    type === MESSAGE_TYPES.SELECT_MASK
  );
}

export default defineContentScript({
  matches: ['*://www.youtube.com/*'],
  runAt: 'document_idle',
  main() {
    initChannelTracking();

    let currentSettings: Settings | null = null;
    let currentChannel: ChannelInfo | null = null;
    let currentPreset: ChannelPreset | null = null;
    let isEditMode = false;
    let isTogglingEditMode = false;
    let activeEditor: MaskEditor | null = null;
    let maskElements = new Map<string, HTMLElement>();
    let selectedMaskId: string | null = null;
    let inactiveMaskCleanups: Array<() => void> = [];
    let navGeneration = 0;
    let syncGeneration = 0;

    let playerEl: HTMLElement | null = null;
    let videoEl: HTMLVideoElement | null = null;
    let currentObservedPlayerEl: HTMLElement | null = null;
    let currentObservedVideoEl: HTMLVideoElement | null = null;
    let globalListenersAttached = false;
    let resizeObserver: ResizeObserver | null = null;
    let animFrameId: number | null = null;
    let unobserveExclusions: (() => void) | null = null;

    function clearInactiveMaskListeners(): void {
      for (const cleanup of inactiveMaskCleanups) {
        cleanup();
      }
      inactiveMaskCleanups = [];
    }

    function clearAllMasksFromDOM(): void {
      clearInactiveMaskListeners();
      if (playerEl) removeAllMasks(playerEl);
      maskElements.clear();
    }

    function ensureSelectedMask(preset: ChannelPreset | null): Mask | null {
      if (!preset || !preset.profiles || preset.profiles.length === 0) {
        selectedMaskId = null;
        return null;
      }
      const activeProfile = getActiveProfile(preset);
      if (selectedMaskId) {
        const matched = activeProfile.masks.find((m) => m.id === selectedMaskId);
        if (matched) return matched;
      }
      const first = activeProfile.masks[0] ?? null;
      selectedMaskId = first ? first.id : null;
      return first;
    }

    function ensurePlayerElements(): boolean {
      if (
        !playerEl ||
        !playerEl.isConnected ||
        !videoEl ||
        !videoEl.isConnected
      ) {
        return findPlayerElements();
      }
      return true;
    }

    function schedulePositionUpdate(): void {
      if (animFrameId) cancelAnimationFrame(animFrameId);
      animFrameId = requestAnimationFrame(() => {
        animFrameId = null;
        ensurePlayerElements();
        if (currentPreset && playerEl && videoEl && maskElements.size > 0) {
          const activeProfile = getActiveProfile(currentPreset);
          for (const maskData of activeProfile.masks) {
            const el = maskElements.get(maskData.id);
            if (el) {
              updateMaskPosition(el, maskData.rect, playerEl, videoEl);
            }
          }
          if (activeEditor) {
            activeEditor.refresh();
          }
        }
      });
    }

    function bindEditorToSelectedMask(): void {
      if (activeEditor) {
        activeEditor.destroy();
        activeEditor = null;
      }
      clearInactiveMaskListeners();

      if (!isEditMode || !currentPreset || !playerEl || !videoEl) {
        isEditMode = false;
        return;
      }

      const activeProfile = getActiveProfile(currentPreset);
      const maskData = ensureSelectedMask(currentPreset);
      if (!maskData) {
        isEditMode = false;
        return;
      }

      const targetMaskId = maskData.id;
      const targetMaskEl = maskElements.get(targetMaskId);
      if (!targetMaskEl) {
        isEditMode = false;
        return;
      }

      const maskIndex =
        activeProfile.masks.findIndex((m) => m.id === targetMaskId) + 1;
      const totalMasks = activeProfile.masks.length;

      function getTargetMask(): Mask | null {
        if (!currentPreset || !currentPreset.profiles) return null;
        const profile = getActiveProfile(currentPreset);
        return (
          profile.masks.find((m) => m.id === targetMaskId) ||
          profile.masks[0] ||
          null
        );
      }

      activeEditor = new MaskEditor({
        maskEl: targetMaskEl,
        playerEl,
        videoEl,
        initialRect: maskData.rect,
        maskIndex,
        totalMasks,
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
        },
        onCycleMask: (delta) => {
          if (!currentPreset) return;
          const profile = getActiveProfile(currentPreset);
          const len = profile.masks.length;
          if (len <= 1) return;
          const curIdx = profile.masks.findIndex((m) => m.id === targetMaskId);
          const nextIdx = ((curIdx >= 0 ? curIdx : 0) + delta + len) % len;
          const nextMask = profile.masks[nextIdx];
          if (nextMask) {
            selectedMaskId = nextMask.id;
            bindEditorToSelectedMask();
          }
        },
      });

      // Make non-selected masks clickable in edit mode to switch selection
      for (const m of activeProfile.masks) {
        if (m.id === targetMaskId) continue;
        const el = maskElements.get(m.id);
        if (!el) continue;

        el.classList.add('atf-editing-inactive');
        const onPointerDown = (e: PointerEvent): void => {
          if (e.button !== 0) return;
          e.preventDefault();
          e.stopPropagation();
          if (activeEditor) {
            void activeEditor.flushPendingSave();
          }
          selectedMaskId = m.id;
          bindEditorToSelectedMask();
        };
        const onPreventNative = (e: Event): void => {
          e.stopPropagation();
        };

        el.addEventListener('pointerdown', onPointerDown);
        el.addEventListener('click', onPreventNative);
        el.addEventListener('dblclick', onPreventNative);

        inactiveMaskCleanups.push(() => {
          el.classList.remove('atf-editing-inactive');
          el.removeEventListener('pointerdown', onPointerDown);
          el.removeEventListener('click', onPreventNative);
          el.removeEventListener('dblclick', onPreventNative);
        });
      }
    }

    function setEditMode(on: boolean, maskId?: string): void {
      if (maskId) {
        selectedMaskId = maskId;
      }

      if (!on) {
        isEditMode = false;
        if (activeEditor) {
          activeEditor.destroy();
          activeEditor = null;
        }
        clearInactiveMaskListeners();
        return;
      }

      isEditMode = true;
      bindEditorToSelectedMask();
    }

    async function sync(): Promise<void> {
      const myNavGen = navGeneration;
      const mySyncGen = ++syncGeneration;

      const isWatch = window.location.pathname === '/watch';
      const exclusionReason = getExclusionReason();

      // Hide everything if not on watch, global disabled, or excluded (ad/miniplayer/etc.)
      if (
        !isWatch ||
        (currentSettings && !currentSettings.enabled) ||
        exclusionReason !== null
      ) {
        if (isEditMode) setEditMode(false);
        clearAllMasksFromDOM();
        return;
      }

      // Channel check
      if (!currentChannel) {
        clearAllMasksFromDOM();
        return;
      }

      const targetChannelId = currentChannel.channelId;

      // Load or reload preset
      const loadedPreset = await getPreset(targetChannelId);
      if (
        myNavGen !== navGeneration ||
        mySyncGen !== syncGeneration ||
        !currentChannel ||
        currentChannel.channelId !== targetChannelId
      ) {
        return;
      }
      currentPreset = loadedPreset;

      // If channel preset doesn't exist or is disabled
      if (!currentPreset || !currentPreset.enabled) {
        if (isEditMode) setEditMode(false);
        clearAllMasksFromDOM();
        return;
      }

      // Preset is active! Ensure elements
      if (!ensurePlayerElements() || !playerEl || !videoEl) return;

      const activeProfile = getActiveProfile(currentPreset);
      if (!activeProfile.masks || activeProfile.masks.length === 0) {
        clearAllMasksFromDOM();
        return;
      }

      maskElements = syncProfileMasks(playerEl, videoEl, activeProfile.masks);
      ensureSelectedMask(currentPreset);

      // If edit mode was on, maintain editor bound to selected mask
      if (isEditMode) {
        bindEditorToSelectedMask();
      }
    }

    async function handleNavigation(): Promise<void> {
      const myNavGen = ++navGeneration;

      // Immediately clear mask when navigation starts/finishes to prevent flicker
      clearAllMasksFromDOM();
      selectedMaskId = null;
      if (isEditMode) setEditMode(false);

      if (window.location.pathname !== '/watch') {
        currentChannel = null;
        currentPreset = null;
        return;
      }

      // Resolve channel with retries
      const resolved = await resolveChannel();
      if (myNavGen !== navGeneration) {
        return;
      }
      currentChannel = resolved;
      await sync();
    }

    function findPlayerElements(): boolean {
      playerEl = document.querySelector<HTMLElement>('#movie_player');
      videoEl = playerEl
        ? playerEl.querySelector<HTMLVideoElement>('video')
        : document.querySelector<HTMLVideoElement>('video');

      if (playerEl && videoEl) {
        attachPlayerListeners();
        return true;
      }
      return false;
    }

    function attachPlayerListeners(): void {
      if (!videoEl || !playerEl) return;

      // 1. Global listeners: attach only once across extension lifecycle
      if (!globalListenersAttached) {
        document.addEventListener('fullscreenchange', schedulePositionUpdate);
        window.addEventListener('resize', schedulePositionUpdate);
        globalListenersAttached = true;
      }

      // 2. Element-specific listeners: skip if already attached to these exact connected elements
      if (
        playerEl === currentObservedPlayerEl &&
        videoEl === currentObservedVideoEl
      ) {
        return;
      }

      // Clean up previous video listeners if video element changed
      if (currentObservedVideoEl && currentObservedVideoEl !== videoEl) {
        currentObservedVideoEl.removeEventListener(
          'loadedmetadata',
          schedulePositionUpdate
        );
        currentObservedVideoEl.removeEventListener(
          'resize',
          schedulePositionUpdate
        );
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

    function handleStorageChange(
      changes: Record<string, browser.storage.StorageChange>,
      areaName: string
    ): void {
      if (areaName !== 'local') return;

      let shouldSync = false;

      if (changes[SETTINGS_KEY]) {
        currentSettings = normalizeSettings(changes[SETTINGS_KEY].newValue);
        shouldSync = true;
      }

      if (currentChannel) {
        const channelKey = `${CHANNEL_KEY_PREFIX}${currentChannel.channelId}`;
        if (changes[channelKey]) {
          const rawPreset = changes[channelKey].newValue;
          currentPreset = rawPreset
            ? normalizePreset(
                rawPreset,
                currentSettings ? currentSettings.defaultStyle : undefined
              )
            : null;
          shouldSync = true;
        }
      }

      if (shouldSync) {
        sync();
      }
    }

    function handleMessage(
      message: unknown,
      _sender: browser.runtime.MessageSender,
      sendResponse: (response?: unknown) => void
    ): true | undefined {
      if (!isAtfRequest(message)) return undefined;

      if (message.type === MESSAGE_TYPES.GET_STATE) {
        const isWatch = window.location.pathname === '/watch';
        const exclusionReason = getExclusionReason();
        const selected = ensureSelectedMask(currentPreset);
        sendResponse({
          isWatch,
          exclusionReason,
          channel: currentChannel,
          hasPreset: !!(
            currentPreset &&
            currentPreset.profiles &&
            currentPreset.profiles.length > 0
          ),
          preset: currentPreset || null,
          selectedMaskId: selected ? selected.id : null,
          editMode: isEditMode,
          globalEnabled: currentSettings
            ? currentSettings.enabled !== false
            : true,
        });
        return true;
      }

      if (message.type === MESSAGE_TYPES.SET_EDIT_MODE) {
        setEditMode(!!message.on, message.maskId);
        sendResponse({ editMode: isEditMode, selectedMaskId });
        return true;
      }

      if (message.type === MESSAGE_TYPES.SELECT_MASK) {
        if (activeEditor) {
          void activeEditor.flushPendingSave();
        }
        selectedMaskId = message.maskId;
        ensureSelectedMask(currentPreset);
        if (isEditMode) {
          bindEditorToSelectedMask();
        }
        sendResponse({ selectedMaskId });
        return true;
      }

      if (message.type === MESSAGE_TYPES.TOGGLE_EDIT_MODE) {
        if (isTogglingEditMode) {
          sendResponse({ editMode: isEditMode });
          return true;
        }

        if (isEditMode) {
          setEditMode(false);
          sendResponse({ editMode: isEditMode });
          return true;
        }

        const isWatch = window.location.pathname === '/watch';
        const exclusionReason = getExclusionReason();
        const globalEnabled = currentSettings
          ? currentSettings.enabled !== false
          : true;

        if (!isWatch || exclusionReason !== null || !globalEnabled) {
          sendResponse({ editMode: false });
          return true;
        }

        isTogglingEditMode = true;
        const myNavGen = navGeneration;

        (async () => {
          try {
            if (!currentChannel) {
              const quick = resolveChannelOnce();
              if (quick) {
                currentChannel = {
                  channelId: quick.channelId,
                  channelName: quick.channelName,
                };
              }
            }
            if (!currentChannel || myNavGen !== navGeneration) {
              sendResponse({ editMode: false });
              return;
            }

            const targetChannel = currentChannel;

            if (!currentPreset) {
              const loaded = await getPreset(targetChannel.channelId);
              if (
                myNavGen !== navGeneration ||
                !currentChannel ||
                currentChannel.channelId !== targetChannel.channelId
              ) {
                sendResponse({ editMode: false });
                return;
              }
              currentPreset = loaded;
            }

            let createdPreset = false;
            if (!currentPreset) {
              const newPreset = createDefaultPreset(
                targetChannel.channelId,
                targetChannel.channelName,
                currentSettings ? currentSettings.defaultStyle : undefined
              );
              const saved = await savePreset(newPreset);
              if (
                myNavGen !== navGeneration ||
                !currentChannel ||
                currentChannel.channelId !== targetChannel.channelId
              ) {
                sendResponse({ editMode: false });
                return;
              }
              currentPreset = saved;
              createdPreset = true;
            } else if (!currentPreset.enabled) {
              currentPreset.enabled = true;
              const saved = await savePreset(currentPreset);
              if (
                myNavGen !== navGeneration ||
                !currentChannel ||
                currentChannel.channelId !== targetChannel.channelId
              ) {
                sendResponse({ editMode: false });
                return;
              }
              currentPreset = saved;
            }

            await sync();
            if (
              myNavGen !== navGeneration ||
              !currentChannel ||
              currentChannel.channelId !== targetChannel.channelId
            ) {
              sendResponse({ editMode: false });
              return;
            }

            setEditMode(true);
            sendResponse({
              editMode: isEditMode,
              ...(createdPreset ? { createdPreset: true } : {}),
            });
          } finally {
            isTogglingEditMode = false;
          }
        })();
        return true;
      }

      if (message.type === MESSAGE_TYPES.CREATE_PRESET) {
        if (isTogglingEditMode) {
          sendResponse({ success: false, error: 'Operation in progress' });
          return true;
        }

        const myNavGen = navGeneration;
        isTogglingEditMode = true;

        (async () => {
          try {
            if (!currentChannel || myNavGen !== navGeneration) {
              sendResponse({ success: false, error: 'No channel detected' });
              return;
            }
            const targetChannel = currentChannel;
            const newPreset = createDefaultPreset(
              targetChannel.channelId,
              targetChannel.channelName,
              currentSettings ? currentSettings.defaultStyle : undefined
            );
            const saved = await savePreset(newPreset);
            if (
              myNavGen !== navGeneration ||
              !currentChannel ||
              currentChannel.channelId !== targetChannel.channelId
            ) {
              sendResponse({ success: false, error: 'Navigation changed' });
              return;
            }
            currentPreset = saved;
            await sync();
            if (
              myNavGen !== navGeneration ||
              !currentChannel ||
              currentChannel.channelId !== targetChannel.channelId
            ) {
              sendResponse({ success: false, error: 'Navigation changed' });
              return;
            }
            setEditMode(true);
            sendResponse({
              success: true,
              preset: currentPreset,
              editMode: isEditMode,
            });
          } finally {
            isTogglingEditMode = false;
          }
        })();
        return true; // Keep message channel open for async response
      }

      return undefined;
    }

    async function init(): Promise<void> {
      await migrate();
      currentSettings = await getSettings();

      const extApi = getExtensionApi();

      // Listen to storage changes
      if (extApi && extApi.storage && extApi.storage.onChanged) {
        extApi.storage.onChanged.addListener(handleStorageChange);
      }

      // Listen to messages from popup
      if (extApi && extApi.runtime && extApi.runtime.onMessage) {
        extApi.runtime.onMessage.addListener(handleMessage);
      }

      // SPA Navigation Listeners
      window.addEventListener('yt-navigate-start', () => {
        navGeneration++;
        if (isEditMode) setEditMode(false);
        clearAllMasksFromDOM();
        selectedMaskId = null;
      });
      window.addEventListener('yt-navigate-finish', handleNavigation);

      // Exclusion observer (ads, miniplayer)
      unobserveExclusions = observeExclusions(() => {
        sync();
      });
      void unobserveExclusions;

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
  },
});
