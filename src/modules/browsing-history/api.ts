import { Interceptor } from '@/core/extensions';
import { db } from '@/core/database';
import { TimelineInstructions, Tweet } from '@/types';
import { BrowsingHistory, BrowsingSourcePage } from '@/types/browsing';
import { extractDataFromResponse, extractTimelineTweet } from '@/utils/api';
import { generateBrowsingHistoryId, DEFAULT_DEDUP_WINDOW_MS } from '@/utils/deduplication';
import { webhookManager } from '@/core/webhook';
import logger from '@/utils/logger';

/**
 * Endpoints that display tweets and should be tracked for browsing history.
 */
const TWEET_DISPLAY_ENDPOINTS = [
  /\/graphql\/.+\/HomeLatestTimeline/,
  /\/graphql\/.+\/HomeTimeline/,
  /\/graphql\/.+\/TweetDetail/,
  /\/graphql\/.+\/UserTweets/,
  /\/graphql\/.+\/UserMedia/,
  /\/graphql\/.+\/SearchTimeline/,
  /\/graphql\/.+\/Bookmarks/,
  /\/graphql\/.+\/Likes/,
  /\/graphql\/.+\/ListLatestTweetsTimeline/,
];

/**
 * Response types for different endpoints.
 */
interface HomeTimelineResponse {
  data: {
    home: {
      home_timeline_urt: {
        instructions: TimelineInstructions;
      };
    };
  };
}

interface UserTweetsResponse {
  data: {
    user: {
      result: {
        timeline: {
          timeline: {
            instructions: TimelineInstructions;
          };
        };
      };
    };
  };
}

interface TweetDetailResponse {
  data: {
    tweetResult: {
      result: Tweet;
    };
  };
}

interface SearchTimelineResponse {
  data: {
    search_by_raw_query: {
      search_timeline: {
        timeline: {
          instructions: TimelineInstructions;
        };
      };
    };
  };
}

interface BookmarksResponse {
  data: {
    bookmark_timeline_v2: {
      timeline: {
        instructions: TimelineInstructions;
      };
    };
  };
}

interface LikesResponse {
  data: {
    user: {
      result: {
        timeline: {
          timeline: {
            instructions: TimelineInstructions;
          };
        };
      };
    };
  };
}

interface ListTimelineResponse {
  data: {
    list: {
      tweets_timeline: {
        timeline: {
          instructions: TimelineInstructions;
        };
      };
    };
  };
}

/**
 * Detects the source page based on the request URL.
 */
function detectSourcePage(url: string): BrowsingSourcePage {
  if (/HomeLatestTimeline|HomeTimeline/.test(url)) return 'home';
  if (/UserTweets|UserMedia/.test(url)) return 'profile';
  if (/TweetDetail/.test(url)) return 'detail';
  if (/SearchTimeline/.test(url)) return 'search';
  if (/Bookmarks/.test(url)) return 'bookmarks';
  if (/Likes/.test(url)) return 'likes';
  if (/ListLatestTweetsTimeline/.test(url)) return 'list';
  return 'unknown';
}

/**
 * Extracts tweets from various API response formats.
 */
function extractTweetsFromResponse(res: XMLHttpRequest, url: string): Tweet[] {
  try {
    const json = JSON.parse(res.responseText);
    const sourcePage = detectSourcePage(url);

    // Handle TweetDetail specially - it returns a single tweet
    if (sourcePage === 'detail') {
      const response = json as TweetDetailResponse;
      const tweet = response?.data?.tweetResult?.result;
      if (tweet && tweet.rest_id) {
        return [tweet];
      }
      return [];
    }

    // Try different response formats
    let instructions: TimelineInstructions | undefined;

    if (sourcePage === 'home') {
      instructions = (json as HomeTimelineResponse)?.data?.home?.home_timeline_urt?.instructions;
    } else if (sourcePage === 'profile') {
      instructions = (json as UserTweetsResponse)?.data?.user?.result?.timeline?.timeline?.instructions;
    } else if (sourcePage === 'search') {
      instructions = (json as SearchTimelineResponse)?.data?.search_by_raw_query?.search_timeline?.timeline?.instructions;
    } else if (sourcePage === 'bookmarks') {
      instructions = (json as BookmarksResponse)?.data?.bookmark_timeline_v2?.timeline?.instructions;
    } else if (sourcePage === 'likes') {
      instructions = (json as LikesResponse)?.data?.user?.result?.timeline?.timeline?.instructions;
    } else if (sourcePage === 'list') {
      instructions = (json as ListTimelineResponse)?.data?.list?.tweets_timeline?.timeline?.instructions;
    }

    if (!instructions) {
      return [];
    }

    // Use the common extraction utility
    return extractDataFromResponse<{ data: unknown }, Tweet>(
      res,
      () => instructions!,
      (entry) => extractTimelineTweet(entry.content.itemContent),
    );
  } catch {
    return [];
  }
}

/**
 * Browsing history interceptor that tracks viewed tweets.
 */
export const BrowsingHistoryInterceptor: Interceptor = async (req, res, ext) => {
  // Check if this is a tweet display endpoint
  if (!TWEET_DISPLAY_ENDPOINTS.some((pattern) => pattern.test(req.url))) {
    return;
  }

  try {
    const tweets = extractTweetsFromResponse(res, req.url);

    if (tweets.length === 0) {
      return;
    }

    const sourcePage = detectSourcePage(req.url);
    const now = Date.now();
    const currentUrl = window.location.href;

    // Get recently viewed tweets to deduplicate
    const recentHistories = await db.getRecentBrowsingHistories(DEFAULT_DEDUP_WINDOW_MS);
    const recentTweetIds = new Set((recentHistories || []).map((h) => h.tweet_id));

    // Filter out recently viewed tweets
    const newTweets = tweets.filter((tweet) => !recentTweetIds.has(tweet.rest_id));

    if (newTweets.length === 0) {
      return;
    }

    // Create browsing history records
    const histories: BrowsingHistory[] = newTweets.map((tweet) => ({
      id: generateBrowsingHistoryId(tweet.rest_id, now),
      tweet_id: tweet.rest_id,
      viewed_at: now,
      source_page: sourcePage,
      url: currentUrl,
    }));

    // Save to database
    await db.addBrowsingHistories(histories);

    // Also save the tweets to the database for reference
    await db.extAddTweets(ext.name, newTweets);

    // Trigger view webhooks for enabled configs
    await webhookManager.triggerWebhooksBatch('view', newTweets);

    logger.info(`BrowsingHistory: ${newTweets.length} tweets recorded from ${sourcePage}`);
  } catch (err) {
    logger.debug(req.method, req.url, res.status);
    logger.errorWithBanner('BrowsingHistory: Failed to process response', err as Error);
  }
};
