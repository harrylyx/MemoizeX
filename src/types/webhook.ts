/**
 * Webhook configuration.
 */
export interface WebhookConfig {
  /** Unique identifier */
  id: string;
  /** Display name for the webhook */
  name: string;
  /** Webhook URL to send requests to */
  url: string;
  /** Whether the webhook is enabled */
  enabled: boolean;
  /** Events that trigger this webhook */
  events: WebhookEventType[];
  /** Custom HTTP headers */
  headers: Record<string, string>;
  /** Whether to retry on failure */
  retry_on_failure: boolean;
  /** Maximum number of retry attempts */
  max_retries: number;
  /** Timestamp when created */
  created_at: number;
  /** Timestamp when last updated */
  updated_at: number;
}

/**
 * Webhook event types.
 */
export type WebhookEventType = 'like' | 'bookmark' | 'view';

/**
 * Webhook execution log.
 */
export interface WebhookLog {
  /** Unique identifier */
  id: string;
  /** Type of event that triggered the webhook */
  event_type: WebhookEventType;
  /** Tweet ID associated with the event */
  tweet_id: string;
  /** Webhook URL that was called */
  webhook_url: string;
  /** Execution status */
  status: WebhookLogStatus;
  /** Request payload as JSON string */
  request_payload: string;
  /** HTTP response status code */
  response_status?: number;
  /** Error message if failed */
  error_message?: string;
  /** Timestamp when created */
  created_at: number;
  /** Number of retry attempts */
  retry_count: number;
}

/**
 * Webhook log status.
 */
export type WebhookLogStatus = 'pending' | 'success' | 'failed';

/**
 * Webhook payload sent to external endpoints.
 */
export interface WebhookPayload {
  /** Event type */
  event: WebhookEventType;
  /** Timestamp of the event */
  timestamp: number;
  /** Tweet data */
  data: WebhookTweetData;
}

/**
 * Tweet data included in webhook payload.
 */
export interface WebhookTweetData {
  /** Tweet ID */
  id: string;
  /** Tweet text content */
  text: string;
  /** Author information */
  author: {
    id: string;
    screen_name: string;
    name: string;
  };
  /** Tweet URL */
  url: string;
  /** Original creation timestamp */
  created_at: string;
  /** Tweet statistics */
  stats: {
    likes: number;
    retweets: number;
    replies: number;
    quotes: number;
    bookmarks: number;
  };
  /** Media attachments */
  media: WebhookMediaItem[];
}

/**
 * Media item in webhook payload.
 */
export interface WebhookMediaItem {
  /** Media type */
  type: 'photo' | 'video' | 'animated_gif';
  /** Media URL */
  url: string;
}
