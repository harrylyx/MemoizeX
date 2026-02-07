import { Interceptor } from '@/core/extensions';
import { db } from '@/core/database';
import { TimelineInstructions, Tweet } from '@/types';
import { extractDataFromResponse, extractTimelineTweet } from '@/utils/api';
import { webhookManager } from '@/core/webhook';
import logger from '@/utils/logger';

interface BookmarksResponse {
  data: {
    bookmark_timeline_v2: {
      timeline: {
        instructions: TimelineInstructions;
        responseObjects: unknown;
      };
    };
  };
}

interface CreateBookmarkResponse {
  data: {
    tweet_bookmark_put: string;
  };
}

// https://twitter.com/i/api/graphql/j5KExFXtSWj8HjRui17ydA/Bookmarks
export const BookmarksInterceptor: Interceptor = async (req, res, ext) => {
  // Handle CreateBookmark action (when user clicks bookmark button)
  if (/\/graphql\/.+\/CreateBookmark/.test(req.url)) {
    logger.info(`[BookmarksInterceptor] CreateBookmark API detected`);

    try {
      const json = JSON.parse(res.responseText) as CreateBookmarkResponse;

      if (json.data?.tweet_bookmark_put === 'Done' && req.body) {
        const requestBody = JSON.parse(req.body);
        const tweetId = requestBody.variables?.tweet_id;

        if (tweetId) {
          // Try to get full tweet data from database
          const fullTweet = await db.getTweetById(tweetId);

          if (fullTweet) {
            logger.info(`[BookmarksInterceptor] Found full tweet data for ${tweetId}`);
            await webhookManager.triggerWebhooks('bookmark', fullTweet);
          } else {
            // Fallback to minimal tweet if not in database
            logger.info(`[BookmarksInterceptor] Tweet ${tweetId} not in database, using minimal data`);
            const minimalTweet = { rest_id: tweetId } as Tweet;
            await webhookManager.triggerWebhooks('bookmark', minimalTweet);
          }

          logger.info(`[BookmarksInterceptor] Webhook triggered for bookmark on tweet ${tweetId}`);
        }
      }
    } catch (err) {
      logger.error('[BookmarksInterceptor] Failed to process CreateBookmark', err);
    }
    return;
  }

  // Handle Bookmarks list (viewing user's bookmarks page)
  if (!/\/graphql\/.+\/Bookmarks/.test(req.url)) {
    return;
  }

  try {
    const newData = extractDataFromResponse<BookmarksResponse, Tweet>(
      res,
      (json) => json.data.bookmark_timeline_v2.timeline.instructions,
      (entry) => extractTimelineTweet(entry.content.itemContent),
    );

    // Add captured data to the database.
    await db.extAddTweets(ext.name, newData);

    logger.info(`Bookmarks: ${newData.length} items received`);
  } catch (err) {
    logger.debug(req.method, req.url, res.status, res.responseText);
    logger.errorWithBanner('Bookmarks: Failed to parse API response', err as Error);
  }
};
