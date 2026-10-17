import { getStorageArea } from './browser-api';
import {
  CHANNEL_KEY_PREFIX,
  DEFAULT_MASK_RECT,
  DEFAULT_OPACITY_BLUR,
  DEFAULT_OPACITY_SOLID,
  DEFAULT_SETTINGS,
  META_KEY,
  MIN_MASK_SIZE,
  SCHEMA_VERSION,
  SETTINGS_KEY,
} from './constants';
import type {
  ChannelKey,
  ChannelPreset,
  MaskStyle,
  Profile,
  RawPresetInput,
  Rect,
  Settings,
} from '../types/schema';

export function generateId(prefix = 'id'): string {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;
}

function clamp(val: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, val));
}

function toFiniteNumber(val: unknown, fallback: number): number {
  if (typeof val === 'number' && Number.isFinite(val)) return val;
  if (typeof val === 'string' && val.trim() !== '') {
    const parsed = Number(val);
    if (Number.isFinite(parsed)) return parsed;
  }
  return fallback;
}

export function normalizeRect(rect: unknown): Rect {
  if (!rect || typeof rect !== 'object') return { ...DEFAULT_MASK_RECT };
  const r = rect as Partial<Rect>;
  const rawW = toFiniteNumber(r.w, DEFAULT_MASK_RECT.w);
  const rawH = toFiniteNumber(r.h, DEFAULT_MASK_RECT.h);
  const w = clamp(rawW > 0 ? rawW : DEFAULT_MASK_RECT.w, MIN_MASK_SIZE, 1);
  const h = clamp(rawH > 0 ? rawH : DEFAULT_MASK_RECT.h, MIN_MASK_SIZE, 1);
  const x = clamp(toFiniteNumber(r.x, DEFAULT_MASK_RECT.x), 0, 1 - w);
  const y = clamp(toFiniteNumber(r.y, DEFAULT_MASK_RECT.y), 0, 1 - h);
  return { x, y, w, h };
}

export function normalizeStyle(
  style: unknown,
  fallbackStyle?: MaskStyle
): MaskStyle {
  const base: MaskStyle = fallbackStyle || { ...DEFAULT_SETTINGS.defaultStyle };
  const s =
    style && typeof style === 'object' ? (style as Partial<MaskStyle>) : null;
  const type =
    s && s.type === 'solid'
      ? 'solid'
      : !s && base.type === 'solid'
        ? 'solid'
        : 'blur';
  const defaultOpacity =
    type === 'solid' ? DEFAULT_OPACITY_SOLID : DEFAULT_OPACITY_BLUR;

  if (!s) {
    return {
      ...base,
      type,
      opacity: typeof base.opacity === 'number' ? base.opacity : defaultOpacity,
      imageId: null,
    };
  }

  return {
    type,
    color:
      typeof s.color === 'string' && /^#[0-9a-fA-F]{3,8}$/.test(s.color)
        ? s.color
        : base.color,
    opacity:
      typeof s.opacity === 'number' ? clamp(s.opacity, 0, 1) : defaultOpacity,
    blur: typeof s.blur === 'number' ? clamp(s.blur, 0, 100) : base.blur,
    imageId: s.imageId || null,
  };
}

export function normalizePreset(
  raw: unknown,
  fallbackStyle?: MaskStyle
): ChannelPreset | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as RawPresetInput;
  if (!r.channelId) return null;

  const channelId = String(r.channelId);
  const channelName = String(r.channelName || r.channelId);
  const enabled = r.enabled !== false;
  const createdAt = Number(r.createdAt) || Date.now();
  const updatedAt = Number(r.updatedAt) || Date.now();

  const rawProfiles = Array.isArray(r.profiles) ? r.profiles : null;
  let profiles: Profile[];
  let activeProfileId = r.activeProfileId || 'p_default';

  if (!rawProfiles || rawProfiles.length === 0) {
    // Backwards-compatibility or flat preset upgrade
    const firstLegacyMask = r.masks && r.masks[0];
    const singleRect = normalizeRect(
      r.rect || (firstLegacyMask && firstLegacyMask.rect)
    );
    const singleStyle = normalizeStyle(
      r.style || (firstLegacyMask && firstLegacyMask.style),
      fallbackStyle
    );
    const defaultMaskId = generateId('m');
    const defaultProfileId = 'p_default';

    profiles = [
      {
        id: defaultProfileId,
        name: 'Default',
        masks: [
          {
            id: defaultMaskId,
            rect: singleRect,
            style: singleStyle,
          },
        ],
      },
    ];
    activeProfileId = defaultProfileId;
  } else {
    profiles = rawProfiles.map((p, pIdx) => {
      const pId = p.id || `p_${pIdx}`;
      const pName = p.name || `Profile ${pIdx + 1}`;
      const masks =
        Array.isArray(p.masks) && p.masks.length > 0
          ? p.masks.map((m) => ({
              id: m.id || generateId('m'),
              rect: normalizeRect(m.rect),
              style: normalizeStyle(m.style, fallbackStyle),
            }))
          : [
              {
                id: generateId('m'),
                rect: { ...DEFAULT_MASK_RECT },
                style: normalizeStyle(null, fallbackStyle),
              },
            ];
      return { id: pId, name: pName, masks };
    });
    if (!profiles.some((p) => p.id === activeProfileId)) {
      const firstProfile = profiles[0];
      activeProfileId = firstProfile ? firstProfile.id : 'p_default';
    }
  }

  return {
    channelId,
    channelName,
    enabled,
    createdAt,
    updatedAt,
    activeProfileId,
    profiles,
  };
}

