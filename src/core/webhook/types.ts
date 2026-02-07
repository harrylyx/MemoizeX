import { WebhookEventType, WebhookPayload } from '@/types/webhook';

/**
 * Options for sending a webhook.
 */
export interface WebhookSendOptions {
  /** Webhook URL */
  url: string;
  /** Custom headers */
  headers?: Record<string, string>;
  /** Request timeout in milliseconds */
  timeout?: number;
}

/**
 * Result of a webhook send operation.
 */
export interface WebhookSendResult {
  /** Whether the request was successful */
  success: boolean;
  /** HTTP status code */
  status?: number;
  /** Response text */
  responseText?: string;
  /** Error message if failed */
  error?: string;
}

/**
 * Webhook event data passed to the manager.
 */
export interface WebhookEvent {
  /** Event type */
  type: WebhookEventType;
  /** Tweet ID */
  tweetId: string;
  /** Webhook payload */
  payload: WebhookPayload;
}

/**
 * Retry queue item.
 */
export interface RetryQueueItem {
  /** Webhook log ID */
  logId: string;
  /** Webhook config ID */
  configId: string;
  /** Webhook URL */
  url: string;
  /** Custom headers */
  headers: Record<string, string>;
  /** Request payload */
  payload: WebhookPayload;
  /** Current retry count */
  retryCount: number;
  /** Maximum retries allowed */
  maxRetries: number;
  /** Next retry timestamp */
  nextRetryAt: number;
}
