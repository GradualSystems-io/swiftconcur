-- SSO and Security Infrastructure for Phase 6
-- Enable Row Level Security by default for all new tables

-- Organizations with SSO support
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS 
    sso_enabled BOOLEAN DEFAULT FALSE,
    sso_provider TEXT CHECK (sso_provider IN ('workos', 'okta', 'azure', 'google', 'custom')),
    sso_connection_id TEXT UNIQUE,
    sso_default_role TEXT DEFAULT 'member' CHECK (sso_default_role IN ('owner', 'admin', 'member', 'viewer')),
    scim_enabled BOOLEAN DEFAULT FALSE,
    scim_token_hash TEXT,
    security_contact_email TEXT;

-- SSO Sessions for tracking authenticated users
CREATE TABLE IF NOT EXISTS sso_sessions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
    org_id UUID REFERENCES organizations(id) ON DELETE CASCADE NOT NULL,
    session_token TEXT UNIQUE NOT NULL,
    idp_session_id TEXT,
    provider TEXT NOT NULL,
    expires_at TIMESTAMPTZ NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    last_activity TIMESTAMPTZ DEFAULT NOW(),
    ip_address INET,
    user_agent TEXT
);

-- Enable RLS on SSO sessions
ALTER TABLE sso_sessions ENABLE ROW LEVEL SECURITY;

-- Policy: Users can only access their own SSO sessions
CREATE POLICY "Users can access own SSO sessions" ON sso_sessions
    FOR ALL USING (auth.uid() = user_id);

-- SSO User Mappings for external identity provider integration
CREATE TABLE IF NOT EXISTS sso_user_mappings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id UUID REFERENCES organizations(id) ON DELETE CASCADE NOT NULL,
    external_id TEXT NOT NULL, -- ID from IdP
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
    email TEXT NOT NULL,
    display_name TEXT,
    attributes JSONB, -- Additional SAML/OIDC attributes
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(org_id, external_id),
    UNIQUE(org_id, user_id)
);

-- Enable RLS on SSO user mappings
ALTER TABLE sso_user_mappings ENABLE ROW LEVEL SECURITY;

-- Policy: Organization members can view SSO mappings for their org
CREATE POLICY "Org members can view SSO mappings" ON sso_user_mappings
    FOR SELECT USING (
        org_id IN (
            SELECT org_id FROM organization_members 
            WHERE user_id = auth.uid()
        )
    );

-- Policy: Only org admins can modify SSO mappings
CREATE POLICY "Org admins can modify SSO mappings" ON sso_user_mappings
    FOR ALL USING (
        org_id IN (
            SELECT org_id FROM organization_members 
            WHERE user_id = auth.uid() AND role IN ('owner', 'admin')
        )
    );

-- SCIM Provisioning Log for enterprise user management
CREATE TABLE IF NOT EXISTS scim_operations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id UUID REFERENCES organizations(id) ON DELETE CASCADE NOT NULL,
    operation TEXT NOT NULL CHECK (operation IN ('create', 'update', 'delete', 'sync')),
    resource_type TEXT NOT NULL CHECK (resource_type IN ('user', 'group')),
    resource_id TEXT NOT NULL,
    external_id TEXT,
    status TEXT NOT NULL CHECK (status IN ('pending', 'success', 'failed')),
    error_message TEXT,
    request_data JSONB,
    response_data JSONB,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Enable RLS on SCIM operations
ALTER TABLE scim_operations ENABLE ROW LEVEL SECURITY;

-- Policy: Only org admins can view SCIM operations
CREATE POLICY "Org admins can view SCIM operations" ON scim_operations
    FOR SELECT USING (
        org_id IN (
            SELECT org_id FROM organization_members 
            WHERE user_id = auth.uid() AND role IN ('owner', 'admin')
        )
    );

