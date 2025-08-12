import { createClient } from '@/lib/supabase/server';
import { headers } from 'next/headers';

// Audit Event Types
export interface AuditEvent {
  event: string;
  category?: 'authentication' | 'authorization' | 'data_access' | 
             'data_modification' | 'configuration' | 'security' | 'system';
  actor_id?: string;
  actor_type?: 'user' | 'system' | 'api' | 'service';
  actor_email?: string;
  org_id?: string;
  resource_type?: string;
  resource_id?: string;
  resource_name?: string;
  metadata?: Record<string, any>;
  old_values?: Record<string, any>;
  new_values?: Record<string, any>;
  risk_score?: number;
  success?: boolean;
  error_message?: string;
}

// Risk calculation
function calculateRiskScore(event: AuditEvent): number {
  let score = 0;
  
  // High-risk event types
  const highRiskEvents = [
    'auth.failed_login_repeated',
    'auth.privilege_escalation',
    'auth.admin_impersonation',
    'data.mass_export',
    'data.pii_access',
    'security.policy_disabled',
    'config.security_change',
    'billing.plan_downgrade_forced',
  ];
  
  const mediumRiskEvents = [
    'auth.password_reset',
    'auth.mfa_disabled',
    'user.role_elevated',
    'data.bulk_download',
    'config.integration_added',
  ];
  
  if (highRiskEvents.some(pattern => event.event.includes(pattern))) {
    score += 50;
  } else if (mediumRiskEvents.some(pattern => event.event.includes(pattern))) {
    score += 30;
  }
  
  // Risk factors from metadata
  if (event.metadata) {
    if (event.metadata.failed_attempts > 5) score += 20;
    if (event.metadata.unusual_time) score += 10;
    if (event.metadata.new_location) score += 15;
    if (event.metadata.api_rate_exceeded) score += 25;
    if (event.metadata.bulk_operation) score += 15;
    if (event.metadata.admin_action) score += 10;
  }
  
  // Failed operations are higher risk
  if (event.success === false) score += 20;
  
  return Math.min(score, 100);
}

// Get request context
function getRequestContext() {
  try {
    const headersList = headers();
    return {
      ip: headersList.get('x-forwarded-for')?.split(',')[0] || 
          headersList.get('x-real-ip') || 
          'unknown',
      userAgent: headersList.get('user-agent') || 'unknown',
      requestId: headersList.get('x-request-id') || 
                 headersList.get('cf-ray') || 
                 `req_${Date.now()}`,
    };
  } catch (error) {
    // Fallback for non-request contexts
    return {
      ip: 'system',
      userAgent: 'system',
      requestId: `sys_${Date.now()}`,
    };
  }
}

// Main audit logging function
export async function auditLog(event: AuditEvent): Promise<void> {
  try {
    const supabase = createClient();
    
    // Determine event category if not provided
    const category = event.category || categorizeEvent(event.event);
    
    // Calculate risk score if not provided
    const riskScore = event.risk_score ?? calculateRiskScore(event);
    
    // Get request context
    const context = getRequestContext();
    
    // Insert audit log
    const { error } = await supabase.from('audit_logs').insert({
      event_type: event.event,
      event_category: category,
      actor_id: event.actor_id,
      actor_type: event.actor_type || 'user',
      actor_email: event.actor_email,
      org_id: event.org_id,
      resource_type: event.resource_type,
      resource_id: event.resource_id,
      resource_name: event.resource_name,
      ip_address: context.ip,
      user_agent: context.userAgent,
      request_id: context.requestId,
      metadata: {
        ...event.metadata,
        timestamp: new Date().toISOString(),
        context: 'application',
      },
      old_values: event.old_values,
      new_values: event.new_values,
      risk_score: riskScore,
      success: event.success ?? true,
      error_message: event.error_message,
    });
    
    if (error) {
      console.error('Audit log insertion failed:', error);
      // Send to backup logging service in production
      await sendToBackupLogger(event, error);
      return;
    }
    
    // Create security alert for high-risk events
    if (riskScore >= 70) {
      await createSecurityAlert(event, riskScore);
    }
    
    // Log specific sensitive operations
    if (category === 'data_access' && event.metadata?.sensitive) {
      await logDataAccess(event);
    }
    
  } catch (error) {
    console.error('Audit logging error:', error);
    // Never fail the main operation due to audit logging
    await sendToBackupLogger(event, error);
  }
}

