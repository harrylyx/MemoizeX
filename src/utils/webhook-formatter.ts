import { Tweet, TweetUnion } from '@/types';
import {
  WebhookEventType,
  WebhookPayload,
  WebhookTweetData,
  WebhookMediaItem,
  WebhookRetweetedTweet,
  WebhookQuotedTweet,
  WebhookUrlItem,
  WebhookArticle,
} from '@/types/webhook';
import { extractTweetMedia, getMediaOriginalUrl, formatTwitterImage } from '@/utils/api';

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
 * Extracts the actual Tweet from a TweetUnion (handles TweetWithVisibilityResults).
 */
function extractTweetFromUnion(tweetUnion: TweetUnion | undefined): Tweet | undefined {
  if (!tweetUnion) return undefined;
  if (tweetUnion.__typename === 'Tweet') return tweetUnion;
  if (tweetUnion.__typename === 'TweetWithVisibilityResults') return tweetUnion.tweet;
  return undefined;
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

  if (isMinimalTweet) {
    return {
      id: tweet.rest_id,
      text: '',
      author: { id: '', screen_name: 'unknown', name: '' },
      url: `https://x.com/i/status/${tweet.rest_id}`,
      created_at: '',
      stats: { likes: 0, retweets: 0, replies: 0, quotes: 0, bookmarks: 0 },
      media: [],
    };
  }

  // Get full text (prefer note_tweet for long tweets/articles)
  const fullText = tweet.note_tweet?.note_tweet_results?.result?.text || legacy?.full_text || '';

  // Build the result
  const result: WebhookTweetData = {
    id: tweet.rest_id,
    text: fullText,
    author: {
      id: author?.rest_id || '',
      screen_name: screenName,
      name: author?.core?.name || '',
    },
    url: `https://x.com/${screenName}/status/${tweet.rest_id}`,
    created_at: legacy?.created_at || '',
    stats: {
      likes: legacy?.favorite_count || 0,
      retweets: legacy?.retweet_count || 0,
      replies: legacy?.reply_count || 0,
      quotes: legacy?.quote_count || 0,
      bookmarks: legacy?.bookmark_count || 0,
    },
    media: formatMediaItems(tweet),
  };

  // Add retweeted tweet if present
  const retweetedTweet = extractTweetFromUnion(legacy?.retweeted_status_result?.result);
  if (retweetedTweet) {
    result.retweeted_tweet = formatRetweetedTweet(retweetedTweet);
  }

  // Add quoted tweet if present
  const quotedTweet = extractTweetFromUnion(tweet.quoted_status_result?.result);
  if (quotedTweet) {
    result.quoted_tweet = formatQuotedTweet(quotedTweet);
  }

  // Add URLs if present
  const urls = legacy?.entities?.urls;
  if (urls && urls.length > 0) {
    result.urls = formatUrls(urls);
  }

  // Add article if present
  const article = tweet.article?.article_results?.result;
  if (article) {
    result.article = formatArticle(article, urls);
  }

  return result;
}

/**
 * Formats a retweeted tweet.
 */
function formatRetweetedTweet(tweet: Tweet): WebhookRetweetedTweet {
  const author = tweet.core?.user_results?.result;
  const legacy = tweet.legacy;
  const screenName = author?.core?.screen_name || 'unknown';
  const fullText = tweet.note_tweet?.note_tweet_results?.result?.text || legacy?.full_text || '';

  return {
    id: tweet.rest_id,
    text: fullText,
    author: {
      id: author?.rest_id || '',
      screen_name: screenName,
      name: author?.core?.name || '',
    },
    url: `https://x.com/${screenName}/status/${tweet.rest_id}`,
    created_at: legacy?.created_at || '',
    media: formatMediaItems(tweet),
  };
}

/**
 * Formats a quoted tweet.
 */
function formatQuotedTweet(tweet: Tweet): WebhookQuotedTweet {
  const author = tweet.core?.user_results?.result;
  const legacy = tweet.legacy;
  const screenName = author?.core?.screen_name || 'unknown';
  const fullText = tweet.note_tweet?.note_tweet_results?.result?.text || legacy?.full_text || '';

  const result: WebhookQuotedTweet = {
    id: tweet.rest_id,
    text: fullText,
    author: {
      id: author?.rest_id || '',
      screen_name: screenName,
      name: author?.core?.name || '',
    },
    url: `https://x.com/${screenName}/status/${tweet.rest_id}`,
    created_at: legacy?.created_at || '',
  };

  // Add article if the quoted tweet contains one
  const article = tweet.article?.article_results?.result;
  if (article) {
    result.article = formatArticle(article, legacy?.entities?.urls);
  }

  return result;
}

/**
 * Formats URL entities from a tweet.
 */
function formatUrls(urls: Array<{ url: string; expanded_url: string; display_url: string }>): WebhookUrlItem[] {
  return urls
    .filter((u) => !u.expanded_url.includes('twitter.com/') && !u.expanded_url.includes('x.com/'))
    .map((u) => ({
      url: u.url,
      expanded_url: u.expanded_url,
      display_url: u.display_url,
    }));
}

/**
 * Formats article data from a tweet.
 */
function formatArticle(
  article: {
    rest_id: string;
    title: string;
    preview_text: string;
    cover_media?: {
      media_info?: {
        original_img_url?: string;
      };
    };
  },
  urls?: Array<{ url: string; expanded_url: string; display_url: string }>,
): WebhookArticle {
  // Find the article URL from the tweet's URLs
  const articleUrl = urls?.find((u) => u.expanded_url.includes('/article/'))?.expanded_url
    || `https://x.com/i/article/${article.rest_id}`;

  return {
    id: article.rest_id,
    title: article.title,
    preview_text: article.preview_text,
    url: articleUrl,
    cover_image_url: article.cover_media?.media_info?.original_img_url,
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
    thumbnail: formatTwitterImage(item.media_url_https, 'thumb'),
    original: getMediaOriginalUrl(item),
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
