import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { audit } from '@/lib/audit';
import crypto from 'crypto';

// SCIM 2.0 endpoint for automatic user provisioning/deprovisioning
// Follows RFC 7644: https://tools.ietf.org/html/rfc7644

interface ScimUser {
  schemas: string[];
  id?: string;
  externalId?: string;
  userName: string;
  name?: {
    givenName?: string;
    familyName?: string;
    formatted?: string;
  };
  displayName?: string;
  emails: Array<{
    value: string;
    primary?: boolean;
    type?: string;
  }>;
  active?: boolean;
  groups?: Array<{
    value: string;
    $ref?: string;
    display?: string;
  }>;
  meta?: {
    resourceType: 'User';
    created?: string;
    lastModified?: string;
    location?: string;
    version?: string;
  };
}

interface ScimError {
  schemas: ['urn:ietf:params:scim:api:messages:2.0:Error'];
  status: string;
  detail: string;
  scimType?: string;
}

// Helper function to verify SCIM bearer token
async function verifyScimToken(authHeader: string | null): Promise<string | null> {
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return null;
  }
  
  const token = authHeader.substring(7);
  const supabase = createClient();
  
  // Find organization with this SCIM token
  const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
  
  const { data: org } = await supabase
    .from('organizations')
    .select('id, name, scim_enabled')
    .eq('scim_token_hash', tokenHash)
    .eq('scim_enabled', true)
    .single();
  
  return org?.id || null;
}

// Helper function to format user for SCIM response
function formatScimUser(user: any, orgId: string): ScimUser {
  return {
    schemas: ['urn:ietf:params:scim:schemas:core:2.0:User'],
    id: user.external_id,
    externalId: user.external_id,
    userName: user.attributes?.userName || user.email,
    name: {
      givenName: user.attributes?.firstName || user.display_name?.split(' ')[0],
      familyName: user.attributes?.lastName || user.display_name?.split(' ')[1],
      formatted: user.display_name,
    },
    displayName: user.display_name,
    emails: [{
      value: user.email,
      primary: true,
      type: 'work',
    }],
    active: user.attributes?.active !== false,
    meta: {
      resourceType: 'User',
      created: user.created_at,
      lastModified: user.updated_at,
      location: `${process.env.NEXT_PUBLIC_APP_URL}/api/scim/v2/Users/${user.external_id}`,
    },
  };
}

// Helper function to create SCIM error response
function createScimError(status: number, detail: string, scimType?: string): NextResponse {
  const error: ScimError = {
    schemas: ['urn:ietf:params:scim:api:messages:2.0:Error'],
    status: status.toString(),
    detail,
    ...(scimType && { scimType }),
  };
  
  return NextResponse.json(error, { status });
}

// Helper function to log SCIM operation
async function logScimOperation(
  orgId: string,
  operation: string,
  resourceType: string,
  resourceId: string,
  status: 'success' | 'failed',
  requestData?: any,
  responseData?: any,
  errorMessage?: string
) {
  const supabase = createClient();
  
  await supabase.from('scim_operations').insert({
    org_id: orgId,
    operation,
    resource_type: resourceType,
    resource_id: resourceId,
    external_id: resourceId,
    status,
    request_data: requestData,
    response_data: responseData,
    error_message: errorMessage,
  });
  
  // Also log in audit system
  await audit.auditLog({
    event: `scim.${operation}_${resourceType}`,
    category: 'configuration',
    org_id: orgId,
    resource_type: 'user',
    resource_id: resourceId,
    metadata: {
      scim_operation: operation,
      status,
      error: errorMessage,
    },
    success: status === 'success',
    error_message: errorMessage,
  });
}

