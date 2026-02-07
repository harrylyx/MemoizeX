import { unsafeWindow } from '$';
import Dexie, { KeyPaths } from 'dexie';
import { exportDB, importInto } from 'dexie-export-import';

import packageJson from '@/../package.json';
import { Capture, Tweet, User } from '@/types';
import { BrowsingHistory } from '@/types/browsing';
import { WebhookConfig, WebhookLog } from '@/types/webhook';
import { extractTweetMedia } from '@/utils/api';
import { parseTwitterDateTime } from '@/utils/common';
import { MAX_BROWSING_HISTORY_COUNT } from '@/utils/deduplication';
import { migration_20250609 } from '@/utils/migration';
import logger from '@/utils/logger';
import { ExtensionType } from '../extensions';
import { options } from '../options';

const DB_NAME = packageJson.name;
const DB_VERSION = 3;

declare global {
  interface Window {
    __META_DATA__: {
      userId: string;
      userHash: string;
    };
  }
}

export class DatabaseManager {
  private db: Dexie;

  constructor() {
    const globalObject = unsafeWindow ?? window ?? globalThis;
    const userId = globalObject.__META_DATA__?.userId ?? 'unknown';
    const suffix = options.get('dedicatedDbForAccounts') ? `_${userId}` : '';
    logger.debug(`Using database: ${DB_NAME}${suffix} for userId: ${userId}`);

    this.db = new Dexie(`${DB_NAME}${suffix}`);
    this.init();
  }

  /*
  |--------------------------------------------------------------------------
  | Type-Safe Table Accessors
  |--------------------------------------------------------------------------
  */

  private tweets() {
    return this.db.table<Tweet>('tweets');
  }

  private users() {
    return this.db.table<User>('users');
  }

  private captures() {
    return this.db.table<Capture>('captures');
  }

  private browsingHistory() {
    return this.db.table<BrowsingHistory>('browsing_history');
  }

  private webhookConfigs() {
    return this.db.table<WebhookConfig>('webhook_configs');
  }

  private webhookLogs() {
    return this.db.table<WebhookLog>('webhook_logs');
  }

  /*
  |--------------------------------------------------------------------------
  | Read Methods for Extensions
  |--------------------------------------------------------------------------
  */

  async extGetCaptures(extName: string) {
    return this.captures().where('extension').equals(extName).toArray().catch(this.logError);
  }

  async extGetCaptureCount(extName: string) {
    return this.captures().where('extension').equals(extName).count().catch(this.logError);
  }

  async extGetCapturedTweets(extName: string) {
    const captures = await this.extGetCaptures(extName);
    if (!captures) {
      return [];
    }
    const tweetIds = captures.map((capture) => capture.data_key);
    return this.tweets()
      .where('rest_id')
      .anyOf(tweetIds)
      .filter((t) => this.filterEmptyData(t))
      .toArray()
      .catch(this.logError);
  }

  async extGetCapturedUsers(extName: string) {
    const captures = await this.extGetCaptures(extName);
    if (!captures) {
      return [];
    }
    const userIds = captures.map((capture) => capture.data_key);
    return this.users()
      .where('rest_id')
      .anyOf(userIds)
      .filter((t) => this.filterEmptyData(t))
      .toArray()
      .catch(this.logError);
  }

  /*
  |--------------------------------------------------------------------------
  | Write Methods for Extensions
  |--------------------------------------------------------------------------
  */

  async extAddTweets(extName: string, tweets: Tweet[]) {
    await this.upsertTweets(tweets);
    await this.upsertCaptures(
      tweets.map((tweet) => ({
        id: `${extName}-${tweet.rest_id}`,
        extension: extName,
        type: ExtensionType.TWEET,
        data_key: tweet.rest_id,
        created_at: Date.now(),
      })),
    );
  }

  async extAddUsers(extName: string, users: User[]) {
    await this.upsertUsers(users);
    await this.upsertCaptures(
      users.map((user) => ({
        id: `${extName}-${user.rest_id}`,
        extension: extName,
        type: ExtensionType.USER,
        data_key: user.rest_id,
        created_at: Date.now(),
      })),
    );
  }

  /*
  |--------------------------------------------------------------------------
  | Delete Methods for Extensions
  |--------------------------------------------------------------------------
  */

  async extClearCaptures(extName: string) {
    const captures = await this.extGetCaptures(extName);
    if (!captures) {
      return;
    }
    return this.captures().bulkDelete(captures.map((capture) => capture.id));
  }

  /*
  |--------------------------------------------------------------------------
  | Browsing History Methods
  |--------------------------------------------------------------------------
  */

