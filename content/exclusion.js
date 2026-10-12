(() => {
  'use strict';

  function getExclusionReason() {
    const path = window.location.pathname;

    if (path.startsWith('/shorts')) {
      return 'shorts';
    }

    if (path !== '/watch') {
      return 'non-watch';
    }

    // Check for active ad
    const playerEl = document.querySelector('#movie_player');
    if (playerEl && (
      playerEl.classList.contains('ad-showing') ||
      playerEl.classList.contains('ad-interrupting') ||
      document.querySelector('.ytp-ad-player-overlay') ||
      document.querySelector('.video-ads.ytp-ad-module')
    )) {
      // Confirm ad is really displaying
      const adModule = document.querySelector('.video-ads.ytp-ad-module');
      if (playerEl.classList.contains('ad-showing') || (adModule && adModule.children.length > 0)) {
        return 'ad';
      }
    }

    // Check for miniplayer
    const ytdApp = document.querySelector('ytd-app');
    if (ytdApp && ytdApp.hasAttribute('miniplayer-is-active')) {
      return 'miniplayer';
    }
    const miniplayerEl = document.querySelector('ytd-miniplayer[active]');
    if (miniplayerEl) {
      return 'miniplayer';
    }

    return null;
  }

  function isExcluded() {
    return getExclusionReason() !== null;
  }

  /**
   * Sets up MutationObservers to quickly react to ad appearance or miniplayer changes.
   *
   * @param {() => void} onChange - Callback triggered when exclusion state might have changed
   * @returns {() => void} Cleanup function
   */
  function observeExclusions(onChange) {
    let lastReason = getExclusionReason();

    function check() {
      const current = getExclusionReason();
      if (current !== lastReason) {
        lastReason = current;
        onChange(current);
      }
    }

    const observers = [];

    // Observe player class changes (ad-showing)
    const playerEl = document.querySelector('#movie_player');
    if (playerEl) {
      const playerObs = new MutationObserver(check);
      playerObs.observe(playerEl, { attributes: true, attributeFilter: ['class'] });
      observers.push(playerObs);
    }

    // Observe ytd-app attributes (miniplayer-is-active)
    const ytdApp = document.querySelector('ytd-app') || document.body;
    if (ytdApp) {
      const appObs = new MutationObserver(check);
      appObs.observe(ytdApp, { attributes: true, attributeFilter: ['miniplayer-is-active'] });
      observers.push(appObs);
    }

    return () => {
      for (const obs of observers) {
        obs.disconnect();
      }
    };
  }

  const ATF_EXCLUSION = {
    getExclusionReason,
    isExcluded,
    observeExclusions
  };

  if (typeof globalThis !== 'undefined') {
    globalThis.ATF = globalThis.ATF || {};
    globalThis.ATF.EXCLUSION = ATF_EXCLUSION;
  }
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = ATF_EXCLUSION;
  }
})();