-- Feature flags for gradual rollout
CREATE TABLE IF NOT EXISTS feature_flags (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    flag_name TEXT UNIQUE NOT NULL,
    enabled BOOLEAN DEFAULT FALSE,
    description TEXT,
    rollout_percentage INTEGER DEFAULT 0 CHECK (rollout_percentage >= 0 AND rollout_percentage <= 100),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Insert default feature flags
INSERT INTO feature_flags (flag_name, enabled, description, rollout_percentage) VALUES
    ('sso_enabled', false, 'Enable SSO functionality', 0),
    ('scim_enabled', false, 'Enable SCIM user provisioning', 0),
    ('advanced_audit_logging', true, 'Enable detailed audit logging', 100),
    ('security_monitoring', true, 'Enable security event monitoring', 100)
ON CONFLICT (flag_name) DO NOTHING;

-- Organization feature flags for per-org enablement
CREATE TABLE IF NOT EXISTS organization_feature_flags (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id UUID REFERENCES organizations(id) ON DELETE CASCADE NOT NULL,
    flag_name TEXT NOT NULL,
    enabled BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(org_id, flag_name)
);

-- Enable RLS on organization feature flags
ALTER TABLE organization_feature_flags ENABLE ROW LEVEL SECURITY;

-- Policy: Org members can view their org's feature flags
CREATE POLICY "Org members can view feature flags" ON organization_feature_flags
    FOR SELECT USING (
        org_id IN (
            SELECT org_id FROM organization_members 
            WHERE user_id = auth.uid()
        )
    );

-- Policy: Only org owners can modify feature flags
CREATE POLICY "Org owners can modify feature flags" ON organization_feature_flags
    FOR ALL USING (
        org_id IN (
            SELECT org_id FROM organization_members 
            WHERE user_id = auth.uid() AND role = 'owner'
        )
    );

-- Security events table for incident tracking
CREATE TABLE IF NOT EXISTS security_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    event_type TEXT NOT NULL,
    severity TEXT NOT NULL CHECK (severity IN ('info', 'low', 'medium', 'high', 'critical')),
    title TEXT NOT NULL,
    description TEXT NOT NULL,
    affected_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    affected_org_id UUID REFERENCES organizations(id) ON DELETE SET NULL,
    affected_resources JSONB,
    detection_method TEXT DEFAULT 'manual',
    response_actions JSONB,
    resolved BOOLEAN DEFAULT FALSE,
    resolved_at TIMESTAMPTZ,
    resolved_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Enable RLS on security events
ALTER TABLE security_events ENABLE ROW LEVEL SECURITY;

-- Policy: Only system admins can access security events (for now)
CREATE POLICY "System access only" ON security_events
    FOR ALL USING (false); -- Will be updated when we have admin roles

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_sso_sessions_user ON sso_sessions(user_id, expires_at);
CREATE INDEX IF NOT EXISTS idx_sso_sessions_token ON sso_sessions(session_token);
CREATE INDEX IF NOT EXISTS idx_sso_sessions_org ON sso_sessions(org_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_sso_mappings_external ON sso_user_mappings(org_id, external_id);
CREATE INDEX IF NOT EXISTS idx_sso_mappings_email ON sso_user_mappings(email);
CREATE INDEX IF NOT EXISTS idx_scim_operations_org ON scim_operations(org_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_scim_operations_status ON scim_operations(status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_security_events_severity ON security_events(severity, resolved, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_security_events_org ON security_events(affected_org_id, created_at DESC);

-- Function to check if feature is enabled for organization
CREATE OR REPLACE FUNCTION is_feature_enabled(org_uuid UUID, flag_name_param TEXT)
RETURNS BOOLEAN AS $$
DECLARE
    org_flag_enabled BOOLEAN;
    global_flag_enabled BOOLEAN;
    rollout_pct INTEGER;
    org_hash INTEGER;
BEGIN
    -- Check organization-specific flag first
    SELECT enabled INTO org_flag_enabled
    FROM organization_feature_flags
    WHERE org_id = org_uuid AND flag_name = flag_name_param;
    
    -- If org-specific flag exists, use it
    IF org_flag_enabled IS NOT NULL THEN
        RETURN org_flag_enabled;
    END IF;
    
    -- Check global flag and rollout percentage
    SELECT enabled, rollout_percentage INTO global_flag_enabled, rollout_pct
    FROM feature_flags
    WHERE flag_name = flag_name_param;
    
    -- If flag doesn't exist or is disabled globally, return false
    IF global_flag_enabled IS NULL OR global_flag_enabled = FALSE THEN
        RETURN FALSE;
    END IF;
    
    -- If 100% rollout, return true
    IF rollout_pct >= 100 THEN
        RETURN TRUE;
    END IF;
    
    -- Calculate hash-based rollout
    org_hash := abs(hashtext(org_uuid::text)) % 100;
    RETURN org_hash < rollout_pct;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to create security event
CREATE OR REPLACE FUNCTION create_security_event(
    event_type_param TEXT,
    severity_param TEXT,
    title_param TEXT,
    description_param TEXT,
    affected_user_param UUID DEFAULT NULL,
    affected_org_param UUID DEFAULT NULL,
    affected_resources_param JSONB DEFAULT NULL,
    detection_method_param TEXT DEFAULT 'manual'
) RETURNS UUID AS $$
DECLARE
    event_id UUID;
BEGIN
    INSERT INTO security_events (
        event_type,
        severity,
        title,
        description,
        affected_user_id,
        affected_org_id,
        affected_resources,
        detection_method
    ) VALUES (
        event_type_param,
        severity_param,
        title_param,
        description_param,
        affected_user_param,
        affected_org_param,
        affected_resources_param,
        detection_method_param
    ) RETURNING id INTO event_id;
    
    RETURN event_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Update trigger for updated_at timestamps
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Add triggers for updated_at
DROP TRIGGER IF EXISTS update_sso_user_mappings_updated_at ON sso_user_mappings;
CREATE TRIGGER update_sso_user_mappings_updated_at
    BEFORE UPDATE ON sso_user_mappings
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_feature_flags_updated_at ON feature_flags;
CREATE TRIGGER update_feature_flags_updated_at
    BEFORE UPDATE ON feature_flags
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();