import type { ExclusionReason } from '../types/channel';

export function getExclusionReason(): ExclusionReason {
  const path = window.location.pathname;

  if (path.startsWith('/shorts')) {
    return 'shorts';
  }

  if (path !== '/watch') {
    return 'non-watch';
  }

  // Check for active ad
  const playerEl = document.querySelector('#movie_player');
  if (
    playerEl &&
    (playerEl.classList.contains('ad-showing') ||
      playerEl.classList.contains('ad-interrupting'))
  ) {
    return 'ad';
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

export function isExcluded(): boolean {
  return getExclusionReason() !== null;
}

/**
 * Sets up MutationObservers to quickly react to ad appearance or miniplayer changes.
 */
export function observeExclusions(
  onChange: (reason: ExclusionReason) => void
): () => void {
  let lastReason = getExclusionReason();

  function check() {
    const current = getExclusionReason();
    if (current !== lastReason) {
      lastReason = current;
      onChange(current);
    }
  }

  const observers: MutationObserver[] = [];

  // Observe player class changes (ad-showing)
  const playerEl = document.querySelector('#movie_player');
  if (playerEl) {
    const playerObs = new MutationObserver(check);
    playerObs.observe(playerEl, {
      attributes: true,
      attributeFilter: ['class'],
    });
    observers.push(playerObs);
  }

  // Observe ytd-app attributes (miniplayer-is-active)
  const ytdApp = document.querySelector('ytd-app') || document.body;
  if (ytdApp) {
    const appObs = new MutationObserver(check);
    appObs.observe(ytdApp, {
      attributes: true,
      attributeFilter: ['miniplayer-is-active'],
    });
    observers.push(appObs);
  }

  return () => {
    for (const obs of observers) {
      obs.disconnect();
    }
  };
}