// GET /api/scim/v2/Users or /api/scim/v2/Users/{id}
export async function GET(
  request: NextRequest,
  { params }: { params: { path: string[] } }
) {
  const [resource, id] = params.path;
  
  // Verify authentication
  const orgId = await verifyScimToken(request.headers.get('Authorization'));
  if (!orgId) {
    return createScimError(401, 'Invalid or missing bearer token');
  }
  
  const supabase = createClient();
  
  if (resource === 'Users') {
    if (id) {
      // Get specific user
      const { data: user, error } = await supabase
        .from('sso_user_mappings')
        .select('*')
        .eq('org_id', orgId)
        .eq('external_id', id)
        .single();
      
      if (error || !user) {
        await logScimOperation(orgId, 'read', 'user', id, 'failed', null, null, 'User not found');
        return createScimError(404, `User ${id} not found`, 'invalidPath');
      }
      
      const scimUser = formatScimUser(user, orgId);
      await logScimOperation(orgId, 'read', 'user', id, 'success', null, scimUser);
      
      return NextResponse.json(scimUser);
    } else {
      // List users with pagination
      const startIndex = parseInt(request.nextUrl.searchParams.get('startIndex') || '1');
      const count = Math.min(parseInt(request.nextUrl.searchParams.get('count') || '20'), 100);
      const filter = request.nextUrl.searchParams.get('filter');
      
      let query = supabase
        .from('sso_user_mappings')
        .select('*', { count: 'exact' })
        .eq('org_id', orgId)
        .range(startIndex - 1, startIndex + count - 2);
      
      // Basic filter support for emails
      if (filter && filter.includes('userName')) {
        const emailMatch = filter.match(/userName eq "([^"]+)"/);
        if (emailMatch) {
          query = query.eq('email', emailMatch[1]);
        }
      }
      
      const { data: users, error, count: totalResults } = await query;
      
      if (error) {
        await logScimOperation(orgId, 'list', 'user', 'all', 'failed', { filter }, null, error.message);
        return createScimError(500, 'Failed to retrieve users');
      }
      
      const scimUsers = users?.map(user => formatScimUser(user, orgId)) || [];
      
      const response = {
        schemas: ['urn:ietf:params:scim:api:messages:2.0:ListResponse'],
        totalResults: totalResults || 0,
        startIndex,
        itemsPerPage: scimUsers.length,
        Resources: scimUsers,
      };
      
      await logScimOperation(orgId, 'list', 'user', 'all', 'success', { filter, startIndex, count }, response);
      
      return NextResponse.json(response);
    }
  }
  
  return createScimError(404, `Resource ${resource} not found`, 'invalidPath');
}