function getChannelKey(channelId: string): ChannelKey {
  return `${CHANNEL_KEY_PREFIX}${channelId}`;
}

function cloneDefaultSettings(): Settings {
  return {
    enabled: DEFAULT_SETTINGS.enabled,
    defaultStyle: { ...DEFAULT_SETTINGS.defaultStyle },
  };
}

export function normalizeSettings(raw: unknown): Settings {
  if (!raw || typeof raw !== 'object') return cloneDefaultSettings();
  const stored = raw as Partial<Settings>;
  return {
    enabled: stored.enabled !== false,
    defaultStyle: normalizeStyle(stored.defaultStyle),
  };
}

export async function getSettings(): Promise<Settings> {
  const storage = getStorageArea();
  if (!storage) return cloneDefaultSettings();
  try {
    const data = await storage.get(SETTINGS_KEY);
    return normalizeSettings(data && data[SETTINGS_KEY]);
  } catch (err) {
    console.error('[ATF] Failed to get settings:', err);
    return cloneDefaultSettings();
  }
}

export interface SettingsUpdate {
  enabled?: boolean;
  defaultStyle?: Partial<MaskStyle>;
}

export async function setSettings(
  updates: SettingsUpdate
): Promise<Settings | undefined> {
  const storage = getStorageArea();
  if (!storage) return undefined;
  const current = await getSettings();
  const next: Settings = {
    ...current,
    ...(updates.enabled !== undefined ? { enabled: updates.enabled } : {}),
    defaultStyle: updates.defaultStyle
      ? normalizeStyle(updates.defaultStyle, current.defaultStyle)
      : current.defaultStyle,
  };
  await storage.set({ [SETTINGS_KEY]: next });
  return next;
}

export async function getPreset(
  channelId: string
): Promise<ChannelPreset | null> {
  if (!channelId) return null;
  const storage = getStorageArea();
  if (!storage) return null;
  try {
    const key = getChannelKey(channelId);
    const data = await storage.get(key);
    const raw = data && data[key];
    if (!raw) return null;
    const settings = await getSettings();
    return normalizePreset(raw, settings.defaultStyle);
  } catch (err) {
    console.error('[ATF] Failed to get preset for', channelId, err);
    return null;
  }
}

export async function savePreset(
  preset: RawPresetInput
): Promise<ChannelPreset | null> {
  if (!preset || !preset.channelId) throw new Error('Invalid preset');
  const storage = getStorageArea();
  if (!storage) return null;
  const settings = await getSettings();
  const normalized = normalizePreset(
    {
      ...preset,
      updatedAt: Date.now(),
    },
    settings.defaultStyle
  );
  if (!normalized) throw new Error('Invalid preset');
  const key = getChannelKey(normalized.channelId);
  await storage.set({ [key]: normalized });
  return normalized;
}

export async function updatePreset(
  channelId: string,
  mutatorFn: (
    preset: ChannelPreset
  ) => ChannelPreset | void | Promise<ChannelPreset | void>
): Promise<ChannelPreset | null> {
  if (!channelId || typeof mutatorFn !== 'function') return null;
  const current = await getPreset(channelId);
  if (!current) return null;
  const mutated = (await mutatorFn(current)) || current;
  return await savePreset(mutated);
}

export async function deletePreset(channelId: string): Promise<void> {
  if (!channelId) return;
  const storage = getStorageArea();
  if (!storage) return;
  const key = getChannelKey(channelId);
  await storage.remove(key);
}

export async function listPresets(): Promise<ChannelPreset[]> {
  const storage = getStorageArea();
  if (!storage) return [];
  try {
    const all = await storage.get(null);
    const settings = await getSettings();
    const list: ChannelPreset[] = [];
    for (const [key, val] of Object.entries(all || {})) {
      if (key.startsWith(CHANNEL_KEY_PREFIX)) {
        const normalized = normalizePreset(val, settings.defaultStyle);
        if (normalized) list.push(normalized);
      }
    }
    list.sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
    return list;
  } catch (err) {
    console.error('[ATF] Failed to list presets:', err);
    return [];
  }
}

export function createDefaultPreset(
  channelId: string,
  channelName?: string,
  defaultStyle?: Partial<MaskStyle>
): ChannelPreset {
  const now = Date.now();
  const pId = 'p_default';
  const mId = generateId('m');
  return {
    channelId,
    channelName: channelName || channelId,
    enabled: true,
    createdAt: now,
    updatedAt: now,
    activeProfileId: pId,
    profiles: [
      {
        id: pId,
        name: 'Default',
        masks: [
          {
            id: mId,
            rect: { ...DEFAULT_MASK_RECT },
            style: normalizeStyle(defaultStyle),
          },
        ],
      },
    ],
  };
}

export async function migrate(): Promise<void> {
  const storage = getStorageArea();
  if (!storage) return;
  try {
    const data = await storage.get([META_KEY, SETTINGS_KEY]);
    const meta = data && (data[META_KEY] as { schemaVersion?: number } | undefined);
    if (!meta || meta.schemaVersion !== SCHEMA_VERSION) {
      await storage.set({
        [META_KEY]: {
          schemaVersion: SCHEMA_VERSION,
          initializedAt: Date.now(),
        },
      });
    }
    if (!data || !data[SETTINGS_KEY]) {
      await storage.set({ [SETTINGS_KEY]: cloneDefaultSettings() });
    }
  } catch (err) {
    console.error('[ATF] Migration failed:', err);
  }
}
