import type { ChannelInfo, ExclusionReason } from './channel';
import type { ChannelPreset } from './schema';

export const MESSAGE_TYPES = {
  GET_STATE: 'ATF_GET_STATE',
  SET_EDIT_MODE: 'ATF_SET_EDIT_MODE',
  CREATE_PRESET: 'ATF_CREATE_PRESET',
} as const;

export type AtfRequest =
  | { type: typeof MESSAGE_TYPES.GET_STATE }
  | { type: typeof MESSAGE_TYPES.SET_EDIT_MODE; on: boolean }
  | { type: typeof MESSAGE_TYPES.CREATE_PRESET };

export interface TabState {
  isWatch: boolean;
  exclusionReason: ExclusionReason;
  channel: ChannelInfo | null;
  hasPreset: boolean;
  preset: ChannelPreset | null;
  editMode: boolean;
  globalEnabled: boolean;
}

export interface AtfResponseMap {
  ATF_GET_STATE: TabState;
  ATF_SET_EDIT_MODE: { editMode: boolean };
  ATF_CREATE_PRESET:
    | { success: true; preset: ChannelPreset | null; editMode: boolean }
    | { success: false; error: string };
}
