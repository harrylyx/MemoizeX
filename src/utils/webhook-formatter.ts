import { Tweet } from '@/types';
import { WebhookEventType, WebhookPayload, WebhookTweetData, WebhookMediaItem } from '@/types/webhook';
import { extractTweetMedia } from '@/utils/api';

/**
 * Formats a tweet into a webhook payload.
 *
 * @param tweet - Tweet data (can be minimal with just rest_id)
 * @param eventType - Type of event that triggered the webhook
 * @returns Formatted webhook payload
 */
export function formatWebhookPayload(tweet: Tweet, eventType: WebhookEventType): WebhookPayload {
  return {
    event: eventType,
    timestamp: Date.now(),
    data: formatTweetData(tweet),
  };
}

/**
 * Formats tweet data for webhook payload.
 * Handles both full tweet objects and minimal objects with just rest_id.
 *
 * @param tweet - Tweet data
 * @returns Formatted tweet data
 */
export function formatTweetData(tweet: Tweet): WebhookTweetData {
  const author = tweet.core?.user_results?.result;
  const legacy = tweet.legacy;
  const screenName = author?.core?.screen_name || 'unknown';

  // For minimal tweet objects (only rest_id), return minimal data
  const isMinimalTweet = !legacy && !author;

  return {
    id: tweet.rest_id,
    text: legacy?.full_text || '',
    author: isMinimalTweet ? {
      id: '',
      screen_name: 'unknown',
      name: '',
    } : {
      id: author?.rest_id || '',
      screen_name: screenName,
      name: author?.core?.name || '',
    },
    url: `https://x.com/i/status/${tweet.rest_id}`,
    created_at: legacy?.created_at || '',
    stats: {
      likes: legacy?.favorite_count || 0,
      retweets: legacy?.retweet_count || 0,
      replies: legacy?.reply_count || 0,
      quotes: legacy?.quote_count || 0,
      bookmarks: legacy?.bookmark_count || 0,
    },
    media: isMinimalTweet ? [] : formatMediaItems(tweet),
  };
}

/**
 * Formats media items from a tweet.
 *
 * @param tweet - Tweet data
 * @returns Array of formatted media items
 */
function formatMediaItems(tweet: Tweet): WebhookMediaItem[] {
  const mediaItems = extractTweetMedia(tweet);

  return mediaItems.map((item) => ({
    type: item.type as 'photo' | 'video' | 'animated_gif',
    url: item.url,
  }));
}

/**
 * Generates a unique webhook log ID.
 *
 * @param eventType - Event type
 * @param tweetId - Tweet ID
 * @param timestamp - Timestamp
 * @returns Unique webhook log ID
 */
export function generateWebhookLogId(
  eventType: WebhookEventType,
  tweetId: string,
  timestamp: number,
): string {
  return `webhook-${eventType}-${tweetId}-${timestamp}`;
}

/**
 * Generates a unique webhook config ID.
 *
 * @returns Unique webhook config ID
 */
export function generateWebhookConfigId(): string {
  return `webhook-config-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}
