import type { Env } from '../../types';
import type { NotificationData } from '../../models/notification';
import { NotificationFormatter } from '../../models/notification';

/**
 * Microsoft Teams notification service
 */
export class TeamsService {
  private webhookUrl: string;
  
  constructor(webhookUrl: string) {
    this.webhookUrl = webhookUrl;
  }
  
  /**
   * Send notification to Teams channel
   */
  async sendNotification(data: NotificationData): Promise<void> {
    try {
      const payload = NotificationFormatter.formatTeamsPayload(data);
      
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
        throw new Error(`Teams API error ${response.status}: ${errorText}`);
      }
      
      // Teams returns "1" for success
      const responseText = await response.text();
      if (responseText !== '1') {
        console.warn(`Teams API unexpected response: ${responseText}`);
      }
      
    } catch (error) {
      console.error('Failed to send Teams notification:', error);
      throw error;
    }
  }
  
  /**
   * Send simple text message to Teams
   */
  async sendSimpleMessage(text: string, title?: string): Promise<void> {
    try {
      const payload = {
        '@type': 'MessageCard',
        '@context': 'http://schema.org/extensions',
        summary: title || 'SwiftConcur CI Notification',
        themeColor: '0078D4', // Microsoft blue
        sections: [{
          activityTitle: title || 'SwiftConcur CI',
          activitySubtitle: 'Automated notification',
          text: text,
        }],
      };
      
      const response = await fetch(this.webhookUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      });
      
      if (!response.ok) {
        throw new Error(`Teams API error: ${response.status}`);
      }
      
    } catch (error) {
      console.error('Failed to send simple Teams message:', error);
      throw error;
    }
  }
  
  /**
   * Send adaptive card to Teams
   */
  async sendAdaptiveCard(cardData: any): Promise<void> {
    try {
      const response = await fetch(this.webhookUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(cardData),
      });
      
      if (!response.ok) {
        throw new Error(`Teams API error: ${response.status}`);
      }
      
    } catch (error) {
      console.error('Failed to send adaptive card:', error);
      throw error;
    }
  }
  
  /**
   * Test Teams webhook connectivity
   */
  async testConnection(): Promise<boolean> {
    try {
      await this.sendSimpleMessage('SwiftConcur CI test message', 'Connection Test');
      return true;
    } catch (error) {
      console.error('Teams connection test failed:', error);
      return false;
    }
  }
}

/**
 * Helper function to create Teams service
 */
export function createTeamsService(env: Env): TeamsService | null {
  const webhookUrl = env.TEAMS_WEBHOOK_URL;
  if (!webhookUrl) {
    return null;
  }
  
  return new TeamsService(webhookUrl);
}