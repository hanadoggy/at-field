(() => {
  'use strict';

  const CHANNEL_ID_REGEX = /^UC[\w-]{22}$/;

  let lastNavigatedVideoDetails = null;

  // Listen to yt-navigate-finish to capture fresh player response before DOM settles
  window.addEventListener('yt-navigate-finish', (event) => {
    try {
      // In Firefox, unwrap if wrappedJSObject exists
      const unwrappedEvent = event.wrappedJSObject || event;
      const response = unwrappedEvent.detail && unwrappedEvent.detail.response;
      if (response && response.playerResponse && response.playerResponse.videoDetails) {
        lastNavigatedVideoDetails = response.playerResponse.videoDetails;
      }
    } catch {
      // Ignore security or access errors
    }
  });

  function getCurrentVideoId() {
    try {
      const url = new URL(window.location.href);
      return url.searchParams.get('v') || null;
    } catch {
      return null;
    }
  }

  /**
   * Source 1: Check cached playerResponse from yt-navigate-finish
   */
  function trySourceFromNavigateEvent(expectedVideoId) {
    if (!lastNavigatedVideoDetails) return null;
    try {
      const { videoId, channelId, author } = lastNavigatedVideoDetails;
      if (videoId === expectedVideoId && CHANNEL_ID_REGEX.test(channelId)) {
        return {
          channelId,
          channelName: author || channelId,
          source: 'navigate-event'
        };
      }
    } catch {}
    return null;
  }

  /**
   * Source 2: Query playerResponse directly from #movie_player (Firefox X-ray unwrap)
   */
  function trySourceFromPlayerObject(expectedVideoId) {
    try {
      const playerEl = document.querySelector('#movie_player');
      if (!playerEl) return null;

      const unwrappedPlayer = playerEl.wrappedJSObject || playerEl;
      if (typeof unwrappedPlayer.getPlayerResponse === 'function') {
        const response = unwrappedPlayer.getPlayerResponse();
        if (response && response.videoDetails) {
          const { videoId, channelId, author } = response.videoDetails;
          if (videoId === expectedVideoId && CHANNEL_ID_REGEX.test(channelId)) {
            return {
              channelId,
              channelName: author || channelId,
              source: 'player-object'
            };
          }
        }
      }
    } catch {}
    return null;
  }

  /**
   * Source 3: Parse channel link and name from DOM (ytd-watch-metadata / owner-renderer)
   */
  function trySourceFromDom(expectedVideoId) {
    try {
      // Only proceed if video container matches expected video id (if attribute exists)
      const flexy = document.querySelector('ytd-watch-flexy');
      if (flexy) {
        const domVideoId = flexy.getAttribute('video-id');
        if (domVideoId && domVideoId !== expectedVideoId) {
          return null; // Stale DOM from previous video
        }
      }

      // Try canonical channel link
      const channelLink = document.querySelector(
        'ytd-watch-metadata #owner a[href*="/channel/UC"], ' +
        '#upload-info a[href*="/channel/UC"], ' +
        'ytd-video-owner-renderer a[href*="/channel/UC"]'
      );

      if (channelLink) {
        const href = channelLink.getAttribute('href') || '';
        const match = href.match(/\/channel\/(UC[\w-]{22})/);
        if (match && CHANNEL_ID_REGEX.test(match[1])) {
          const channelNameEl = document.querySelector(
            'ytd-watch-metadata #owner ytd-channel-name a, ' +
            '#upload-info ytd-channel-name a, ' +
            'ytd-channel-name yt-formatted-string'
          );
          const channelName = (channelNameEl && channelNameEl.textContent && channelNameEl.textContent.trim()) || match[1];
          return {
            channelId: match[1],
            channelName,
            source: 'dom-link'
          };
        }
      }

      // Try meta tag as fallback only if videoId matches meta[itemprop="videoId"]
      const metaVideo = document.querySelector('meta[itemprop="videoId"]');
      const metaChannel = document.querySelector('meta[itemprop="channelId"]');
      if (metaVideo && metaChannel) {
        const metaVid = metaVideo.getAttribute('content');
        const metaCh = metaChannel.getAttribute('content');
        if (metaVid === expectedVideoId && CHANNEL_ID_REGEX.test(metaCh)) {
          const channelNameEl = document.querySelector('ytd-channel-name');
          const channelName = (channelNameEl && channelNameEl.textContent && channelNameEl.textContent.trim()) || metaCh;
          return {
            channelId: metaCh,
            channelName,
            source: 'meta-verified'
          };
        }
      }
    } catch {}
    return null;
  }

  /**
   * Single attempt to resolve channel for the current video.
   * Returns { channelId, channelName } or null.
   */
  function resolveChannelOnce() {
    const expectedVideoId = getCurrentVideoId();
    if (!expectedVideoId) return null;

    // 1. Check navigate event cache
    const res1 = trySourceFromNavigateEvent(expectedVideoId);
    if (res1) return res1;

    // 2. Check movie_player object
    const res2 = trySourceFromPlayerObject(expectedVideoId);
    if (res2) return res2;

    // 3. Fallback to DOM parsing
    const res3 = trySourceFromDom(expectedVideoId);
    if (res3) return res3;

    return null;
  }

  /**
   * Resolves channel with retry delays to handle SPA transitions.
   *
   * @param {number} [maxAttempts=10]
   * @param {number} [initialDelay=150]
   * @returns {Promise<{channelId: string, channelName: string}|null>}
   */
  async function resolveChannel(maxAttempts = 10, initialDelay = 150) {
    const startVideoId = getCurrentVideoId();
    if (!startVideoId) return null;

    let delay = initialDelay;
    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      // If user navigated away while we were trying, abort
      if (getCurrentVideoId() !== startVideoId) {
        return null;
      }

      const result = resolveChannelOnce();
      if (result) {
        return {
          channelId: result.channelId,
          channelName: result.channelName
        };
      }

      await new Promise((r) => setTimeout(r, delay));
      delay = Math.min(delay * 1.4, 1000);
    }

    return null;
  }

  const ATF_CHANNEL = {
    getCurrentVideoId,
    resolveChannel,
    resolveChannelOnce
  };

  if (typeof globalThis !== 'undefined') {
    globalThis.ATF = globalThis.ATF || {};
    globalThis.ATF.CHANNEL = ATF_CHANNEL;
  }
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = ATF_CHANNEL;
  }
})();
