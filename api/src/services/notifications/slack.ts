import type { Env } from '../../types';
import type { NotificationData } from '../../models/notification';
import { NotificationFormatter } from '../../models/notification';

/**
 * Slack notification service with webhook integration
 */
export class SlackService {
  private webhookUrl: string;
  
  constructor(webhookUrl: string) {
    this.webhookUrl = webhookUrl;
  }
  
  /**
   * Send notification to Slack channel
   */
  async sendNotification(data: NotificationData): Promise<void> {
    try {
      const payload = NotificationFormatter.formatSlackPayload(data);
      
      const response = await fetch(this.webhookUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'User-Agent': 'SwiftConcur-API/1.0',
        },
        body: JSON.stringify(payload),
      });
      
      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Slack API error ${response.status}: ${errorText}`);
      }
      
      const responseText = await response.text();
      if (responseText !== 'ok') {
        throw new Error(`Slack API unexpected response: ${responseText}`);
      }
      
    } catch (error) {
      console.error('Failed to send Slack notification:', error);
      throw error;
    }
  }
  
  /**
   * Send custom message to Slack
   */
  async sendCustomMessage(message: string, channel?: string): Promise<void> {
    try {
      const payload = {
        text: message,
        ...(channel && { channel }),
        username: 'SwiftConcur CI',
        icon_emoji: ':warning:',
      };
      
      const response = await fetch(this.webhookUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      });
      
      if (!response.ok) {
        throw new Error(`Slack API error: ${response.status}`);
      }
      
    } catch (error) {
      console.error('Failed to send custom Slack message:', error);
      throw error;
    }
  }
  
  /**
   * Test Slack webhook connectivity
   */
  async testConnection(): Promise<boolean> {
    try {
      await this.sendCustomMessage('SwiftConcur CI test message');
      return true;
    } catch (error) {
      console.error('Slack connection test failed:', error);
      return false;
    }
  }
}

/**
 * Helper function to create Slack service
 */
export function createSlackService(env: Env): SlackService | null {
  const webhookUrl = env.SLACK_WEBHOOK_URL;
  if (!webhookUrl) {
    return null;
  }
  
  return new SlackService(webhookUrl);
}