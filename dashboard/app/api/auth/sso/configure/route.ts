import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createSSOConnection, validateSSOConfiguration } from '@/lib/workos';
import { audit } from '@/lib/audit';

export async function POST(request: NextRequest) {
  try {
    const { org_id, enable, domain } = await request.json();
    
    if (!org_id) {
      return NextResponse.json(
        { error: 'Organization ID required' },
        { status: 400 }
      );
    }
    
    const supabase = createClient();
    
    // Get current user and verify permissions
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }
    
    // Verify user is admin of this organization
    const { data: membership } = await supabase
      .from('organization_members')
      .select('role, organizations(name, domain)')
      .eq('user_id', user.id)
      .eq('org_id', org_id)
      .single();
    
    if (!membership || !['owner', 'admin'].includes(membership.role)) {
      await audit.auditLog({
        event: 'auth.unauthorized_sso_config',
        category: 'security',
        actor_id: user.id,
        org_id,
        success: false,
        error_message: 'Insufficient permissions for SSO configuration',
        risk_score: 60,
      });
      
      return NextResponse.json(
        { error: 'Insufficient permissions' },
        { status: 403 }
      );
    }
    
    if (enable) {
      // Enabling SSO
      
      // Check if WorkOS is properly configured
      const config = validateSSOConfiguration();
      if (!config.isValid) {
        return NextResponse.json({
          error: 'SSO not configured on server',
          details: {
            missing: config.missingConfig,
            warnings: config.warnings,
            canMock: process.env.NODE_ENV === 'development',
          }
        }, { status: 503 });
      }
      
      let connectionId: string;
      let loginUrl: string;
      let setupUrl: string | undefined;
      
      // Create SSO connection if WorkOS is available
      try {
        const orgDomain = domain || membership.organizations?.domain || 
                         user.email?.split('@')[1] || 'example.com';
        
        const connection = await createSSOConnection({
          id: org_id,
          name: membership.organizations?.name || 'Organization',
          domain: orgDomain,
        });
        
        connectionId = connection.connectionId;
        loginUrl = connection.loginUrl;
        setupUrl = connection.setupUrl;
        
      } catch (error) {
        // If WorkOS fails, still allow enabling for development/testing
        if (process.env.NODE_ENV === 'development') {
          connectionId = `dev_connection_${org_id}`;
          loginUrl = `${process.env.NEXT_PUBLIC_APP_URL}/api/auth/sso/callback?mock=true&org=${org_id}&email=test@${domain || 'example.com'}`;
          setupUrl = undefined;
        } else {
          throw error;
        }
      }
      
      // Update organization with SSO settings
      const { error: updateError } = await supabase
        .from('organizations')
        .update({
          sso_enabled: true,
          sso_provider: 'workos',
          sso_connection_id: connectionId,
          sso_default_role: 'member',
        })
        .eq('id', org_id);
      
      if (updateError) {
        throw new Error(`Failed to update organization: ${updateError.message}`);
      }
      
      // Enable SSO feature flag for this organization
      await supabase.from('organization_feature_flags').upsert({
        org_id,
        flag_name: 'sso_enabled',
        enabled: true,
      });
      
      await audit.securityPolicyChange(
        user.id,
        org_id,
        'sso_enabled',
        {
          connection_id: connectionId,
          provider: 'workos',
          domain: domain || membership.organizations?.domain,
        }
      );
      
      return NextResponse.json({
        success: true,
        connection_id: connectionId,
        login_url: loginUrl,
        setup_url: setupUrl,
        mock_mode: process.env.NODE_ENV === 'development' && !config.isValid,
      });
      
    } else {
      // Disabling SSO
      
      // Update organization
      const { error: updateError } = await supabase
        .from('organizations')
        .update({
          sso_enabled: false,
          sso_provider: null,
          sso_connection_id: null,
        })
        .eq('id', org_id);
      
      if (updateError) {
        throw new Error(`Failed to update organization: ${updateError.message}`);
      }
      
      // Disable SSO feature flag
      await supabase.from('organization_feature_flags').upsert({
        org_id,
        flag_name: 'sso_enabled',
        enabled: false,
      });
      
      // Invalidate existing SSO sessions
      await supabase
        .from('sso_sessions')
        .update({ expires_at: new Date().toISOString() })
        .eq('org_id', org_id);
      
      await audit.securityPolicyChange(
        user.id,
        org_id,
        'sso_disabled',
        {
          reason: 'admin_disabled',
        }
      );
      
      return NextResponse.json({
        success: true,
        enabled: false,
      });
    }
    
  } catch (error) {
    console.error('SSO configuration error:', error);
    
    const { org_id } = await request.json().catch(() => ({}));
    
    await audit.auditLog({
      event: 'config.sso_setup_failed',
      category: 'security',
      org_id,
      success: false,
      error_message: error.message,
      risk_score: 40,
    });
    
    return NextResponse.json(
      { 
        error: 'SSO configuration failed',
        details: error.message,
      },
      { status: 500 }
    );
  }
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const org_id = searchParams.get('org_id');
    
    if (!org_id) {
      return NextResponse.json(
        { error: 'Organization ID required' },
        { status: 400 }
      );
    }
    
    const supabase = createClient();
    
    // Get current user
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }
    
    // Verify access to organization
    const { data: membership } = await supabase
      .from('organization_members')
      .select('role')
      .eq('user_id', user.id)
      .eq('org_id', org_id)
      .single();
    
    if (!membership) {
      return NextResponse.json(
        { error: 'Access denied' },
        { status: 403 }
      );
    }
    
    // Get organization SSO settings
    const { data: org } = await supabase
      .from('organizations')
      .select('sso_enabled, sso_provider, sso_connection_id, sso_default_role')
      .eq('id', org_id)
      .single();
    
    if (!org) {
      return NextResponse.json(
        { error: 'Organization not found' },
        { status: 404 }
      );
    }
    
    // Check feature flag status
    const { data: featureEnabled } = await supabase.rpc('is_feature_enabled', {
      org_uuid: org_id,
      flag_name_param: 'sso_enabled'
    });
    
    // Get recent SSO activity
    const { data: recentSessions } = await supabase
      .from('sso_sessions')
      .select('created_at, provider, ip_address')
      .eq('org_id', org_id)
      .order('created_at', { ascending: false })
      .limit(5);
    
    const config = validateSSOConfiguration();
    
    return NextResponse.json({
      enabled: org.sso_enabled && featureEnabled,
      provider: org.sso_provider,
      connection_id: org.sso_connection_id,
      default_role: org.sso_default_role,
      recent_sessions: recentSessions,
      server_config: {
        available: config.isValid,
        missing: config.missingConfig,
        warnings: config.warnings,
      },
      login_url: org.sso_connection_id ? 
        `${process.env.NEXT_PUBLIC_APP_URL}/api/auth/sso/login/${org_id}` : 
        null,
    });
    
  } catch (error) {
    console.error('SSO status error:', error);
    
    return NextResponse.json(
      { error: 'Failed to get SSO status' },
      { status: 500 }
    );
  }
}