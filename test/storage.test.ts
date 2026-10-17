import { assert, test } from 'vitest';
import * as storage from '../src/shared/storage';
import type { StorageSchema } from '../src/types/schema';
import rawFixture from './fixtures/storage-v0.1.1.json';

const fixture = rawFixture as StorageSchema;

test('storage.normalizeRect - returns default rect when given null or undefined', () => {
  const def = storage.normalizeRect(null);
  assert.equal(def.x, 0.72);
  assert.equal(def.y, 0.55);
  assert.equal(def.w, 0.26);
  assert.equal(def.h, 0.42);
});

test('storage.normalizeRect - clamps coordinates within [0, 1] and enforces minSize', () => {
  const clamped = storage.normalizeRect({ x: -0.5, y: 0.9, w: 0.001, h: 0.8 });
  assert.equal(clamped.x, 0); // clamped min
  assert.equal(clamped.w, 0.02); // clamped minSize
  assert.equal(clamped.h, 0.8);
  assert.ok(Math.abs(clamped.y - 0.2) < 1e-6); // clamped max (1 - 0.8)
});

test('storage.normalizeStyle - defaults and opacity handling for solid vs blur', () => {
  const blurStyle = storage.normalizeStyle({ type: 'blur', color: '#123456' });
  assert.equal(blurStyle.type, 'blur');
  assert.equal(blurStyle.color, '#123456');
  assert.equal(blurStyle.opacity, 0.45); // default blur opacity
  assert.equal(blurStyle.blur, 16);

  const solidStyle = storage.normalizeStyle({ type: 'solid', color: '#abcdef' });
  assert.equal(solidStyle.type, 'solid');
  assert.equal(solidStyle.opacity, 1.0); // default solid opacity

  // Clamps opacity and blur
  const clampedStyle = storage.normalizeStyle({
    type: 'blur',
    color: 'invalid-hex',
    opacity: 5.0,
    blur: 250
  });
  assert.equal(clampedStyle.color, '#000000'); // fallback color
  assert.equal(clampedStyle.opacity, 1.0); // clamped max 1
  assert.equal(clampedStyle.blur, 100); // clamped max 100
});

test('storage.normalizePreset - upgrades flat legacy preset to profile structure', () => {
  const legacy = {
    channelId: 'UC1234567890123456789012',
    channelName: 'Test Channel',
    rect: { x: 0.5, y: 0.5, w: 0.3, h: 0.3 },
    style: { type: 'solid', color: '#ff0000', opacity: 0.8 }
  };

  const normalized = storage.normalizePreset(legacy);
  assert.ok(normalized);
  assert.equal(normalized.channelId, legacy.channelId);
  assert.equal(normalized.channelName, legacy.channelName);
  assert.equal(normalized.activeProfileId, 'p_default');
  assert.ok(Array.isArray(normalized.profiles));
  assert.equal(normalized.profiles.length, 1);

  const profile = normalized.profiles[0]!;
  assert.equal(profile.id, 'p_default');
  assert.equal(profile.masks.length, 1);
  assert.equal(profile.masks[0]!.rect.x, 0.5);
  assert.equal(profile.masks[0]!.style.type, 'solid');
  assert.equal(profile.masks[0]!.style.color, '#ff0000');
});

test('storage.normalizePreset - validates existing multi-profile structure and repairs activeProfileId', () => {
  const preset = {
    channelId: 'UC9999999999999999999999',
    channelName: 'Multi Profile Channel',
    activeProfileId: 'non_existent_id',
    profiles: [
      {
        id: 'p_1',
        name: 'Profile 1',
        masks: [
          {
            id: 'm_1',
            rect: { x: 0.1, y: 0.1, w: 0.2, h: 0.2 },
            style: { type: 'blur', color: '#000000', opacity: 0.5, blur: 10 }
          }
        ]
      }
    ]
  };

  const normalized = storage.normalizePreset(preset);
  assert.ok(normalized);
  assert.equal(normalized.activeProfileId, 'p_1'); // repaired to first profile id
});

test('storage.normalizePreset - returns null for invalid preset input', () => {
  assert.equal(storage.normalizePreset(null), null);
  assert.equal(storage.normalizePreset({}), null);
  assert.equal(storage.normalizePreset({ channelName: 'No Channel ID' }), null);
});

