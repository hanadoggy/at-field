export interface ChannelInfo {
  channelId: string;
  channelName: string;
}

export type ChannelSource =
  | 'navigate-event'
  | 'player-object'
  | 'dom-link'
  | 'meta-verified';

export interface ChannelResolution extends ChannelInfo {
  source: ChannelSource;
}

export type ExclusionReason = 'shorts' | 'non-watch' | 'ad' | 'miniplayer' | null;
