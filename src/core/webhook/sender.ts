import { GM } from '$';
import logger from '@/utils/logger';
import { WebhookSendOptions, WebhookSendResult } from './types';
import { WebhookPayload } from '@/types/webhook';

/**
 * Default request timeout in milliseconds.
 */
const DEFAULT_TIMEOUT = 10000;

/**
 * Sends webhook requests using GM_xmlhttpRequest for cross-origin support.
 */
export class WebhookSender {
  /**
   * Sends a webhook POST request.
   *
   * @param payload - The webhook payload to send
   * @param options - Send options including URL and headers
   * @returns Promise resolving to the send result
   */
  async send(payload: WebhookPayload, options: WebhookSendOptions): Promise<WebhookSendResult> {
    const { url, headers = {}, timeout = DEFAULT_TIMEOUT } = options;

    try {
      const result = await this.makeRequest(url, payload, headers, timeout);
      return result;
    } catch (error) {
      logger.error('Webhook send error:', error);
      return {
        success: false,
        error: (error as Error).message || 'Unknown error',
      };
    }
  }

  /**
   * Makes the actual HTTP request using GM_xmlhttpRequest.
   */
  private makeRequest(
    url: string,
    payload: WebhookPayload,
    headers: Record<string, string>,
    timeout: number,
  ): Promise<WebhookSendResult> {
    return new Promise((resolve) => {
      try {
        GM.xmlHttpRequest({
          method: 'POST',
          url,
          headers: {
            'Content-Type': 'application/json',
            ...headers,
          },
          data: JSON.stringify(payload),
          timeout,
          onload: (response) => {
            const success = response.status >= 200 && response.status < 300;
            resolve({
              success,
              status: response.status,
              responseText: response.responseText,
              error: success ? undefined : `HTTP ${response.status}: ${response.statusText}`,
            });
          },
          onerror: (error) => {
            resolve({
              success: false,
              error: `Network error: ${error.statusText || 'Request failed'}`,
            });
          },
          ontimeout: () => {
            resolve({
              success: false,
              error: `Request timeout after ${timeout}ms`,
            });
          },
        });
      } catch (error) {
        resolve({
          success: false,
          error: (error as Error).message || 'Failed to send request',
        });
      }
    });
  }

  /**
   * Tests a webhook URL with a test payload.
   *
   * @param url - Webhook URL to test
   * @param headers - Custom headers
   * @returns Promise resolving to the test result
   */
  async test(url: string, headers: Record<string, string> = {}): Promise<WebhookSendResult> {
    const testPayload: WebhookPayload = {
      event: 'like',
      timestamp: Date.now(),
      data: {
        id: 'test-tweet-id',
        text: 'This is a test webhook from MemoizeX',
        author: {
          id: 'test-author-id',
          screen_name: 'test_user',
          name: 'Test User',
        },
        url: 'https://x.com/test_user/status/test-tweet-id',
        created_at: new Date().toISOString(),
        stats: {
          likes: 0,
          retweets: 0,
          replies: 0,
          quotes: 0,
          bookmarks: 0,
        },
        media: [],
      },
    };

    return this.send(testPayload, { url, headers, timeout: 5000 });
  }
}