test('storage.createDefaultPreset - builds valid initial preset structure', () => {
  const preset = storage.createDefaultPreset('UCabc1234567890123456789', 'My Streamer');
  assert.equal(preset.channelId, 'UCabc1234567890123456789');
  assert.equal(preset.channelName, 'My Streamer');
  assert.equal(preset.enabled, true);
  assert.equal(preset.activeProfileId, 'p_default');
  assert.equal(preset.profiles.length, 1);
  assert.equal(preset.profiles[0]!.masks.length, 1);
  assert.equal(preset.profiles[0]!.masks[0]!.rect.x, 0.72);
});

test('storage CRUD with mock storage area', async () => {
  const mockStore: Record<string, any> = {};
  const g = globalThis as Record<string, unknown>;
  g.browser = {
    storage: {
      local: {
        get: async (keys: string | string[] | null) => {
          if (keys === null) return { ...mockStore };
          if (typeof keys === 'string') return { [keys]: mockStore[keys] };
          if (Array.isArray(keys)) {
            const res: Record<string, unknown> = {};
            for (const k of keys) res[k] = mockStore[k];
            return res;
          }
          return {};
        },
        set: async (items: Record<string, unknown>) => {
          Object.assign(mockStore, items);
        },
        remove: async (keys: string | string[]) => {
          const arr = Array.isArray(keys) ? keys : [keys];
          for (const k of arr) delete mockStore[k];
        }
      }
    }
  };

  try {
    // 1. migrate
    await storage.migrate();
    assert.equal(mockStore.meta.schemaVersion, 1);
    assert.equal(mockStore.settings.enabled, true);

    // 2. getSettings and setSettings
    const initialSettings = await storage.getSettings();
    assert.equal(initialSettings.enabled, true);

    await storage.setSettings({ defaultStyle: { type: 'solid', color: '#112233' } });
    const updatedSettings = await storage.getSettings();
    assert.equal(updatedSettings.defaultStyle.type, 'solid');
    assert.equal(updatedSettings.defaultStyle.color, '#112233');

    // 3. savePreset and getPreset
    const chId = 'UCtest123456789012345678';
    const newPreset = storage.createDefaultPreset(chId, 'Preset Test');
    await storage.savePreset(newPreset);

    const loaded = await storage.getPreset(chId);
    assert.ok(loaded);
    assert.equal(loaded.channelId, chId);
    assert.equal(loaded.channelName, 'Preset Test');

    // 4. updatePreset
    await storage.updatePreset(chId, (p) => {
      p.enabled = false;
      return p;
    });
    const toggled = await storage.getPreset(chId);
    assert.ok(toggled);
    assert.equal(toggled.enabled, false);

    // 5. listPresets
    const secondChId = 'UCsecond1234567890123456';
    const secondPreset = storage.createDefaultPreset(secondChId, 'Second Preset');
    await storage.savePreset(secondPreset);

    const list = await storage.listPresets();
    assert.equal(list.length, 2);
    assert.ok(list.some((p) => p.channelId === chId));
    assert.ok(list.some((p) => p.channelId === secondChId));

    // 6. deletePreset
    await storage.deletePreset(chId);
    const afterDelete = await storage.getPreset(chId);
    assert.equal(afterDelete, null);
    const listAfterDelete = await storage.listPresets();
    assert.equal(listAfterDelete.length, 1);
  } finally {
    delete g.browser;
  }
});

test('storage.normalizePreset - preserves v0.1.1 fixture presets without regression', () => {
  const channelKeys = [
    'ch:UC_channel_alpha_001',
    'ch:UC_channel_beta_002',
    'ch:UC_channel_gamma_003',
  ] as const;

  for (const key of channelKeys) {
    const raw = fixture[key];
    assert.ok(raw);
    const normalized = storage.normalizePreset(raw);
    assert.ok(normalized);
    assert.equal(normalized.channelId, raw.channelId);
    assert.equal(normalized.channelName, raw.channelName);
    assert.equal(normalized.enabled, raw.enabled);
    assert.equal(normalized.activeProfileId, raw.activeProfileId);
    assert.deepEqual(
      normalized.profiles[0]!.masks[0]!.rect,
      raw.profiles[0]!.masks[0]!.rect
    );
    assert.deepEqual(
      normalized.profiles[0]!.masks[0]!.style,
      raw.profiles[0]!.masks[0]!.style
    );
  }
});
