import { Interceptor } from '@/core/extensions';
import { db } from '@/core/database';
import { TimelineInstructions, Tweet } from '@/types';
import { extractDataFromResponse, extractTimelineTweet } from '@/utils/api';
import { webhookManager } from '@/core/webhook';
import { options } from '@/core/options';
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

// https://twitter.com/i/api/graphql/j5KExFXtSWj8HjRui17ydA/Bookmarks
export const BookmarksInterceptor: Interceptor = async (req, res, ext) => {
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

    // Trigger webhooks for bookmarks if enabled
    if (options.get('enableBookmarkWebhooks') && newData.length > 0) {
      await webhookManager.triggerWebhooksBatch('bookmark', newData);
    }

    logger.info(`Bookmarks: ${newData.length} items received`);
  } catch (err) {
    logger.debug(req.method, req.url, res.status, res.responseText);
    logger.errorWithBanner('Bookmarks: Failed to parse API response', err as Error);
  }
};