// POST /api/scim/v2/Users
export async function POST(
  request: NextRequest,
  { params }: { params: { path: string[] } }
) {
  const [resource] = params.path;
  
  if (resource !== 'Users') {
    return createScimError(400, `Resource ${resource} not supported`, 'invalidPath');
  }
  
  // Verify authentication
  const orgId = await verifyScimToken(request.headers.get('Authorization'));
  if (!orgId) {
    return createScimError(401, 'Invalid or missing bearer token');
  }
  
  try {
    const body: ScimUser = await request.json();
    const supabase = createClient();
    
    // Validate required fields
    if (!body.userName || !body.emails?.[0]?.value) {
      await logScimOperation(orgId, 'create', 'user', body.externalId || 'unknown', 'failed', body, null, 'Missing required fields');
      return createScimError(400, 'Missing required fields: userName and emails are required', 'invalidValue');
    }
    
    const email = body.emails[0].value;
    const externalId = body.externalId || body.id || `scim_${Date.now()}`;
    
    // Check if user already exists
    const { data: existingUser } = await supabase
      .from('sso_user_mappings')
      .select('external_id')
      .eq('org_id', orgId)
      .or(`external_id.eq.${externalId},email.eq.${email}`)
      .single();
    
    if (existingUser) {
      await logScimOperation(orgId, 'create', 'user', externalId, 'failed', body, null, 'User already exists');
      return createScimError(409, `User with email ${email} already exists`, 'uniqueness');
    }
    
    // Create Supabase auth user
    const { data: authUser, error: authError } = await supabase.auth.admin.createUser({
      email,
      email_confirm: true,
      user_metadata: {
        full_name: body.name?.formatted || body.displayName || `${body.name?.givenName || ''} ${body.name?.familyName || ''}`.trim(),
        scim_provisioned: true,
        external_id: externalId,
      },
    });
    
    if (authError) {
      await logScimOperation(orgId, 'create', 'user', externalId, 'failed', body, null, authError.message);
      return createScimError(500, `Failed to create user: ${authError.message}`);
    }
    
    // Create SSO mapping
    const { data: ssoMapping, error: mappingError } = await supabase
      .from('sso_user_mappings')
      .insert({
        org_id: orgId,
        external_id: externalId,
        user_id: authUser.user.id,
        email,
        display_name: body.name?.formatted || body.displayName,
        attributes: {
          userName: body.userName,
          firstName: body.name?.givenName,
          lastName: body.name?.familyName,
          active: body.active !== false,
          scim_provisioned: true,
          schemas: body.schemas,
        },
      })
      .select()
      .single();
    
    if (mappingError) {
      // Cleanup auth user if mapping failed
      await supabase.auth.admin.deleteUser(authUser.user.id);
      await logScimOperation(orgId, 'create', 'user', externalId, 'failed', body, null, mappingError.message);
      return createScimError(500, `Failed to create user mapping: ${mappingError.message}`);
    }
    
    // Add user to organization
    await supabase.from('organization_members').insert({
      user_id: authUser.user.id,
      org_id: orgId,
      role: 'member', // Default role for SCIM provisioned users
      joined_via: 'scim',
    });
    
    const scimUser = formatScimUser(ssoMapping, orgId);
    await logScimOperation(orgId, 'create', 'user', externalId, 'success', body, scimUser);
    
    return NextResponse.json(scimUser, { status: 201 });
    
  } catch (error) {
    console.error('SCIM create user error:', error);
    await logScimOperation(orgId, 'create', 'user', 'unknown', 'failed', null, null, error.message);
    return createScimError(500, `Internal server error: ${error.message}`);
  }
}

// PUT /api/scim/v2/Users/{id}
export async function PUT(
  request: NextRequest,
  { params }: { params: { path: string[] } }
) {
  const [resource, id] = params.path;
  
  if (resource !== 'Users' || !id) {
    return createScimError(400, 'Invalid request path', 'invalidPath');
  }
  
  // Verify authentication
  const orgId = await verifyScimToken(request.headers.get('Authorization'));
  if (!orgId) {
    return createScimError(401, 'Invalid or missing bearer token');
  }
  
  try {
    const body: ScimUser = await request.json();
    const supabase = createClient();
    
    // Find existing user
    const { data: existingUser, error: findError } = await supabase
      .from('sso_user_mappings')
      .select('user_id, email, attributes')
      .eq('org_id', orgId)
      .eq('external_id', id)
      .single();
    
    if (findError || !existingUser) {
      await logScimOperation(orgId, 'update', 'user', id, 'failed', body, null, 'User not found');
      return createScimError(404, `User ${id} not found`, 'invalidPath');
    }
    
    // Update SSO mapping
    const { data: updatedUser, error: updateError } = await supabase
      .from('sso_user_mappings')
      .update({
        email: body.emails?.[0]?.value || existingUser.email,
        display_name: body.name?.formatted || body.displayName,
        attributes: {
          ...existingUser.attributes,
          userName: body.userName,
          firstName: body.name?.givenName,
          lastName: body.name?.familyName,
          active: body.active !== false,
          last_updated: new Date().toISOString(),
        },
        updated_at: new Date().toISOString(),
      })
      .eq('external_id', id)
      .eq('org_id', orgId)
      .select()
      .single();
    
    if (updateError) {
      await logScimOperation(orgId, 'update', 'user', id, 'failed', body, null, updateError.message);
      return createScimError(500, `Failed to update user: ${updateError.message}`);
    }
    
    // Update auth user metadata if needed
    if (body.name || body.displayName) {
      await supabase.auth.admin.updateUserById(existingUser.user_id, {
        user_metadata: {
          full_name: body.name?.formatted || body.displayName,
        },
      });
    }
    
    // Deactivate user if marked as inactive
    if (body.active === false) {
      await supabase.auth.admin.updateUserById(existingUser.user_id, {
        user_metadata: { deactivated: true },
      });
    }
    
    const scimUser = formatScimUser(updatedUser, orgId);
    await logScimOperation(orgId, 'update', 'user', id, 'success', body, scimUser);
    
    return NextResponse.json(scimUser);
    
  } catch (error) {
    console.error('SCIM update user error:', error);
    await logScimOperation(orgId, 'update', 'user', id, 'failed', null, null, error.message);
    return createScimError(500, `Internal server error: ${error.message}`);
  }
}