// Event categorization
function categorizeEvent(eventType: string): string {
  const categories = {
    authentication: ['login', 'logout', 'sso', 'mfa', 'password', 'session'],
    authorization: ['permission', 'role', 'access', 'privilege', 'rbac'],
    data_access: ['view', 'read', 'export', 'download', 'query', 'search'],
    data_modification: ['create', 'update', 'delete', 'modify', 'insert'],
    configuration: ['settings', 'config', 'setup', 'integration', 'feature'],
    security: ['threat', 'violation', 'suspicious', 'blocked', 'policy'],
    system: ['backup', 'maintenance', 'error', 'performance', 'health'],
  };
  
  for (const [category, keywords] of Object.entries(categories)) {
    if (keywords.some(keyword => eventType.toLowerCase().includes(keyword))) {
      return category;
    }
  }
  
  return 'system';
}

// Data access logging
async function logDataAccess(event: AuditEvent): Promise<void> {
  try {
    const supabase = createClient();
    
    await supabase.from('data_access_logs').insert({
      user_id: event.actor_id,
      org_id: event.org_id,
      table_name: event.resource_type || 'unknown',
      operation: event.event.split('.')[1] || 'access',
      row_ids: event.metadata?.row_ids,
      columns_accessed: event.metadata?.columns,
      query_hash: event.metadata?.query_hash,
      execution_time_ms: event.metadata?.duration_ms,
      records_affected: event.metadata?.record_count || 0,
      data_classification: event.metadata?.classification || 'internal',
      purpose: event.metadata?.purpose || 'business_operation',
      ip_address: getRequestContext().ip,
    });
  } catch (error) {
    console.error('Data access logging failed:', error);
  }
}

// Security alert creation
async function createSecurityAlert(event: AuditEvent, riskScore: number): Promise<void> {
  try {
    const supabase = createClient();
    
    const severity = riskScore >= 90 ? 'critical' : 
                    riskScore >= 80 ? 'high' : 
                    riskScore >= 70 ? 'medium' : 'low';
    
    await supabase.from('security_events').insert({
      event_type: `high_risk_${event.event}`,
      severity,
      title: `High-risk activity detected: ${event.event}`,
      description: `Event "${event.event}" triggered with risk score ${riskScore}`,
      affected_user_id: event.actor_id,
      affected_org_id: event.org_id,
      affected_resources: {
        resource_type: event.resource_type,
        resource_id: event.resource_id,
        metadata: event.metadata,
      },
      detection_method: 'automated_risk_scoring',
      response_actions: {
        alert_sent: true,
        requires_review: riskScore >= 80,
        auto_block: false, // Can be enabled for critical events
      },
    });
    
    // Send real-time notification for critical events
    if (severity === 'critical') {
      await sendCriticalSecurityNotification(event, riskScore);
    }
    
  } catch (error) {
    console.error('Security alert creation failed:', error);
  }
}

// Backup logging for when primary audit fails
async function sendToBackupLogger(event: AuditEvent, error: any): Promise<void> {
  try {
    // In production, this would send to:
    // - CloudWatch Logs
    // - DataDog
    // - External SIEM
    // - Slack alert channel
    
    console.error('AUDIT_BACKUP_LOG', {
      timestamp: new Date().toISOString(),
      event: event.event,
      actor: event.actor_id,
      org: event.org_id,
      error: error.message,
      context: getRequestContext(),
    });
    
    // Simple file logging as fallback
    if (process.env.NODE_ENV === 'production') {
      const fs = require('fs').promises;
      const logEntry = JSON.stringify({
        timestamp: new Date().toISOString(),
        type: 'audit_backup',
        event,
        error: error.message,
      }) + '\n';
      
      await fs.appendFile('/tmp/audit_backup.log', logEntry);
    }
  } catch (backupError) {
    console.error('Backup logging also failed:', backupError);
  }
}

// Critical security notifications
async function sendCriticalSecurityNotification(event: AuditEvent, riskScore: number): Promise<void> {
  try {
    // This would integrate with:
    // - PagerDuty for immediate alerts
    // - Slack for team notifications
    // - Email for security team
    
    console.error('CRITICAL_SECURITY_EVENT', {
      timestamp: new Date().toISOString(),
      event: event.event,
      actor: event.actor_id,
      org: event.org_id,
      riskScore,
      metadata: event.metadata,
    });
    
    // TODO: Integrate with actual notification services
    // await pagerDuty.trigger({
    //   summary: `Critical security event: ${event.event}`,
    //   severity: 'critical',
    //   source: 'swiftconcur-security',
    // });
    
  } catch (error) {
    console.error('Critical notification failed:', error);
  }
}

