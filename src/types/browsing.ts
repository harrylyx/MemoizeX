/**
 * Browsing history record for a viewed tweet.
 */
export interface BrowsingHistory {
  /** Unique identifier: `browsing-${tweet_id}-${timestamp}` */
  id: string;
  /** Tweet ID that was viewed */
  tweet_id: string;
  /** Timestamp when the tweet was viewed */
  viewed_at: number;
  /** Source page where the tweet was viewed */
  source_page: BrowsingSourcePage;
  /** Full URL where the tweet was viewed */
  url: string;
}

/**
 * Source page types for browsing history.
 */
export type BrowsingSourcePage =
  | 'home'
  | 'profile'
  | 'detail'
  | 'search'
  | 'bookmarks'
  | 'likes'
  | 'list'
  | 'unknown';

/**
 * Browsing history with associated tweet data.
 */
export interface BrowsingHistoryWithTweet extends BrowsingHistory {
  tweet?: {
    text: string;
    author_screen_name: string;
    author_name: string;
  };
}
