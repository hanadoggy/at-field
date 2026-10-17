import { assert, test } from 'vitest';
import * as exclusion from '../src/content/exclusion';

const g = globalThis as Record<string, any>;

test('exclusion.getExclusionReason - detects shorts URLs', () => {
  g.window = { location: { pathname: '/shorts/xyz123' } };
  g.document = { querySelector: () => null };

  try {
    assert.equal(exclusion.getExclusionReason(), 'shorts');
    assert.equal(exclusion.isExcluded(), true);
  } finally {
    delete g.window;
    delete g.document;
  }
});

test('exclusion.getExclusionReason - detects non-watch pages', () => {
  g.window = { location: { pathname: '/feed/subscriptions' } };
  g.document = { querySelector: () => null };

  try {
    assert.equal(exclusion.getExclusionReason(), 'non-watch');
    assert.equal(exclusion.isExcluded(), true);
  } finally {
    delete g.window;
    delete g.document;
  }
});

test('exclusion.getExclusionReason - detects active ad overlay on movie_player', () => {
  g.window = { location: { pathname: '/watch' } };

  // 1. ad-showing
  g.document = {
    querySelector: (sel: string) => {
      if (sel === '#movie_player') {
        return {
          classList: {
            contains: (cls: string) => cls === 'ad-showing'
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
    delete g.window;
    delete g.document;
  }

  // 2. ad-interrupting
  g.window = { location: { pathname: '/watch' } };
  g.document = {
    querySelector: (sel: string) => {
      if (sel === '#movie_player') {
        return {
          classList: {
            contains: (cls: string) => cls === 'ad-interrupting'
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
    delete g.window;
    delete g.document;
  }
});

test('exclusion.getExclusionReason - detects miniplayer states', () => {
  g.window = { location: { pathname: '/watch' } };

  // Case 1: ytd-app with miniplayer-is-active
  g.document = {
    querySelector: (sel: string) => {
      if (sel === '#movie_player') {
        return { classList: { contains: () => false } };
      }
      if (sel === 'ytd-app') {
        return { hasAttribute: (attr: string) => attr === 'miniplayer-is-active' };
      }
      return null;
    }
  };

  try {
    assert.equal(exclusion.getExclusionReason(), 'miniplayer');
    assert.equal(exclusion.isExcluded(), true);
  } finally {
    delete g.window;
    delete g.document;
  }

  // Case 2: ytd-miniplayer[active] present
  g.window = { location: { pathname: '/watch' } };
  g.document = {
    querySelector: (sel: string) => {
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
    delete g.window;
    delete g.document;
  }
});

test('exclusion.getExclusionReason - returns null on normal watch page', () => {
  g.window = { location: { pathname: '/watch' } };
  g.document = {
    querySelector: (sel: string) => {
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
    delete g.window;
    delete g.document;
  }
});
