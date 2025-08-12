import { createClient } from '@/lib/supabase/server';
import { NextRequest } from 'next/server';
import rateLimit from 'express-rate-limit';

// Rate limiting configuration for billing endpoints
export const billingRateLimit = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 10, // Max 10 requests per window per IP
  message: 'Too many billing requests from this IP, please try again later.',
  standardHeaders: true,
  legacyHeaders: false,
});

// Security headers for billing responses
export const securityHeaders = {
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
  'X-XSS-Protection': '1; mode=block',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'Content-Security-Policy': "default-src 'self'",
};

// Validate user authentication and authorization
export async function validateBillingAccess(request: NextRequest): Promise<{
  user: any;
  error?: string;
  status?: number;
}> {
  const supabase = createClient();
  
  try {
    // Check authentication
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    
    if (authError || !user) {
      return {
        user: null,
        error: 'Authentication required',
        status: 401,
      };
    }
    
    // Validate user account status
    if (!user.email_confirmed_at) {
      return {
        user: null,
        error: 'Email verification required',
        status: 403,
      };
    }
    
    // Check for banned or suspended accounts
    const { data: userProfile } = await supabase
      .from('users')
      .select('status, banned_at')
      .eq('id', user.id)
      .single();
    
    if (userProfile?.status === 'banned' || userProfile?.banned_at) {
      return {
        user: null,
        error: 'Account suspended',
        status: 403,
      };
    }
    
    return { user };
    
  } catch (error) {
    console.error('Billing access validation error:', error);
    return {
      user: null,
      error: 'Authentication failed',
      status: 500,
    };
  }
}

// Validate subscription ownership
export async function validateSubscriptionOwnership(
  subscriptionId: string,
  userId: string
): Promise<boolean> {
  const supabase = createClient();
  
  try {
    const { data: subscription } = await supabase
      .from('subscriptions')
      .select('user_id')
      .eq('id', subscriptionId)
      .single();
    
    return subscription?.user_id === userId;
  } catch (error) {
    console.error('Subscription ownership validation error:', error);
    return false;
  }
}

// Input validation for billing data
export function validateBillingInput(data: any): {
  isValid: boolean;
  errors: string[];
} {
  const errors: string[] = [];
  
  // Validate plan ID
  if (data.planId && typeof data.planId !== 'string') {
    errors.push('Plan ID must be a string');
  }
  
  if (data.planId && !['free', 'pro', 'enterprise'].includes(data.planId)) {
    errors.push('Invalid plan ID');
  }
  
  // Validate URLs
  if (data.successUrl && !isValidUrl(data.successUrl)) {
    errors.push('Invalid success URL');
  }
  
  if (data.cancelUrl && !isValidUrl(data.cancelUrl)) {
    errors.push('Invalid cancel URL');
  }
  
  // Validate action types
  if (data.action && !['cancel', 'reactivate', 'portal'].includes(data.action)) {
    errors.push('Invalid action type');
  }
  
  return {
    isValid: errors.length === 0,
    errors,
  };
}

// URL validation helper
function isValidUrl(url: string): boolean {
  try {
    const urlObj = new URL(url);
    return ['http:', 'https:'].includes(urlObj.protocol);
  } catch {
    return false;
  }
}

// Sanitize sensitive data from logs
export function sanitizeLogData(data: any): any {
  const sensitiveFields = [
    'stripe_secret_key',
    'stripe_publishable_key',
    'webhook_secret',
    'customer_id',
    'subscription_id',
    'payment_method',
    'card',
    'bank_account',
  ];
  
  const sanitized = { ...data };
  
  function recursiveSanitize(obj: any, path = ''): void {
    if (typeof obj !== 'object' || obj === null) return;
    
    for (const [key, value] of Object.entries(obj)) {
      const fullPath = path ? `${path}.${key}` : key;
      
      if (sensitiveFields.some(field => key.toLowerCase().includes(field.toLowerCase()))) {
        obj[key] = '[REDACTED]';
      } else if (typeof value === 'object' && value !== null) {
        recursiveSanitize(value, fullPath);
      }
    }
  }
  
  recursiveSanitize(sanitized);
  return sanitized;
}

// Error handling for billing operations
export class BillingError extends Error {
  public readonly code: string;
  public readonly statusCode: number;
  public readonly userMessage: string;
  
  constructor(
    message: string,
    code: string,
    statusCode: number = 400,
    userMessage?: string
  ) {
    super(message);
    this.name = 'BillingError';
    this.code = code;
    this.statusCode = statusCode;
    this.userMessage = userMessage || 'A billing error occurred';
  }
}