  async addBrowsingHistories(histories: BrowsingHistory[]) {
    if (histories.length === 0) return;

    return this.db
      .transaction('rw', this.browsingHistory(), async () => {
        await this.browsingHistory().bulkPut(histories);

        // Enforce max count limit
        const count = await this.browsingHistory().count();
        if (count > MAX_BROWSING_HISTORY_COUNT) {
          const excess = count - MAX_BROWSING_HISTORY_COUNT;
          const oldestRecords = await this.browsingHistory()
            .orderBy('viewed_at')
            .limit(excess)
            .toArray();
          await this.browsingHistory().bulkDelete(oldestRecords.map((r) => r.id));
          logger.debug(`Cleaned up ${excess} old browsing history records`);
        }
      })
      .catch(this.logError);
  }

  async getBrowsingHistories(limit = 100, offset = 0) {
    return this.browsingHistory()
      .orderBy('viewed_at')
      .reverse()
      .offset(offset)
      .limit(limit)
      .toArray()
      .catch(this.logError);
  }

  async getBrowsingHistoryCount() {
    return this.browsingHistory().count().catch(this.logError);
  }

  async getRecentBrowsingHistories(windowMs: number) {
    const since = Date.now() - windowMs;
    return this.browsingHistory()
      .where('viewed_at')
      .above(since)
      .toArray()
      .catch(this.logError);
  }

  async clearBrowsingHistory() {
    return this.browsingHistory().clear().catch(this.logError);
  }

  async getBrowsingHistoriesByTweetIds(tweetIds: string[]) {
    return this.browsingHistory()
      .where('tweet_id')
      .anyOf(tweetIds)
      .toArray()
      .catch(this.logError);
  }

  /*
  |--------------------------------------------------------------------------
  | Webhook Config Methods
  |--------------------------------------------------------------------------
  */

  async addWebhookConfig(config: WebhookConfig) {
    return this.webhookConfigs().put(config).catch(this.logError);
  }

  async updateWebhookConfig(id: string, updates: Partial<WebhookConfig>) {
    return this.webhookConfigs()
      .update(id, { ...updates, updated_at: Date.now() })
      .catch(this.logError);
  }

  async deleteWebhookConfig(id: string) {
    return this.webhookConfigs().delete(id).catch(this.logError);
  }

  async getWebhookConfigs() {
    return this.webhookConfigs().toArray().catch(this.logError);
  }

  async getWebhookConfigById(id: string) {
    return this.webhookConfigs().get(id).catch(this.logError);
  }

  async getEnabledWebhookConfigs() {
    return this.webhookConfigs().where('enabled').equals(1).toArray().catch(this.logError);
  }

  /*
  |--------------------------------------------------------------------------
  | Webhook Log Methods
  |--------------------------------------------------------------------------
  */

  async addWebhookLog(log: WebhookLog) {
    return this.webhookLogs().put(log).catch(this.logError);
  }

  async updateWebhookLog(id: string, updates: Partial<WebhookLog>) {
    return this.webhookLogs().update(id, updates).catch(this.logError);
  }

  async getWebhookLogs(limit = 100, offset = 0) {
    return this.webhookLogs()
      .orderBy('created_at')
      .reverse()
      .offset(offset)
      .limit(limit)
      .toArray()
      .catch(this.logError);
  }

  async getWebhookLogCount() {
    return this.webhookLogs().count().catch(this.logError);
  }

  async getPendingWebhookLogs() {
    return this.webhookLogs().where('status').equals('pending').toArray().catch(this.logError);
  }

  async clearWebhookLogs() {
    return this.webhookLogs().clear().catch(this.logError);
  }

  /*
  |--------------------------------------------------------------------------
  | Export and Import Methods
  |--------------------------------------------------------------------------
  */

  async export() {
    return exportDB(this.db).catch(this.logError);
  }

  async import(data: Blob) {
    return importInto(this.db, data).catch(this.logError);
  }

  async clear() {
    await this.deleteAllCaptures();
    await this.deleteAllTweets();
    await this.deleteAllUsers();
    await this.clearBrowsingHistory();
    await this.clearWebhookLogs();
    logger.info('Database cleared');
  }

  async count() {
    try {
      return {
        tweets: await this.tweets().count(),
        users: await this.users().count(),
        captures: await this.captures().count(),
        browsingHistory: await this.browsingHistory().count(),
        webhookConfigs: await this.webhookConfigs().count(),
        webhookLogs: await this.webhookLogs().count(),
      };
    } catch (error) {
      this.logError(error);
      return null;
    }
  }

  /*
  |--------------------------------------------------------------------------
  | Common Methods
  |--------------------------------------------------------------------------
  */

  async upsertTweets(tweets: Tweet[]) {
    return this.db
      .transaction('rw', this.tweets(), () => {
        const data: Tweet[] = tweets.map((tweet) => ({
          ...tweet,
          twe_private_fields: {
            created_at: +parseTwitterDateTime(tweet.legacy.created_at),
            updated_at: Date.now(),
            media_count: extractTweetMedia(tweet).length,
          },
        }));

        return this.tweets().bulkPut(data);
      })
      .catch(this.logError);
  }

