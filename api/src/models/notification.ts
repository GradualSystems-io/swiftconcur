import { z } from 'zod';

export const NotificationConfigSchema = z.object({
  slack: z.object({
    webhook_url: z.string().url(),
    channel: z.string().optional(),
    enabled: z.boolean().default(true),
  }).optional(),
  teams: z.object({
    webhook_url: z.string().url(),
    enabled: z.boolean().default(true),
  }).optional(),
  email: z.object({
    recipients: z.array(z.string().email()),
    enabled: z.boolean().default(true),
  }).optional(),
});

export const NotificationDataSchema = z.object({
  repo_name: z.string(),
  run_id: z.string().uuid(),
  warnings_count: z.number().int().min(0),
  critical_count: z.number().int().min(0),
  high_count: z.number().int().min(0),
  summary: z.string(),
  commit_sha: z.string(),
  branch: z.string(),
  pull_request: z.number().int().positive().optional(),
  dashboard_url: z.string().url(),
});

export type NotificationConfig = z.infer<typeof NotificationConfigSchema>;
export type NotificationData = z.infer<typeof NotificationDataSchema>;

export class NotificationFormatter {
  static formatSlackPayload(data: NotificationData) {
    const color = data.critical_count > 0 ? 'danger' : 
                  data.warnings_count > 0 ? 'warning' : 'good';
    
    const emoji = data.critical_count > 0 ? '🚨' : 
                  data.warnings_count > 0 ? '⚠️' : '✅';
    
    return {
      attachments: [{
        color,
        title: `${emoji} SwiftConcur CI Results - ${data.repo_name}`,
        title_link: data.dashboard_url,
        fields: [
          {
            title: 'Total Warnings',
            value: data.warnings_count.toString(),
            short: true,
          },
          {
            title: 'Critical Issues',
            value: data.critical_count.toString(),
            short: true,
          },
          {
            title: 'Branch',
            value: data.branch,
            short: true,
          },
          {
            title: 'Commit',
            value: data.commit_sha.substring(0, 7),
            short: true,
          },
        ],
        text: data.summary,
        footer: 'SwiftConcur CI',
        footer_icon: 'https://swiftconcur.dev/icon.png',
        ts: Math.floor(Date.now() / 1000),
      }],
    };
  }
  
  static formatTeamsPayload(data: NotificationData) {
    const themeColor = data.critical_count > 0 ? 'FF0000' : 
                       data.warnings_count > 0 ? 'FFA500' : '00FF00';
    
    return {
      '@type': 'MessageCard',
      '@context': 'http://schema.org/extensions',
      summary: `SwiftConcur CI Results - ${data.repo_name}`,
      themeColor,
      sections: [{
        activityTitle: `SwiftConcur CI Results - ${data.repo_name}`,
        activitySubtitle: `Branch: ${data.branch} | Commit: ${data.commit_sha.substring(0, 7)}`,
        facts: [
          {
            name: 'Total Warnings',
            value: data.warnings_count.toString(),
          },
          {
            name: 'Critical Issues',
            value: data.critical_count.toString(),
          },
          {
            name: 'High Priority',
            value: data.high_count.toString(),
          },
        ],
        text: data.summary,
      }],
      potentialAction: [{
        '@type': 'OpenUri',
        name: 'View Details',
        targets: [{
          os: 'default',
          uri: data.dashboard_url,
        }],
      }],
    };
  }
}