// DELETE /api/scim/v2/Users/{id}
export async function DELETE(
  request: NextRequest,
  { params }: { params: { path: string[] } }
) {
  const [resource, id] = params.path;
  
  if (resource !== 'Users' || !id) {
    return createScimError(400, 'Invalid request path', 'invalidPath');
  }
  
  // Verify authentication
  const orgId = await verifyScimToken(request.headers.get('Authorization'));
  if (!orgId) {
    return createScimError(401, 'Invalid or missing bearer token');
  }
  
  try {
    const supabase = createClient();
    
    // Find user to delete
    const { data: user, error: findError } = await supabase
      .from('sso_user_mappings')
      .select('user_id')
      .eq('org_id', orgId)
      .eq('external_id', id)
      .single();
    
    if (findError || !user) {
      await logScimOperation(orgId, 'delete', 'user', id, 'failed', null, null, 'User not found');
      return createScimError(404, `User ${id} not found`, 'invalidPath');
    }
    
    // Soft delete: deactivate user instead of hard delete
    const { error: deactivateError } = await supabase.auth.admin.updateUserById(user.user_id, {
      user_metadata: { 
        deactivated: true,
        deactivated_at: new Date().toISOString(),
        deactivation_reason: 'scim_deprovision',
      },
    });
    
    if (deactivateError) {
      await logScimOperation(orgId, 'delete', 'user', id, 'failed', null, null, deactivateError.message);
      return createScimError(500, `Failed to deactivate user: ${deactivateError.message}`);
    }
    
    // Mark as inactive in SSO mapping
    await supabase
      .from('sso_user_mappings')
      .update({
        attributes: {
          active: false,
          deactivated_at: new Date().toISOString(),
        },
        updated_at: new Date().toISOString(),
      })
      .eq('external_id', id)
      .eq('org_id', orgId);
    
    // Remove from organization (but keep user record)
    await supabase
      .from('organization_members')
      .delete()
      .eq('user_id', user.user_id)
      .eq('org_id', orgId);
    
    await logScimOperation(orgId, 'delete', 'user', id, 'success');
    
    return new NextResponse(null, { status: 204 });
    
  } catch (error) {
    console.error('SCIM delete user error:', error);
    await logScimOperation(orgId, 'delete', 'user', id, 'failed', null, null, error.message);
    return createScimError(500, `Internal server error: ${error.message}`);
  }
}

// PATCH /api/scim/v2/Users/{id} (for partial updates)
export async function PATCH(
  request: NextRequest,
  { params }: { params: { path: string[] } }
) {
  const [resource, id] = params.path;
  
  if (resource !== 'Users' || !id) {
    return createScimError(400, 'Invalid request path', 'invalidPath');
  }
  
  // Verify authentication
  const orgId = await verifyScimToken(request.headers.get('Authorization'));
  if (!orgId) {
    return createScimError(401, 'Invalid or missing bearer token');
  }
  
  try {
    const body = await request.json();
    const supabase = createClient();
    
    // For now, redirect PATCH to PUT for full update
    // In a full SCIM implementation, you'd handle Operations array here
    const putRequest = new NextRequest(request.url, {
      method: 'PUT',
      headers: request.headers,
      body: JSON.stringify(body),
    });
    
    return await PUT(putRequest, { params });
    
  } catch (error) {
    console.error('SCIM patch user error:', error);
    await logScimOperation(orgId, 'patch', 'user', id, 'failed', null, null, error.message);
    return createScimError(500, `Internal server error: ${error.message}`);
  }
}