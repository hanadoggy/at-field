/** 비디오 렌더 박스 기준 0~1 비율 좌표 */
export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export type MaskStyleType = 'blur' | 'solid'; // Phase 2: | 'image'

export interface MaskStyle {
  type: MaskStyleType;
  color: string; // /^#[0-9a-fA-F]{3,8}$/
  opacity: number; // 0~1
  blur: number; // 0~100 px
  imageId?: string | null; // Phase 2 예약. DEFAULT_SETTINGS에는 없어서 optional
}

export interface Mask {
  id: string;
  rect: Rect;
  style: MaskStyle;
}

export interface Profile {
  id: string;
  name: string;
  masks: Mask[];
}

export interface ChannelPreset {
  channelId: string;
  channelName: string;
  enabled: boolean;
  createdAt: number;
  updatedAt: number;
  activeProfileId: string;
  profiles: Profile[];
}

export interface Settings {
  enabled: boolean;
  defaultStyle: MaskStyle;
}

export interface Meta {
  schemaVersion: number;
  initializedAt: number;
}

export type ChannelKey = `ch:${string}`;

/** storage.local 전체 형태 */
export interface StorageSchema {
  meta?: Meta;
  settings?: Settings;
  [key: ChannelKey]: ChannelPreset | undefined;
}

/** normalizePreset 입력. 레거시 평면 구조까지 포함 (신뢰 불가 데이터) */
export interface RawPresetInput extends Partial<Omit<ChannelPreset, 'profiles'>> {
  profiles?: Array<Partial<Profile> & { masks?: Array<Partial<Mask>> }>;
  rect?: Partial<Rect>; // legacy v0
  style?: Partial<MaskStyle>; // legacy v0
  masks?: Array<{ rect?: Partial<Rect>; style?: Partial<MaskStyle> }>; // legacy
}

export type ImportConflictStrategy = 'merge' | 'overwrite';

export interface BackupPayload {
  format: 'atfield-backup';
  schemaVersion: number;
  exportedAt: number;
  data: {
    settings: Settings;
    presets: ChannelPreset[];
  };
}

export interface ImportOptions {
  strategy?: ImportConflictStrategy;
  includeSettings?: boolean;
}

export interface ImportResult {
  importedCount: number;
  skippedCount: number;
  settingsUpdated: boolean;
}
