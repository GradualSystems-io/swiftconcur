import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { audit } from '@/lib/audit';
import crypto from 'crypto';

export async function POST(request: NextRequest) {
  try {
    const { org_id } = await request.json();
    
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
      .select('role, organizations(name)')
      .eq('user_id', user.id)
      .eq('org_id', org_id)
      .single();
    
    if (!membership || !['owner', 'admin'].includes(membership.role)) {
      await audit.auditLog({
        event: 'auth.unauthorized_scim_token',
        category: 'security',
        actor_id: user.id,
        org_id,
        success: false,
        error_message: 'Insufficient permissions for SCIM token generation',
        risk_score: 60,
      });
      
      return NextResponse.json(
        { error: 'Insufficient permissions' },
        { status: 403 }
      );
    }
    
    // Check if SCIM is enabled for this organization
    const { data: scimEnabled } = await supabase.rpc('is_feature_enabled', {
      org_uuid: org_id,
      flag_name_param: 'scim_enabled'
    });
    
    if (!scimEnabled) {
      return NextResponse.json(
        { error: 'SCIM not enabled for this organization' },
        { status: 403 }
      );
    }
    
    // Generate secure SCIM token
    const token = crypto.randomBytes(32).toString('hex');
    const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
    
    // Revoke any existing SCIM token
    await supabase
      .from('organizations')
      .update({ scim_token_hash: null })
      .eq('id', org_id);
    
    // Store new token hash
    const { error: updateError } = await supabase
      .from('organizations')
      .update({
        scim_token_hash: tokenHash,
        scim_enabled: true,
      })
      .eq('id', org_id);
    
    if (updateError) {
      throw new Error(`Failed to store SCIM token: ${updateError.message}`);
    }
    
    // Enable SCIM feature flag for this organization
    await supabase.from('organization_feature_flags').upsert({
      org_id,
      flag_name: 'scim_enabled',
      enabled: true,
    });
    
    // Audit the token generation
    await audit.securityPolicyChange(
      user.id,
      org_id,
      'scim_token_generated',
      {
        org_name: membership.organizations?.name,
        token_prefix: token.substring(0, 8) + '...',
      }
    );
    
    return NextResponse.json({
      success: true,
      token,
      scim_url: `${process.env.NEXT_PUBLIC_APP_URL}/api/scim/v2`,
      endpoints: {
        users: `${process.env.NEXT_PUBLIC_APP_URL}/api/scim/v2/Users`,
        groups: `${process.env.NEXT_PUBLIC_APP_URL}/api/scim/v2/Groups`,
      },
      instructions: {
        authentication: 'Use Bearer token authentication',
        content_type: 'application/scim+json',
        supported_operations: [
          'GET /Users (list users)',
          'GET /Users/{id} (get user)',
          'POST /Users (create user)',
          'PUT /Users/{id} (update user)',
          'PATCH /Users/{id} (partial update)',
          'DELETE /Users/{id} (deactivate user)',
        ],
      },
      warning: 'Save this token securely - it will not be displayed again',
    });
    
  } catch (error) {
    console.error('SCIM token generation error:', error);
    
    const { org_id } = await request.json().catch(() => ({}));
    
    await audit.auditLog({
      event: 'config.scim_token_failed',
      category: 'security',
      org_id,
      success: false,
      error_message: error.message,
      risk_score: 40,
    });
    
    return NextResponse.json(
      { 
        error: 'SCIM token generation failed',
        details: error.message,
      },
      { status: 500 }
    );
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const { org_id } = await request.json();
    
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
      .select('role')
      .eq('user_id', user.id)
      .eq('org_id', org_id)
      .single();
    
    if (!membership || !['owner', 'admin'].includes(membership.role)) {
      return NextResponse.json(
        { error: 'Insufficient permissions' },
        { status: 403 }
      );
    }
    
    // Revoke SCIM token
    const { error: updateError } = await supabase
      .from('organizations')
      .update({
        scim_token_hash: null,
        scim_enabled: false,
      })
      .eq('id', org_id);
    
    if (updateError) {
      throw new Error(`Failed to revoke SCIM token: ${updateError.message}`);
    }
    
    // Disable SCIM feature flag
    await supabase.from('organization_feature_flags').upsert({
      org_id,
      flag_name: 'scim_enabled',
      enabled: false,
    });
    
    // Audit the token revocation
    await audit.securityPolicyChange(
      user.id,
      org_id,
      'scim_token_revoked',
      {
        reason: 'admin_requested',
      }
    );
    
    return NextResponse.json({
      success: true,
      message: 'SCIM token revoked successfully',
    });
    
  } catch (error) {
    console.error('SCIM token revocation error:', error);
    
    return NextResponse.json(
      { 
        error: 'SCIM token revocation failed',
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
    
    // Get current user and verify permissions
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }
    
    // Verify user has access to this organization
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
    
    // Get organization SCIM settings
    const { data: org } = await supabase
      .from('organizations')
      .select('scim_enabled, scim_token_hash')
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
      flag_name_param: 'scim_enabled'
    });
    
    // Get recent SCIM operations for status
    const { data: recentOperations } = await supabase
      .from('scim_operations')
      .select('operation, resource_type, status, created_at')
      .eq('org_id', org_id)
      .order('created_at', { ascending: false })
      .limit(10);
    
    return NextResponse.json({
      enabled: org.scim_enabled && featureEnabled,
      has_token: Boolean(org.scim_token_hash),
      scim_url: `${process.env.NEXT_PUBLIC_APP_URL}/api/scim/v2`,
      recent_operations: recentOperations,
      supported_resources: ['Users'],
      supported_operations: {
        Users: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'],
      },
    });
    
  } catch (error) {
    console.error('SCIM status error:', error);
    
    return NextResponse.json(
      { error: 'Failed to get SCIM status' },
      { status: 500 }
    );
  }
}