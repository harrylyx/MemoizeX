import { Interceptor } from '@/core/extensions';
import { db } from '@/core/database';
import { TimelineInstructions, Tweet } from '@/types';
import { extractDataFromResponse, extractTimelineTweet } from '@/utils/api';
import { webhookManager } from '@/core/webhook';
import logger from '@/utils/logger';

interface LikesResponse {
  data: {
    user: {
      result: {
        timeline: {
          timeline: {
            instructions: TimelineInstructions;
            responseObjects: unknown;
          };
        };
        __typename: 'User';
      };
    };
  };
}

interface FavoriteTweetResponse {
  data: {
    favorite_tweet: string;
  };
}

// https://twitter.com/i/api/graphql/lVf2NuhLoYVrpN4nO7uw0Q/Likes
export const LikesInterceptor: Interceptor = async (req, res, ext) => {
  // Handle FavoriteTweet action (when user clicks like button)
  if (/\/graphql\/.+\/FavoriteTweet/.test(req.url)) {
    logger.info(`[LikesInterceptor] FavoriteTweet API detected`);

    try {
      const json = JSON.parse(res.responseText) as FavoriteTweetResponse;

      if (json.data?.favorite_tweet === 'Done' && req.body) {
        const requestBody = JSON.parse(req.body);
        const tweetId = requestBody.variables?.tweet_id;

        if (tweetId) {
          // Try to get full tweet data from database
          const fullTweet = await db.getTweetById(tweetId);

          if (fullTweet) {
            logger.info(`[LikesInterceptor] Found full tweet data for ${tweetId}`);
            await webhookManager.triggerWebhooks('like', fullTweet);
          } else {
            // Fallback to minimal tweet if not in database
            logger.info(`[LikesInterceptor] Tweet ${tweetId} not in database, using minimal data`);
            const minimalTweet = { rest_id: tweetId } as Tweet;
            await webhookManager.triggerWebhooks('like', minimalTweet);
          }

          logger.info(`[LikesInterceptor] Webhook triggered for like on tweet ${tweetId}`);
        }
      }
    } catch (err) {
      logger.error('[LikesInterceptor] Failed to process FavoriteTweet', err);
    }
    return;
  }

  // Handle Likes list (viewing user's likes page)
  if (!/\/graphql\/.+\/Likes/.test(req.url)) {
    return;
  }

  try {
    const newData = extractDataFromResponse<LikesResponse, Tweet>(
      res,
      (json) => json.data.user.result.timeline.timeline.instructions,
      (entry) => extractTimelineTweet(entry.content.itemContent),
    );

    // Add captured data to the database.
    await db.extAddTweets(ext.name, newData);

    logger.info(`Likes: ${newData.length} items received`);
  } catch (err) {
    logger.debug(req.method, req.url, res.status, res.responseText);
    logger.errorWithBanner('Likes: Failed to parse API response', err as Error);
  }
};
