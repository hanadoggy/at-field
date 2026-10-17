export interface YtVideoDetails {
  videoId?: string;
  channelId?: string;
  author?: string;
}

export interface YtPlayerResponse {
  videoDetails?: YtVideoDetails;
}

export interface YtNavigateFinishDetail {
  response?: {
    playerResponse?: YtPlayerResponse;
  };
}

export interface YtPlayerElement extends HTMLElement {
  getPlayerResponse?: () => YtPlayerResponse;
}

declare global {
  interface WindowEventMap {
    'yt-navigate-start': Event;
    'yt-navigate-finish': CustomEvent<YtNavigateFinishDetail>;
  }
}
