import logger from '@/utils/logger';
import { WebhookSender } from './sender';
import { RetryQueueItem } from './types';
import { db } from '@/core/database';

/**
 * Base delay for exponential backoff in milliseconds.
 */
const BASE_RETRY_DELAY = 1000;

/**
 * Maximum delay between retries in milliseconds (5 minutes).
 */
const MAX_RETRY_DELAY = 5 * 60 * 1000;

/**
 * Manages webhook retry queue with exponential backoff.
 */
export class WebhookQueue {
  private queue: RetryQueueItem[] = [];
  private sender: WebhookSender;
  private isProcessing = false;
  private timer: ReturnType<typeof setTimeout> | null = null;

  constructor(sender: WebhookSender) {
    this.sender = sender;
  }

  /**
   * Adds an item to the retry queue.
   *
   * @param item - The retry queue item
   */
  add(item: Omit<RetryQueueItem, 'nextRetryAt'>): void {
    const delay = this.calculateDelay(item.retryCount);
    const nextRetryAt = Date.now() + delay;

    this.queue.push({
      ...item,
      nextRetryAt,
    });

    logger.debug(`Added webhook to retry queue, next retry in ${delay}ms`);
    this.scheduleProcessing();
  }

  /**
   * Starts processing the retry queue.
   */
  start(): void {
    this.scheduleProcessing();
  }

  /**
   * Stops processing the retry queue.
   */
  stop(): void {
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
    this.isProcessing = false;
  }

  /**
   * Gets the current queue size.
   */
  get size(): number {
    return this.queue.length;
  }

  /**
   * Calculates the delay for a retry attempt using exponential backoff.
   *
   * @param retryCount - Current retry count
   * @returns Delay in milliseconds
   */
  private calculateDelay(retryCount: number): number {
    const delay = BASE_RETRY_DELAY * Math.pow(2, retryCount);
    return Math.min(delay, MAX_RETRY_DELAY);
  }

  /**
   * Schedules the next queue processing.
   */
  private scheduleProcessing(): void {
    if (this.isProcessing || this.queue.length === 0) {
      return;
    }

    // Find the next item to process
    const now = Date.now();
    const nextItem = this.queue.reduce((earliest, item) => {
      if (!earliest || item.nextRetryAt < earliest.nextRetryAt) {
        return item;
      }
      return earliest;
    }, null as RetryQueueItem | null);

    if (!nextItem) {
      return;
    }

    const delay = Math.max(0, nextItem.nextRetryAt - now);

    if (this.timer) {
      clearTimeout(this.timer);
    }

    this.timer = setTimeout(() => {
      this.processQueue();
    }, delay);
  }

  /**
   * Processes items in the queue that are ready for retry.
   */
  private async processQueue(): Promise<void> {
    if (this.isProcessing) {
      return;
    }

    this.isProcessing = true;
    const now = Date.now();

    // Get items ready for processing
    const readyItems = this.queue.filter((item) => item.nextRetryAt <= now);

    for (const item of readyItems) {
      // Remove from queue
      const index = this.queue.indexOf(item);
      if (index > -1) {
        this.queue.splice(index, 1);
      }

      // Attempt to send
      const result = await this.sender.send(item.payload, {
        url: item.url,
        headers: item.headers,
      });

      if (result.success) {
        // Update log as success
        await db.updateWebhookLog(item.logId, {
          status: 'success',
          response_status: result.status,
          retry_count: item.retryCount + 1,
        });
        logger.info(`Webhook retry succeeded for ${item.logId}`);
      } else {
        // Check if we should retry again
        if (item.retryCount + 1 < item.maxRetries) {
          // Add back to queue with incremented retry count
          this.add({
            ...item,
            retryCount: item.retryCount + 1,
          });
        } else {
          // Max retries reached, mark as failed
          await db.updateWebhookLog(item.logId, {
            status: 'failed',
            error_message: result.error,
            retry_count: item.retryCount + 1,
          });
          logger.warn(`Webhook failed after ${item.maxRetries} retries: ${item.logId}`);
        }
      }
    }

    this.isProcessing = false;
    this.scheduleProcessing();
  }
}