// Convenience functions for common audit events
export const audit = {
  // Authentication events
  login: (userId: string, orgId?: string, metadata?: any) =>
    auditLog({
      event: 'auth.login_success',
      category: 'authentication',
      actor_id: userId,
      org_id: orgId,
      metadata,
    }),
  
  loginFailed: (email: string, reason: string, metadata?: any) =>
    auditLog({
      event: 'auth.login_failed',
      category: 'authentication',
      actor_email: email,
      success: false,
      error_message: reason,
      metadata: { ...metadata, email },
      risk_score: 30,
    }),
  
  logout: (userId: string, orgId?: string) =>
    auditLog({
      event: 'auth.logout',
      category: 'authentication',
      actor_id: userId,
      org_id: orgId,
    }),
  
  ssoLogin: (userId: string, orgId: string, provider: string, metadata?: any) =>
    auditLog({
      event: 'auth.sso_login',
      category: 'authentication',
      actor_id: userId,
      org_id: orgId,
      metadata: { provider, ...metadata },
    }),
  
  // Data access events
  dataExport: (userId: string, orgId: string, resourceType: string, metadata?: any) =>
    auditLog({
      event: 'data.export',
      category: 'data_access',
      actor_id: userId,
      org_id: orgId,
      resource_type: resourceType,
      metadata: { sensitive: true, ...metadata },
      risk_score: 40,
    }),
  
  // Configuration events
  settingsChange: (userId: string, orgId: string, settingType: string, oldValue: any, newValue: any) =>
    auditLog({
      event: 'config.settings_changed',
      category: 'configuration',
      actor_id: userId,
      org_id: orgId,
      resource_type: 'settings',
      resource_id: settingType,
      old_values: { [settingType]: oldValue },
      new_values: { [settingType]: newValue },
      risk_score: 20,
    }),
  
  // Security events
  securityPolicyChange: (userId: string, orgId: string, policyType: string, metadata?: any) =>
    auditLog({
      event: 'security.policy_changed',
      category: 'security',
      actor_id: userId,
      org_id: orgId,
      resource_type: 'security_policy',
      resource_id: policyType,
      metadata,
      risk_score: 60,
    }),
  
  // Billing events
  planChange: (userId: string, orgId: string, oldPlan: string, newPlan: string, metadata?: any) =>
    auditLog({
      event: 'billing.plan_changed',
      category: 'configuration',
      actor_id: userId,
      org_id: orgId,
      resource_type: 'subscription',
      old_values: { plan: oldPlan },
      new_values: { plan: newPlan },
      metadata,
      risk_score: 30,
    }),
};

// Audit middleware for API routes
export function withAuditLogging(eventType: string, options: {
  category?: string;
  highRisk?: boolean;
  extractMetadata?: (req: any, res: any) => any;
} = {}) {
  return function(target: any, propertyKey: string, descriptor: PropertyDescriptor) {
    const originalMethod = descriptor.value;
    
    descriptor.value = async function(...args: any[]) {
      const startTime = Date.now();
      let response;
      let error;
      
      try {
        response = await originalMethod.apply(this, args);
        return response;
      } catch (e) {
        error = e;
        throw e;
      } finally {
        // Log after response (non-blocking)
        setImmediate(async () => {
          try {
            const [req] = args;
            const metadata = {
              method: req.method,
              path: req.url,
              duration_ms: Date.now() - startTime,
              status: response?.status || (error ? 500 : 200),
              ...(options.extractMetadata ? options.extractMetadata(req, response) : {}),
            };
            
            await auditLog({
              event: eventType,
              category: options.category as any,
              actor_id: req.user?.id,
              org_id: req.user?.org_id,
              metadata,
              success: !error,
              error_message: error?.message,
              risk_score: options.highRisk ? 60 : undefined,
            });
          } catch (auditError) {
            console.error('Audit logging failed in middleware:', auditError);
          }
        });
      }
    };
    
    return descriptor;
  };
}