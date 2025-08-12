import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { handleSSOCallback, createMockSSOProfile, SSO_MOCK_MODE } from '@/lib/workos';
import { audit } from '@/lib/audit';

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const code = searchParams.get('code');
  const state = searchParams.get('state');
  const error = searchParams.get('error');
  
  // Handle mock SSO for development
  const isMock = searchParams.get('mock') === 'true';
  const mockOrg = searchParams.get('org');
  const mockEmail = searchParams.get('email');
  
  if (error) {
    console.error('SSO error:', error);
    await audit.loginFailed(
      'unknown', 
      `SSO provider error: ${error}`,
      { provider: 'sso', sso_error: error }
    );
    
    return NextResponse.redirect(
      `${process.env.NEXT_PUBLIC_APP_URL}/login?error=sso_failed`
    );
  }
  
  if (!code && !isMock) {
    await audit.loginFailed(
      'unknown',
      'Missing authorization code from SSO provider',
      { provider: 'sso' }
    );
    
    return NextResponse.redirect(
      `${process.env.NEXT_PUBLIC_APP_URL}/login?error=missing_code`
    );
  }
  
  try {
    const supabase = createClient();
    let profile;
    
    // Handle mock SSO for development
    if (isMock && SSO_MOCK_MODE && mockOrg && mockEmail) {
      profile = createMockSSOProfile(mockEmail, mockOrg);
      console.log('Using mock SSO profile for development:', profile.email);
    } else if (code) {
      // Real SSO callback
      profile = await handleSSOCallback(code);
    } else {
      throw new Error('Invalid SSO callback parameters');
    }
    
    // Find or create user and SSO mapping
    let { data: ssoMapping } = await supabase
      .from('sso_user_mappings')
      .select('user_id, org_id, organizations(name)')
      .eq('external_id', profile.id)
      .eq('email', profile.email)
      .single();
    
    let userId: string;
    let orgId: string;
    let orgName: string;
    
    if (!ssoMapping) {
      // Find organization by SSO connection ID or domain
      let org;
      
      if (profile.connectionId && !isMock) {
        const { data: orgByConnection } = await supabase
          .from('organizations')
          .select('id, name')
          .eq('sso_connection_id', profile.connectionId)
          .single();
        org = orgByConnection;
      }
      
      // Fallback: find by email domain for mock or if connection lookup failed
      if (!org) {
        const domain = profile.email.split('@')[1];
        const { data: orgByDomain } = await supabase
          .from('organizations')
          .select('id, name')
          .ilike('name', `%${domain}%`)
          .single();
        org = orgByDomain;
      }
      
      if (!org) {
        await audit.loginFailed(
          profile.email,
          'No organization found for SSO user',
          { 
            provider: 'sso',
            connection_id: profile.connectionId,
            email_domain: profile.email.split('@')[1]
          }
        );
        
        return NextResponse.redirect(
          `${process.env.NEXT_PUBLIC_APP_URL}/login?error=org_not_found`
        );
      }
      
      // Check if SSO is enabled for this organization
      const { data: ssoEnabled } = await supabase.rpc('is_feature_enabled', {
        org_uuid: org.id,
        flag_name_param: 'sso_enabled'
      });
      
      if (!ssoEnabled && !isMock) {
        await audit.loginFailed(
          profile.email,
          'SSO not enabled for organization',
          { 
            provider: 'sso',
            org_id: org.id,
            org_name: org.name
          }
        );
        
        return NextResponse.redirect(
          `${process.env.NEXT_PUBLIC_APP_URL}/login?error=sso_not_enabled`
        );
      }
      
      // Create new user
      const { data: authUser, error: authError } = await supabase.auth.admin.createUser({
        email: profile.email,
        email_confirm: true,
        user_metadata: {
          full_name: `${profile.firstName || ''} ${profile.lastName || ''}`.trim(),
          sso_provisioned: true,
          provider: isMock ? 'mock_sso' : 'workos',
        },
      });
      
      if (authError) {
        await audit.loginFailed(
          profile.email,
          `User creation failed: ${authError.message}`,
          { provider: 'sso', org_id: org.id }
        );
        throw authError;
      }
      
      userId = authUser.user.id;
      orgId = org.id;
      orgName = org.name;
      
      // Create SSO mapping
      await supabase.from('sso_user_mappings').insert({
        org_id: orgId,
        external_id: profile.id,
        user_id: userId,
        email: profile.email,
        display_name: `${profile.firstName || ''} ${profile.lastName || ''}`.trim(),
        attributes: {
          ...profile.rawAttributes,
          connection_type: profile.connectionType,
          first_login: new Date().toISOString(),
        },
      });
      
      // Add user to organization with default role
      const { data: orgSettings } = await supabase
        .from('organizations')
        .select('sso_default_role')
        .eq('id', orgId)
        .single();
      
      await supabase.from('organization_members').insert({
        user_id: userId,
        org_id: orgId,
        role: orgSettings?.sso_default_role || 'member',
        joined_via: 'sso',
      });
      
      await audit.auditLog({
        event: 'user.sso_created',
        category: 'authentication',
        actor_id: userId,
        org_id: orgId,
        metadata: {
          email: profile.email,
          provider: isMock ? 'mock_sso' : 'workos',
          connection_id: profile.connectionId,
          first_login: true,
        },
      });
      
    } else {
      userId = ssoMapping.user_id;
      orgId = ssoMapping.org_id;
      orgName = ssoMapping.organizations?.name || 'Unknown';
      
      // Update last login
      await supabase
        .from('sso_user_mappings')
        .update({ 
          updated_at: new Date().toISOString(),
          attributes: {
            ...profile.rawAttributes,
            last_login: new Date().toISOString(),
          }
        })
        .eq('id', ssoMapping.id);
    }
    
    // Create SSO session
    const sessionToken = require('crypto').randomBytes(32).toString('hex');
    const expiresAt = new Date();
    expiresAt.setHours(expiresAt.getHours() + 8); // 8 hour session
    
    await supabase.from('sso_sessions').insert({
      user_id: userId,
      org_id: orgId,
      session_token: sessionToken,
      idp_session_id: profile.id,
      provider: isMock ? 'mock' : 'workos',
      expires_at: expiresAt.toISOString(),
      ip_address: request.ip || 'unknown',
      user_agent: request.headers.get('user-agent') || 'unknown',
    });
    
    // Sign in user with Supabase
    const { data: sessionData, error: sessionError } = await supabase.auth.admin.generateLink({
      type: 'magiclink',
      email: profile.email,
    });
    
    if (sessionError) {
      throw new Error(`Session creation failed: ${sessionError.message}`);
    }
    
    // Create response with redirect
    const response = NextResponse.redirect(
      `${process.env.NEXT_PUBLIC_APP_URL}/dashboard`
    );
    
    // Set SSO session cookie
    response.cookies.set('sso_session', sessionToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      expires: expiresAt,
      path: '/',
    });
    
    // Set Supabase session cookies
    if (sessionData.properties?.action_link) {
      const url = new URL(sessionData.properties.action_link);
      const accessToken = url.searchParams.get('access_token');
      const refreshToken = url.searchParams.get('refresh_token');
      
      if (accessToken && refreshToken) {
        response.cookies.set('sb-access-token', accessToken, {
          httpOnly: true,
          secure: process.env.NODE_ENV === 'production',
          sameSite: 'lax',
          maxAge: 3600, // 1 hour
          path: '/',
        });
        
        response.cookies.set('sb-refresh-token', refreshToken, {
          httpOnly: true,
          secure: process.env.NODE_ENV === 'production',
          sameSite: 'lax',
          maxAge: 60 * 60 * 24 * 7, // 7 days
          path: '/',
        });
      }
    }
    
    // Audit successful login
    await audit.ssoLogin(userId, orgId, isMock ? 'mock' : 'workos', {
      ip: request.ip,
      user_agent: request.headers.get('user-agent'),
      org_name: orgName,
      connection_id: profile.connectionId,
      session_duration_hours: 8,
    });
    
    return response;
    
  } catch (error) {
    console.error('SSO callback error:', error);
    
    // Audit failed login
    await audit.loginFailed(
      searchParams.get('email') || 'unknown',
      error.message,
      {
        provider: 'sso',
        code: code?.substring(0, 10) + '...',
        mock: isMock,
        stack: error.stack?.substring(0, 500),
      }
    );
    
    return NextResponse.redirect(
      `${process.env.NEXT_PUBLIC_APP_URL}/login?error=sso_error`
    );
  }
}