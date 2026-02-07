import { BrowsingHistory } from '@/types/browsing';

/**
 * Default deduplication window in milliseconds (5 minutes).
 */
export const DEFAULT_DEDUP_WINDOW_MS = 5 * 60 * 1000;

/**
 * Maximum number of browsing history records to keep.
 */
export const MAX_BROWSING_HISTORY_COUNT = 10000;

/**
 * Deduplicates browsing history records within a time window.
 * If the same tweet was viewed within the window, only keep the latest record.
 *
 * @param histories - Array of browsing history records
 * @param windowMs - Time window in milliseconds (default: 5 minutes)
 * @returns Deduplicated array of browsing history records
 */
export function deduplicateRecentHistories(
  histories: BrowsingHistory[],
  windowMs: number = DEFAULT_DEDUP_WINDOW_MS,
): BrowsingHistory[] {
  const now = Date.now();
  const seen = new Map<string, BrowsingHistory>();

  for (const history of histories) {
    const existing = seen.get(history.tweet_id);

    // If we haven't seen this tweet, or the existing record is older
    if (!existing || existing.viewed_at < history.viewed_at) {
      // Only add if within the dedup window or if it's the first occurrence
      if (!existing || now - existing.viewed_at > windowMs) {
        seen.set(history.tweet_id, history);
      }
    }
  }

  return Array.from(seen.values());
}

/**
 * Filters out tweet IDs that were recently recorded in existing histories.
 *
 * @param newTweetIds - Array of new tweet IDs to check
 * @param existingHistories - Existing browsing history records
 * @param windowMs - Time window in milliseconds (default: 5 minutes)
 * @returns Array of tweet IDs that are not duplicates
 */
export function filterRecentlyViewed(
  newTweetIds: string[],
  existingHistories: BrowsingHistory[],
  windowMs: number = DEFAULT_DEDUP_WINDOW_MS,
): string[] {
  const now = Date.now();
  const recentlyViewed = new Set<string>();

  // Build a set of recently viewed tweet IDs
  for (const history of existingHistories) {
    if (now - history.viewed_at < windowMs) {
      recentlyViewed.add(history.tweet_id);
    }
  }

  // Filter out duplicates
  return newTweetIds.filter((id) => !recentlyViewed.has(id));
}

/**
 * Generates a unique browsing history ID.
 *
 * @param tweetId - Tweet ID
 * @param timestamp - View timestamp
 * @returns Unique browsing history ID
 */
export function generateBrowsingHistoryId(tweetId: string, timestamp: number): string {
  return `browsing-${tweetId}-${timestamp}`;
}
