import { Signal } from '@preact/signals';
import { db } from '@/core/database';
import { Tweet } from '@/types';
import { WebhookConfig, WebhookEventType, WebhookLog, WebhookPayload } from '@/types/webhook';
import { formatWebhookPayload, generateWebhookLogId } from '@/utils/webhook-formatter';
import logger from '@/utils/logger';
import { WebhookSender } from './sender';
import { WebhookQueue } from './queue';

/**
 * Manages webhook configurations, sending, and logging.
 */
export class WebhookManager {
  private sender: WebhookSender;
  private queue: WebhookQueue;
  private configs: WebhookConfig[] = [];

  /**
   * Signal for subscribing to webhook config changes.
   */
  public signal = new Signal(0);

  constructor() {
    this.sender = new WebhookSender();
    this.queue = new WebhookQueue(this.sender);
    this.loadConfigs();
  }

  /**
   * Loads webhook configurations from the database.
   */
  async loadConfigs(): Promise<void> {
    const configs = await db.getWebhookConfigs();
    this.configs = configs || [];
    this.signal.value++;
    logger.debug(`Loaded ${this.configs.length} webhook configs`);
  }

  /**
   * Gets all webhook configurations.
   */
  getConfigs(): WebhookConfig[] {
    return this.configs;
  }

  /**
   * Gets enabled webhook configurations for a specific event type.
   *
   * @param eventType - The event type to filter by
   * @returns Array of matching webhook configs
   */
  getConfigsForEvent(eventType: WebhookEventType): WebhookConfig[] {
    return this.configs.filter(
      (config) => config.enabled && config.events.includes(eventType),
    );
  }

  /**
   * Adds a new webhook configuration.
   *
   * @param config - The webhook configuration to add
   */
  async addConfig(config: WebhookConfig): Promise<void> {
    await db.addWebhookConfig(config);
    await this.loadConfigs();
    logger.info(`Added webhook config: ${config.name}`);
  }

  /**
   * Updates a webhook configuration.
   *
   * @param id - Config ID
   * @param updates - Partial updates to apply
   */
  async updateConfig(id: string, updates: Partial<WebhookConfig>): Promise<void> {
    await db.updateWebhookConfig(id, updates);
    await this.loadConfigs();
    logger.info(`Updated webhook config: ${id}`);
  }

  /**
   * Deletes a webhook configuration.
   *
   * @param id - Config ID to delete
   */
  async deleteConfig(id: string): Promise<void> {
    await db.deleteWebhookConfig(id);
    await this.loadConfigs();
    logger.info(`Deleted webhook config: ${id}`);
  }

  /**
   * Tests a webhook configuration.
   *
   * @param url - Webhook URL to test
   * @param headers - Custom headers
   * @returns Test result
   */
  async testWebhook(url: string, headers: Record<string, string> = {}): Promise<{
    success: boolean;
    message: string;
  }> {
    const result = await this.sender.test(url, headers);
    return {
      success: result.success,
      message: result.success
        ? `Webhook test successful (HTTP ${result.status})`
        : result.error || 'Unknown error',
    };
  }

  /**
   * Triggers webhooks for a specific event and tweet.
   *
   * @param eventType - The event type
   * @param tweet - The tweet data
   */
  async triggerWebhooks(eventType: WebhookEventType, tweet: Tweet): Promise<void> {
    const configs = this.getConfigsForEvent(eventType);

    if (configs.length === 0) {
      return;
    }

    const payload = formatWebhookPayload(tweet, eventType);

    for (const config of configs) {
      await this.sendWebhook(config, payload, tweet.rest_id, eventType);
    }
  }

  /**
   * Triggers webhooks for multiple tweets (batch operation).
   *
   * @param eventType - The event type
   * @param tweets - Array of tweet data
   */
  async triggerWebhooksBatch(eventType: WebhookEventType, tweets: Tweet[]): Promise<void> {
    const configs = this.getConfigsForEvent(eventType);

    if (configs.length === 0) {
      return;
    }

    for (const tweet of tweets) {
      const payload = formatWebhookPayload(tweet, eventType);
      for (const config of configs) {
        await this.sendWebhook(config, payload, tweet.rest_id, eventType);
      }
    }
  }

  /**
   * Sends a webhook and logs the result.
   */
  private async sendWebhook(
    config: WebhookConfig,
    payload: WebhookPayload,
    tweetId: string,
    eventType: WebhookEventType,
  ): Promise<void> {
    const timestamp = Date.now();
    const logId = generateWebhookLogId(eventType, tweetId, timestamp);

    // Create initial log entry
    const log: WebhookLog = {
      id: logId,
      event_type: eventType,
      tweet_id: tweetId,
      webhook_url: config.url,
      status: 'pending',
      request_payload: JSON.stringify(payload),
      created_at: timestamp,
      retry_count: 0,
    };

    await db.addWebhookLog(log);

    // Send the webhook
    const result = await this.sender.send(payload, {
      url: config.url,
      headers: config.headers,
    });

    if (result.success) {
      await db.updateWebhookLog(logId, {
        status: 'success',
        response_status: result.status,
      });
      logger.debug(`Webhook sent successfully: ${eventType} for tweet ${tweetId}`);
    } else {
      // Handle retry if enabled
      if (config.retry_on_failure && config.max_retries > 0) {
        this.queue.add({
          logId,
          configId: config.id,
          url: config.url,
          headers: config.headers,
          payload,
          retryCount: 0,
          maxRetries: config.max_retries,
        });
        logger.debug(`Webhook failed, added to retry queue: ${logId}`);
      } else {
        await db.updateWebhookLog(logId, {
          status: 'failed',
          error_message: result.error,
        });
        logger.warn(`Webhook failed: ${result.error}`);
      }
    }
  }

  /**
   * Starts the retry queue processor.
   */
  startQueue(): void {
    this.queue.start();
  }

  /**
   * Stops the retry queue processor.
   */
  stopQueue(): void {
    this.queue.stop();
  }
}

/**
 * Global webhook manager instance.
 */
export const webhookManager = new WebhookManager();
