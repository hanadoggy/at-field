const test = require('node:test');
const assert = require('node:assert/strict');
const exclusion = require('../content/exclusion.js');

test('exclusion.getExclusionReason - detects shorts URLs', () => {
  globalThis.window = { location: { pathname: '/shorts/xyz123' } };
  globalThis.document = { querySelector: () => null };

  try {
    assert.equal(exclusion.getExclusionReason(), 'shorts');
    assert.equal(exclusion.isExcluded(), true);
  } finally {
    delete globalThis.window;
    delete globalThis.document;
  }
});

test('exclusion.getExclusionReason - detects non-watch pages', () => {
  globalThis.window = { location: { pathname: '/feed/subscriptions' } };
  globalThis.document = { querySelector: () => null };

  try {
    assert.equal(exclusion.getExclusionReason(), 'non-watch');
    assert.equal(exclusion.isExcluded(), true);
  } finally {
    delete globalThis.window;
    delete globalThis.document;
  }
});

test('exclusion.getExclusionReason - detects active ad overlay on movie_player', () => {
  globalThis.window = { location: { pathname: '/watch' } };

  // 1. ad-showing
  globalThis.document = {
    querySelector: (sel) => {
      if (sel === '#movie_player') {
        return {
          classList: {
            contains: (cls) => cls === 'ad-showing'
          }
        };
      }
      return null;
    }
  };

  try {
    assert.equal(exclusion.getExclusionReason(), 'ad');
    assert.equal(exclusion.isExcluded(), true);
  } finally {
    delete globalThis.window;
    delete globalThis.document;
  }

  // 2. ad-interrupting
  globalThis.window = { location: { pathname: '/watch' } };
  globalThis.document = {
    querySelector: (sel) => {
      if (sel === '#movie_player') {
        return {
          classList: {
            contains: (cls) => cls === 'ad-interrupting'
          }
        };
      }
      return null;
    }
  };

  try {
    assert.equal(exclusion.getExclusionReason(), 'ad');
    assert.equal(exclusion.isExcluded(), true);
  } finally {
    delete globalThis.window;
    delete globalThis.document;
  }
});

test('exclusion.getExclusionReason - detects miniplayer states', () => {
  globalThis.window = { location: { pathname: '/watch' } };

  // Case 1: ytd-app with miniplayer-is-active
  globalThis.document = {
    querySelector: (sel) => {
      if (sel === '#movie_player') {
        return { classList: { contains: () => false } };
      }
      if (sel === 'ytd-app') {
        return { hasAttribute: (attr) => attr === 'miniplayer-is-active' };
      }
      return null;
    }
  };

  try {
    assert.equal(exclusion.getExclusionReason(), 'miniplayer');
    assert.equal(exclusion.isExcluded(), true);
  } finally {
    delete globalThis.window;
    delete globalThis.document;
  }

  // Case 2: ytd-miniplayer[active] present
  globalThis.window = { location: { pathname: '/watch' } };
  globalThis.document = {
    querySelector: (sel) => {
      if (sel === '#movie_player') {
        return { classList: { contains: () => false } };
      }
      if (sel === 'ytd-app') {
        return { hasAttribute: () => false };
      }
      if (sel === 'ytd-miniplayer[active]') {
        return {};
      }
      return null;
    }
  };

  try {
    assert.equal(exclusion.getExclusionReason(), 'miniplayer');
    assert.equal(exclusion.isExcluded(), true);
  } finally {
    delete globalThis.window;
    delete globalThis.document;
  }
});

test('exclusion.getExclusionReason - returns null on normal watch page', () => {
  globalThis.window = { location: { pathname: '/watch' } };
  globalThis.document = {
    querySelector: (sel) => {
      if (sel === '#movie_player') {
        return { classList: { contains: () => false } };
      }
      if (sel === 'ytd-app') {
        return { hasAttribute: () => false };
      }
      return null;
    }
  };

  try {
    assert.equal(exclusion.getExclusionReason(), null);
    assert.equal(exclusion.isExcluded(), false);
  } finally {
    delete globalThis.window;
    delete globalThis.document;
  }
});
