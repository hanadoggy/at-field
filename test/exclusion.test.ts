import { assert, test } from 'vitest';
import * as exclusion from '../src/content/exclusion';
import { withMockGlobals } from './helpers/mock-dom';

test('exclusion.getExclusionReason - detects shorts URLs', () => {
  withMockGlobals(
    {
      window: { location: { pathname: '/shorts/xyz123' } },
      document: { querySelector: () => null },
    },
    () => {
      assert.equal(exclusion.getExclusionReason(), 'shorts');
      assert.equal(exclusion.isExcluded(), true);
    }
  );
});

test('exclusion.getExclusionReason - detects non-watch pages', () => {
  withMockGlobals(
    {
      window: { location: { pathname: '/feed/subscriptions' } },
      document: { querySelector: () => null },
    },
    () => {
      assert.equal(exclusion.getExclusionReason(), 'non-watch');
      assert.equal(exclusion.isExcluded(), true);
    }
  );
});

test('exclusion.getExclusionReason - detects active ad overlay on movie_player', () => {
  // 1. ad-showing
  withMockGlobals(
    {
      window: { location: { pathname: '/watch' } },
      document: {
        querySelector: (sel: string) => {
          if (sel === '#movie_player') {
            return {
              classList: {
                contains: (cls: string) => cls === 'ad-showing',
              },
            };
          }
          return null;
        },
      },
    },
    () => {
      assert.equal(exclusion.getExclusionReason(), 'ad');
      assert.equal(exclusion.isExcluded(), true);
    }
  );

  // 2. ad-interrupting
  withMockGlobals(
    {
      window: { location: { pathname: '/watch' } },
      document: {
        querySelector: (sel: string) => {
          if (sel === '#movie_player') {
            return {
              classList: {
                contains: (cls: string) => cls === 'ad-interrupting',
              },
            };
          }
          return null;
        },
      },
    },
    () => {
      assert.equal(exclusion.getExclusionReason(), 'ad');
      assert.equal(exclusion.isExcluded(), true);
    }
  );
});

test('exclusion.getExclusionReason - detects miniplayer states', () => {
  // Case 1: ytd-app with miniplayer-is-active
  withMockGlobals(
    {
      window: { location: { pathname: '/watch' } },
      document: {
        querySelector: (sel: string) => {
          if (sel === '#movie_player') {
            return { classList: { contains: () => false } };
          }
          if (sel === 'ytd-app') {
            return {
              hasAttribute: (attr: string) => attr === 'miniplayer-is-active',
            };
          }
          return null;
        },
      },
    },
    () => {
      assert.equal(exclusion.getExclusionReason(), 'miniplayer');
      assert.equal(exclusion.isExcluded(), true);
    }
  );

  // Case 2: ytd-miniplayer[active] present
  withMockGlobals(
    {
      window: { location: { pathname: '/watch' } },
      document: {
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
        },
      },
    },
    () => {
      assert.equal(exclusion.getExclusionReason(), 'miniplayer');
      assert.equal(exclusion.isExcluded(), true);
    }
  );
});

test('exclusion.getExclusionReason - returns null on normal watch page', () => {
  withMockGlobals(
    {
      window: { location: { pathname: '/watch' } },
      document: {
        querySelector: (sel: string) => {
          if (sel === '#movie_player') {
            return { classList: { contains: () => false } };
          }
          if (sel === 'ytd-app') {
            return { hasAttribute: () => false };
          }
          return null;
        },
      },
    },
    () => {
      assert.equal(exclusion.getExclusionReason(), null);
      assert.equal(exclusion.isExcluded(), false);
    }
  );
});
