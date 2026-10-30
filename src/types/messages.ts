import type { ChannelInfo, ExclusionReason } from './channel';
import type { ChannelPreset } from './schema';

export const MESSAGE_TYPES = {
  GET_STATE: 'ATF_GET_STATE',
  SET_EDIT_MODE: 'ATF_SET_EDIT_MODE',
  TOGGLE_EDIT_MODE: 'ATF_TOGGLE_EDIT_MODE',
  CREATE_PRESET: 'ATF_CREATE_PRESET',
  SELECT_MASK: 'ATF_SELECT_MASK',
} as const;

export type AtfRequest =
  | { type: typeof MESSAGE_TYPES.GET_STATE }
  | { type: typeof MESSAGE_TYPES.SET_EDIT_MODE; on: boolean; maskId?: string }
  | { type: typeof MESSAGE_TYPES.TOGGLE_EDIT_MODE }
  | { type: typeof MESSAGE_TYPES.CREATE_PRESET }
  | { type: typeof MESSAGE_TYPES.SELECT_MASK; maskId: string };

export interface TabState {
  isWatch: boolean;
  exclusionReason: ExclusionReason;
  channel: ChannelInfo | null;
  hasPreset: boolean;
  preset: ChannelPreset | null;
  selectedMaskId: string | null;
  editMode: boolean;
  globalEnabled: boolean;
}

export interface AtfResponseMap {
  ATF_GET_STATE: TabState;
  ATF_SET_EDIT_MODE: { editMode: boolean; selectedMaskId?: string | null };
  ATF_TOGGLE_EDIT_MODE: { editMode: boolean; createdPreset?: boolean };
  ATF_CREATE_PRESET:
    | { success: true; preset: ChannelPreset | null; editMode: boolean }
    | { success: false; error: string };
  ATF_SELECT_MASK: { selectedMaskId: string | null };
}
