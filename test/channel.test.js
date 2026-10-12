const test = require('node:test');
const assert = require('node:assert/strict');
const channel = require('../content/channel.js');

test('channel.getCurrentVideoId - extracts video ID from URL queries', () => {
  globalThis.window = {
    location: { href: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ' }
  };
  try {
    assert.equal(channel.getCurrentVideoId(), 'dQw4w9WgXcQ');

    globalThis.window.location.href = 'https://www.youtube.com/watch?v=abc_123-XYZ&t=45s&list=PL123';
    assert.equal(channel.getCurrentVideoId(), 'abc_123-XYZ');

    globalThis.window.location.href = 'https://www.youtube.com/feed/subscriptions';
    assert.equal(channel.getCurrentVideoId(), null);

    globalThis.window.location.href = 'invalid-url';
    assert.equal(channel.getCurrentVideoId(), null);
  } finally {
    delete globalThis.window;
  }
});

test('channel.resolveChannelOnce - resolves via player object (Source 2)', () => {
  const vid = 'test_vid_123';
  const chId = 'UC1234567890123456789012'; // 24 chars starting with UC
  const author = 'Streamer Channel';

  globalThis.window = {
    location: { href: `https://www.youtube.com/watch?v=${vid}` }
  };

  globalThis.document = {
    querySelector: (sel) => {
      if (sel === '#movie_player') {
        return {
          getPlayerResponse: () => ({
            videoDetails: {
              videoId: vid,
              channelId: chId,
              author
            }
          })
        };
      }
      return null;
    }
  };

  try {
    const resolved = channel.resolveChannelOnce();
    assert.ok(resolved);
    assert.equal(resolved.channelId, chId);
    assert.equal(resolved.channelName, author);
    assert.equal(resolved.source, 'player-object');
  } finally {
    delete globalThis.window;
    delete globalThis.document;
  }
});

test('channel.resolveChannelOnce - rejects stale video ID from player object', () => {
  const vid = 'current_vid_999';
  const staleVid = 'stale_vid_000';
  const chId = 'UC1234567890123456789012';

  globalThis.window = {
    location: { href: `https://www.youtube.com/watch?v=${vid}` }
  };

  globalThis.document = {
    querySelector: (sel) => {
      if (sel === '#movie_player') {
        return {
          getPlayerResponse: () => ({
            videoDetails: {
              videoId: staleVid, // different video ID
              channelId: chId,
              author: 'Stale Streamer'
            }
          })
        };
      }
      return null;
    }
  };

  try {
    const resolved = channel.resolveChannelOnce();
    assert.equal(resolved, null);
  } finally {
    delete globalThis.window;
    delete globalThis.document;
  }
});

test('channel.resolveChannelOnce - resolves via DOM canonical channel link (Source 3)', () => {
  const vid = 'test_vid_456';
  const chId = 'UCabcdef1234567890123456';

  globalThis.window = {
    location: { href: `https://www.youtube.com/watch?v=${vid}` }
  };

  globalThis.document = {
    querySelector: (sel) => {
      if (sel === 'ytd-watch-flexy') {
        return { getAttribute: (attr) => attr === 'video-id' ? vid : null };
      }
      if (sel.includes('#owner a[href*="/channel/UC"]')) {
        return {
          getAttribute: (attr) => attr === 'href' ? `/channel/${chId}` : null
        };
      }
      if (sel.includes('ytd-channel-name')) {
        return { textContent: 'DOM Streamer Name' };
      }
      return null;
    }
  };

  try {
    const resolved = channel.resolveChannelOnce();
    assert.ok(resolved);
    assert.equal(resolved.channelId, chId);
    assert.equal(resolved.channelName, 'DOM Streamer Name');
    assert.equal(resolved.source, 'dom-link');
  } finally {
    delete globalThis.window;
    delete globalThis.document;
  }
});

test('channel.resolveChannelOnce - resolves via meta tag fallback', () => {
  const vid = 'test_vid_789';
  const chId = 'UC9876543210987654321098';

  globalThis.window = {
    location: { href: `https://www.youtube.com/watch?v=${vid}` }
  };

  globalThis.document = {
    querySelector: (sel) => {
      if (sel === 'meta[itemprop="videoId"]') {
        return { getAttribute: (attr) => attr === 'content' ? vid : null };
      }
      if (sel === 'meta[itemprop="channelId"]') {
        return { getAttribute: (attr) => attr === 'content' ? chId : null };
      }
      if (sel === 'ytd-channel-name') {
        return { textContent: 'Meta Streamer Name' };
      }
      return null;
    }
  };

  try {
    const resolved = channel.resolveChannelOnce();
    assert.ok(resolved);
    assert.equal(resolved.channelId, chId);
    assert.equal(resolved.channelName, 'Meta Streamer Name');
    assert.equal(resolved.source, 'meta-verified');
  } finally {
    delete globalThis.window;
    delete globalThis.document;
  }
});