// Common billing error codes
export const BILLING_ERROR_CODES = {
  UNAUTHORIZED: 'BILLING_UNAUTHORIZED',
  INVALID_PLAN: 'BILLING_INVALID_PLAN',
  EXISTING_SUBSCRIPTION: 'BILLING_EXISTING_SUBSCRIPTION',
  SUBSCRIPTION_NOT_FOUND: 'BILLING_SUBSCRIPTION_NOT_FOUND',
  PAYMENT_FAILED: 'BILLING_PAYMENT_FAILED',
  USAGE_LIMIT_EXCEEDED: 'BILLING_USAGE_LIMIT_EXCEEDED',
  STRIPE_ERROR: 'BILLING_STRIPE_ERROR',
  DATABASE_ERROR: 'BILLING_DATABASE_ERROR',
  VALIDATION_ERROR: 'BILLING_VALIDATION_ERROR',
} as const;

// Create standardized error responses
export function createBillingError(
  code: string,
  message: string,
  userMessage?: string,
  statusCode?: number
): BillingError {
  const status = statusCode || getStatusCodeForError(code);
  return new BillingError(message, code, status, userMessage);
}

function getStatusCodeForError(code: string): number {
  switch (code) {
    case BILLING_ERROR_CODES.UNAUTHORIZED:
      return 401;
    case BILLING_ERROR_CODES.SUBSCRIPTION_NOT_FOUND:
      return 404;
    case BILLING_ERROR_CODES.EXISTING_SUBSCRIPTION:
    case BILLING_ERROR_CODES.INVALID_PLAN:
    case BILLING_ERROR_CODES.VALIDATION_ERROR:
      return 400;
    case BILLING_ERROR_CODES.PAYMENT_FAILED:
      return 402;
    case BILLING_ERROR_CODES.USAGE_LIMIT_EXCEEDED:
      return 429;
    case BILLING_ERROR_CODES.STRIPE_ERROR:
    case BILLING_ERROR_CODES.DATABASE_ERROR:
    default:
      return 500;
  }
}

// Audit logging for billing operations
export async function auditBillingOperation(
  operation: string,
  userId: string,
  details: any,
  success: boolean,
  error?: Error
) {
  const supabase = createClient();
  
  try {
    await supabase.from('billing_audit_logs').insert({
      operation,
      user_id: userId,
      details: sanitizeLogData(details),
      success,
      error_message: error?.message,
      timestamp: new Date().toISOString(),
      ip_address: details.ipAddress || 'unknown',
      user_agent: details.userAgent || 'unknown',
    });
  } catch (auditError) {
    console.error('Failed to log billing audit:', auditError);
    // Don't throw - audit logging failures shouldn't break billing operations
  }
}

// Validate webhook timestamps to prevent replay attacks
export function validateWebhookTimestamp(
  timestamp: string,
  tolerance: number = 300 // 5 minutes
): boolean {
  const webhookTime = parseInt(timestamp) * 1000; // Convert to milliseconds
  const currentTime = Date.now();
  const timeDiff = Math.abs(currentTime - webhookTime);
  
  return timeDiff <= tolerance * 1000;
}

// Validate environment configuration
export function validateBillingEnvironment(): {
  isValid: boolean;
  errors: string[];
} {
  const errors: string[] = [];
  const requiredEnvVars = [
    'STRIPE_SECRET_KEY',
    'STRIPE_WEBHOOK_SECRET',
    'STRIPE_PRO_PRICE_ID',
    'STRIPE_ENTERPRISE_PRICE_ID',
    'NEXT_PUBLIC_APP_URL',
  ];
  
  for (const envVar of requiredEnvVars) {
    if (!process.env[envVar]) {
      errors.push(`Missing required environment variable: ${envVar}`);
    }
  }
  
  // Validate Stripe key formats
  if (process.env.STRIPE_SECRET_KEY && !process.env.STRIPE_SECRET_KEY.startsWith('sk_')) {
    errors.push('Invalid Stripe secret key format');
  }
  
  if (process.env.STRIPE_WEBHOOK_SECRET && !process.env.STRIPE_WEBHOOK_SECRET.startsWith('whsec_')) {
    errors.push('Invalid Stripe webhook secret format');
  }
  
  return {
    isValid: errors.length === 0,
    errors,
  };
}

// Initialize billing security checks
export function initializeBillingSecurity(): void {
  const { isValid, errors } = validateBillingEnvironment();
  
  if (!isValid) {
    console.error('Billing configuration errors:', errors);
    throw new Error('Invalid billing configuration. Check environment variables.');
  }
  
  console.log('✅ Billing security validation passed');
}