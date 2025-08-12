import { WorkOS } from '@workos-inc/node';

// WorkOS Configuration - Safe to use in development with feature flags
export const WORKOS_CONFIG = {
  apiKey: process.env.WORKOS_API_KEY || '',
  clientId: process.env.WORKOS_CLIENT_ID || '',
  redirectUri: `${process.env.NEXT_PUBLIC_APP_URL}/api/auth/sso/callback`,
  baseUrl: process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000',
};

// Initialize WorkOS client only if credentials are available
let workosClient: WorkOS | null = null;

export function getWorkOSClient(): WorkOS {
  if (!workosClient && WORKOS_CONFIG.apiKey) {
    workosClient = new WorkOS(WORKOS_CONFIG.apiKey);
  }
  
  if (!workosClient) {
    throw new Error('WorkOS not configured - add WORKOS_API_KEY and WORKOS_CLIENT_ID to environment');
  }
  
  return workosClient;
}

// Type definitions for SSO
export interface SSOProfile {
  id: string;
  email: string;
  firstName?: string;
  lastName?: string;
  rawAttributes: Record<string, any>;
  connectionId: string;
  organizationId: string;
  connectionType: 'SAML' | 'OIDC' | 'GoogleOAuth' | 'MicrosoftOAuth';
}

export interface SSOConnection {
  id: string;
  name: string;
  connectionType: string;
  state: 'active' | 'inactive' | 'setup';
  domains: string[];
}

// SSO Connection Management
export async function createSSOConnection(org: {
  id: string;
  name: string;
  domain: string;
}): Promise<{ connectionId: string; loginUrl: string; setupUrl?: string }> {
  try {
    const workos = getWorkOSClient();
    
    const connection = await workos.sso.createConnection({
      name: `${org.name} SSO`,
      domains: [org.domain],
    });
    
    return {
      connectionId: connection.id,
      loginUrl: getAuthorizationUrl(connection.id),
      setupUrl: `https://dashboard.workos.com/sso/connections/${connection.id}`,
    };
  } catch (error) {
    console.error('Failed to create SSO connection:', error);
    throw new Error(`SSO connection creation failed: ${error.message}`);
  }
}

export function getAuthorizationUrl(
  connectionId: string,
  state?: string
): string {
  if (!WORKOS_CONFIG.clientId) {
    throw new Error('WorkOS client ID not configured');
  }
  
  const workos = getWorkOSClient();
  
  return workos.sso.getAuthorizationUrl({
    clientId: WORKOS_CONFIG.clientId,
    connection: connectionId,
    redirectUri: WORKOS_CONFIG.redirectUri,
    state: state || generateSecureState(),
  });
}

export async function handleSSOCallback(code: string): Promise<SSOProfile> {
  try {
    const workos = getWorkOSClient();
    
    const { profile } = await workos.sso.getProfileAndToken({
      clientId: WORKOS_CONFIG.clientId,
      code,
    });
    
    return {
      id: profile.id,
      email: profile.email,
      firstName: profile.firstName,
      lastName: profile.lastName,
      rawAttributes: profile.rawAttributes,
      connectionId: profile.connectionId,
      organizationId: profile.organizationId || '',
      connectionType: profile.connectionType as any,
    };
  } catch (error) {
    console.error('SSO callback error:', error);
    throw new Error(`SSO authentication failed: ${error.message}`);
  }
}

// SCIM Token Management
export async function createSCIMToken(organizationId: string): Promise<string> {
  try {
    const workos = getWorkOSClient();
    
    // Generate a secure token for SCIM
    const token = await workos.directory.createDirectoryToken({
      organizationId,
    });
    
    return token.token;
  } catch (error) {
    console.error('SCIM token creation error:', error);
    throw new Error(`SCIM token creation failed: ${error.message}`);
  }
}

// Utility Functions
function generateSecureState(): string {
  const crypto = require('crypto');
  return crypto.randomBytes(32).toString('hex');
}

export async function listSSOConnections(organizationId?: string): Promise<SSOConnection[]> {
  try {
    const workos = getWorkOSClient();
    
    const { data: connections } = await workos.sso.listConnections({
      organizationId,
      limit: 100,
    });
    
    return connections.map(conn => ({
      id: conn.id,
      name: conn.name,
      connectionType: conn.connectionType,
      state: conn.state as any,
      domains: conn.domains,
    }));
  } catch (error) {
    console.error('Failed to list SSO connections:', error);
    return [];
  }
}

// Feature Flag Integration
export async function isSSOEnabled(orgId: string): Promise<boolean> {
  // This will check both global and org-specific feature flags
  try {
    const { createClient } = require('@/lib/supabase/server');
    const supabase = createClient();
    
    const { data } = await supabase.rpc('is_feature_enabled', {
      org_uuid: orgId,
      flag_name_param: 'sso_enabled'
    });
    
    return Boolean(data);
  } catch (error) {
    console.error('Feature flag check failed:', error);
    return false;
  }
}

export async function isSCIMEnabled(orgId: string): Promise<boolean> {
  try {
    const { createClient } = require('@/lib/supabase/server');
    const supabase = createClient();
    
    const { data } = await supabase.rpc('is_feature_enabled', {
      org_uuid: orgId,
      flag_name_param: 'scim_enabled'
    });
    
    return Boolean(data);
  } catch (error) {
    console.error('Feature flag check failed:', error);
    return false;
  }
}

// Validation helpers
export function validateSSOConfiguration(): {
  isValid: boolean;
  missingConfig: string[];
  warnings: string[];
} {
  const missing: string[] = [];
  const warnings: string[] = [];
  
  if (!WORKOS_CONFIG.apiKey) {
    missing.push('WORKOS_API_KEY');
  }
  
  if (!WORKOS_CONFIG.clientId) {
    missing.push('WORKOS_CLIENT_ID');
  }
  
  if (!WORKOS_CONFIG.baseUrl || WORKOS_CONFIG.baseUrl === 'http://localhost:3000') {
    warnings.push('Using localhost URL - update NEXT_PUBLIC_APP_URL for production');
  }
  
  return {
    isValid: missing.length === 0,
    missingConfig: missing,
    warnings,
  };
}

// Mock mode for development
export const SSO_MOCK_MODE = process.env.NODE_ENV === 'development' && !WORKOS_CONFIG.apiKey;

export function createMockSSOProfile(email: string, orgId: string): SSOProfile {
  return {
    id: `mock_${Date.now()}`,
    email,
    firstName: 'Test',
    lastName: 'User',
    rawAttributes: { mock: true },
    connectionId: `mock_connection_${orgId}`,
    organizationId: orgId,
    connectionType: 'SAML',
  };
}

// Development helpers
export function getSSOMockLoginUrl(orgId: string, email?: string): string {
  const params = new URLSearchParams({
    mock: 'true',
    org: orgId,
    ...(email && { email }),
  });
  
  return `${WORKOS_CONFIG.baseUrl}/api/auth/sso/callback?${params}`;
}