  async upsertUsers(users: User[]) {
    return this.db
      .transaction('rw', this.users(), () => {
        const data: User[] = users.map((user) => ({
          ...user,
          twe_private_fields: {
            created_at: +parseTwitterDateTime(user.core.created_at),
            updated_at: Date.now(),
          },
        }));

        return this.users().bulkPut(data);
      })
      .catch(this.logError);
  }

  async upsertCaptures(captures: Capture[]) {
    return this.db
      .transaction('rw', this.captures(), () => {
        return this.captures().bulkPut(captures).catch(this.logError);
      })
      .catch(this.logError);
  }

  async getTweetsByIds(tweetIds: string[]) {
    return this.tweets()
      .where('rest_id')
      .anyOf(tweetIds)
      .filter((t) => this.filterEmptyData(t))
      .toArray()
      .catch(this.logError);
  }

  async deleteAllTweets() {
    return this.tweets().clear().catch(this.logError);
  }

  async deleteAllUsers() {
    return this.users().clear().catch(this.logError);
  }

  async deleteAllCaptures() {
    return this.captures().clear().catch(this.logError);
  }

  private filterEmptyData(data: Tweet | User) {
    if (!data?.legacy) {
      logger.warn('Empty data found in DB', data);
      return false;
    }
    return true;
  }

  /*
  |--------------------------------------------------------------------------
  | Migrations
  |--------------------------------------------------------------------------
  */

  async init() {
    // Indexes for the "tweets" table.
    const tweetIndexPaths: KeyPaths<Tweet>[] = [
      'rest_id',
      'twe_private_fields.created_at',
      'twe_private_fields.updated_at',
      'twe_private_fields.media_count',
      'core.user_results.result.core.screen_name',
      'legacy.favorite_count',
      'legacy.retweet_count',
      'legacy.bookmark_count',
      'legacy.quote_count',
      'legacy.reply_count',
      'views.count',
      'legacy.favorited',
      'legacy.retweeted',
      'legacy.bookmarked',
    ];

    // Indexes for the "users" table.
    const userIndexPaths: KeyPaths<User>[] = [
      'rest_id',
      'twe_private_fields.created_at',
      'twe_private_fields.updated_at',
      'core.screen_name',
      'legacy.followers_count',
      'legacy.friends_count',
      'legacy.statuses_count',
      'legacy.favourites_count',
      'legacy.listed_count',
      'verification.verified_type',
      'is_blue_verified',
      'relationship_perspectives.following',
      'relationship_perspectives.followed_by',
    ];

    // Indexes for the "captures" table.
    const captureIndexPaths: KeyPaths<Capture>[] = ['id', 'extension', 'type', 'created_at'];

    // Indexes for the "browsing_history" table.
    const browsingHistoryIndexPaths: KeyPaths<BrowsingHistory>[] = [
      'id',
      'tweet_id',
      'viewed_at',
      'source_page',
    ];

    // Indexes for the "webhook_configs" table.
    const webhookConfigIndexPaths: KeyPaths<WebhookConfig>[] = [
      'id',
      'enabled',
      'created_at',
      'updated_at',
    ];

    // Indexes for the "webhook_logs" table.
    const webhookLogIndexPaths: KeyPaths<WebhookLog>[] = [
      'id',
      'event_type',
      'tweet_id',
      'status',
      'created_at',
    ];

    // Take care of database schemas and versioning.
    // See: https://dexie.org/docs/Tutorial/Design#database-versioning
    try {
      this.db
        .version(2)
        .stores({
          tweets: tweetIndexPaths.join(','),
          users: userIndexPaths.join(','),
          captures: captureIndexPaths.join(','),
        })
        .upgrade(async (tx) => {
          logger.info('Upgrading database schema to v2...');
          await migration_20250609(tx);
          logger.info('Database upgraded to v2');
        });

      this.db
        .version(DB_VERSION)
        .stores({
          tweets: tweetIndexPaths.join(','),
          users: userIndexPaths.join(','),
          captures: captureIndexPaths.join(','),
          browsing_history: browsingHistoryIndexPaths.join(','),
          webhook_configs: webhookConfigIndexPaths.join(','),
          webhook_logs: webhookLogIndexPaths.join(','),
        });

      await this.db.open();
      logger.info(`Database connected: ${this.db.name}`);
    } catch (error) {
      this.logError(error);
    }
  }

  /*
  |--------------------------------------------------------------------------
  | Loggers
  |--------------------------------------------------------------------------
  */

  logError(error: unknown) {
    logger.error(`Database Error: ${(error as Error).message}`, error);
  }
}
