-- Comprehensive Audit Logging System for SOC-2 Compliance
-- This creates the foundation for audit trails required by SOC-2

-- Main audit log table for all events
CREATE TABLE IF NOT EXISTS audit_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    event_type TEXT NOT NULL,
    event_category TEXT NOT NULL CHECK (event_category IN (
        'authentication', 'authorization', 'data_access', 
        'data_modification', 'configuration', 'security', 'system'
    )),
    actor_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    actor_type TEXT DEFAULT 'user' CHECK (actor_type IN ('user', 'system', 'api', 'service')),
    actor_email TEXT,
    org_id UUID REFERENCES organizations(id) ON DELETE SET NULL,
    resource_type TEXT,
    resource_id TEXT,
    resource_name TEXT,
    ip_address INET,
    user_agent TEXT,
    session_id TEXT,
    request_id TEXT,
    metadata JSONB,
    old_values JSONB, -- For tracking changes
    new_values JSONB, -- For tracking changes
    risk_score INTEGER DEFAULT 0 CHECK (risk_score >= 0 AND risk_score <= 100),
    success BOOLEAN DEFAULT TRUE,
    error_message TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Enable RLS on audit logs
ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;

-- Policy: Users can only see audit logs related to their organizations
CREATE POLICY "Users can view org audit logs" ON audit_logs
    FOR SELECT USING (
        org_id IN (
            SELECT org_id FROM organization_members 
            WHERE user_id = auth.uid()
        )
        OR actor_id = auth.uid()
    );

-- Data access log for detailed tracking of sensitive data access
CREATE TABLE IF NOT EXISTS data_access_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    org_id UUID REFERENCES organizations(id) ON DELETE SET NULL,
    table_name TEXT NOT NULL,
    operation TEXT NOT NULL CHECK (operation IN ('select', 'insert', 'update', 'delete')),
    row_ids TEXT[],
    columns_accessed TEXT[],
    query_hash TEXT,
    execution_time_ms INTEGER,
    records_affected INTEGER DEFAULT 0,
    data_classification TEXT CHECK (data_classification IN ('public', 'internal', 'confidential', 'restricted')),
    purpose TEXT, -- Business purpose for data access
    ip_address INET,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Enable RLS on data access logs
ALTER TABLE data_access_logs ENABLE ROW LEVEL SECURITY;

-- Policy: Users can view data access logs for their org
CREATE POLICY "Users can view org data access logs" ON data_access_logs
    FOR SELECT USING (
        org_id IN (
            SELECT org_id FROM organization_members 
            WHERE user_id = auth.uid() AND role IN ('owner', 'admin')
        )
    );

-- Login attempts tracking for security monitoring
CREATE TABLE IF NOT EXISTS login_attempts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email TEXT NOT NULL,
    success BOOLEAN NOT NULL,
    failure_reason TEXT,
    ip_address INET NOT NULL,
    user_agent TEXT,
    country_code TEXT,
    city TEXT,
    provider TEXT DEFAULT 'email' CHECK (provider IN ('email', 'sso', 'oauth')),
    session_id TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Index for tracking failed login patterns
CREATE INDEX IF NOT EXISTS idx_login_attempts_email_failed ON login_attempts(email, success, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_login_attempts_ip ON login_attempts(ip_address, created_at DESC);

-- Configuration changes tracking
CREATE TABLE IF NOT EXISTS configuration_changes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL NOT NULL,
    org_id UUID REFERENCES organizations(id) ON DELETE SET NULL,
    config_type TEXT NOT NULL,
    config_key TEXT NOT NULL,
    old_value JSONB,
    new_value JSONB,
    change_reason TEXT,
    approved_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    approval_required BOOLEAN DEFAULT FALSE,
    risk_level TEXT DEFAULT 'low' CHECK (risk_level IN ('low', 'medium', 'high', 'critical')),
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Enable RLS on configuration changes
ALTER TABLE configuration_changes ENABLE ROW LEVEL SECURITY;

-- Policy: Users can view config changes for their org
CREATE POLICY "Users can view org config changes" ON configuration_changes
    FOR SELECT USING (
        org_id IN (
            SELECT org_id FROM organization_members 
            WHERE user_id = auth.uid()
        )
        OR user_id = auth.uid()
    );

-- Policy: Only admins can insert config changes
CREATE POLICY "Admins can create config changes" ON configuration_changes
    FOR INSERT WITH CHECK (
        org_id IN (
            SELECT org_id FROM organization_members 
            WHERE user_id = auth.uid() AND role IN ('owner', 'admin')
        )
    );

-- Access reviews for periodic access certification
CREATE TABLE IF NOT EXISTS access_reviews (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id UUID REFERENCES organizations(id) ON DELETE CASCADE NOT NULL,
    reviewer_id UUID REFERENCES auth.users(id) ON DELETE SET NULL NOT NULL,
    review_type TEXT DEFAULT 'quarterly' CHECK (review_type IN ('quarterly', 'annual', 'triggered', 'emergency')),
    scope TEXT NOT NULL, -- What is being reviewed
    status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'in_progress', 'completed', 'overdue')),
    review_date TIMESTAMPTZ NOT NULL,
    due_date TIMESTAMPTZ NOT NULL,
    completed_date TIMESTAMPTZ,
    findings JSONB,
    actions_required JSONB,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Enable RLS on access reviews
ALTER TABLE access_reviews ENABLE ROW LEVEL SECURITY;

-- Policy: Org admins can manage access reviews
CREATE POLICY "Org admins can manage access reviews" ON access_reviews
    FOR ALL USING (
        org_id IN (
            SELECT org_id FROM organization_members 
            WHERE user_id = auth.uid() AND role IN ('owner', 'admin')
        )
    );

-- Compliance evidence collection
CREATE TABLE IF NOT EXISTS compliance_evidence (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    control_id TEXT NOT NULL, -- SOC-2 control identifier
    control_name TEXT NOT NULL,
    evidence_type TEXT NOT NULL CHECK (evidence_type IN (
        'screenshot', 'document', 'log_export', 'configuration', 'policy', 'procedure'
    )),
    file_path TEXT,
    file_hash TEXT,
    description TEXT NOT NULL,
    collection_date TIMESTAMPTZ DEFAULT NOW(),
    period_start TIMESTAMPTZ,
    period_end TIMESTAMPTZ,
    collector_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    automated BOOLEAN DEFAULT FALSE,
    metadata JSONB,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Backup and disaster recovery logs
CREATE TABLE IF NOT EXISTS backup_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    backup_type TEXT NOT NULL CHECK (backup_type IN ('database', 'files', 'configuration', 'full_system')),
    status TEXT NOT NULL CHECK (status IN ('started', 'completed', 'failed', 'verified')),
    start_time TIMESTAMPTZ NOT NULL,
    end_time TIMESTAMPTZ,
    duration_seconds INTEGER,
    backup_size_bytes BIGINT,
    backup_location TEXT,
    backup_hash TEXT,
    verification_status TEXT CHECK (verification_status IN ('pending', 'passed', 'failed')),
    error_message TEXT,
    metadata JSONB,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Performance indexes for audit queries
CREATE INDEX IF NOT EXISTS idx_audit_logs_event_type ON audit_logs(event_type, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_logs_actor ON audit_logs(actor_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_logs_org ON audit_logs(org_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_logs_category ON audit_logs(event_category, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_logs_risk ON audit_logs(risk_score) WHERE risk_score > 50;
CREATE INDEX IF NOT EXISTS idx_audit_logs_ip ON audit_logs(ip_address, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_data_access_logs_user ON data_access_logs(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_data_access_logs_table ON data_access_logs(table_name, operation, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_data_access_logs_classification ON data_access_logs(data_classification, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_config_changes_user ON configuration_changes(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_config_changes_type ON configuration_changes(config_type, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_config_changes_risk ON configuration_changes(risk_level, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_access_reviews_org ON access_reviews(org_id, status, due_date);
CREATE INDEX IF NOT EXISTS idx_backup_logs_type ON backup_logs(backup_type, status, created_at DESC);

-- Partitioning for audit logs (monthly partitions)
SELECT partman.create_parent(
    p_parent_table => 'public.audit_logs',
    p_control => 'created_at',
    p_type => 'range',
    p_interval => 'monthly'
) WHERE EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_partman');

-- Automated retention policy (keep 7 years for compliance)
UPDATE partman.part_config 
SET retention = '84 months'
WHERE parent_table = 'public.audit_logs';

-- Function to log audit events
CREATE OR REPLACE FUNCTION log_audit_event(
    event_type_param TEXT,
    event_category_param TEXT DEFAULT 'data_access',
    actor_id_param UUID DEFAULT NULL,
    actor_type_param TEXT DEFAULT 'user',
    org_id_param UUID DEFAULT NULL,
    resource_type_param TEXT DEFAULT NULL,
    resource_id_param TEXT DEFAULT NULL,
    metadata_param JSONB DEFAULT NULL,
    risk_score_param INTEGER DEFAULT 0,
    success_param BOOLEAN DEFAULT TRUE,
    error_message_param TEXT DEFAULT NULL
) RETURNS UUID AS $$
DECLARE
    audit_id UUID;
    current_actor_id UUID;
    current_org_id UUID;
BEGIN
    -- Use current user if no actor specified
    current_actor_id := COALESCE(actor_id_param, auth.uid());
    
    -- Get org_id from user if not specified
    IF org_id_param IS NULL AND current_actor_id IS NOT NULL THEN
        SELECT org_id INTO current_org_id
        FROM organization_members
        WHERE user_id = current_actor_id
        LIMIT 1;
    ELSE
        current_org_id := org_id_param;
    END IF;
    
    INSERT INTO audit_logs (
        event_type,
        event_category,
        actor_id,
        actor_type,
        org_id,
        resource_type,
        resource_id,
        metadata,
        risk_score,
        success,
        error_message,
        ip_address,
        user_agent
    ) VALUES (
        event_type_param,
        event_category_param,
        current_actor_id,
        actor_type_param,
        current_org_id,
        resource_type_param,
        resource_id_param,
        metadata_param,
        risk_score_param,
        success_param,
        error_message_param,
        inet_client_addr(),
        current_setting('request.header.user-agent', true)
    ) RETURNING id INTO audit_id;
    
    -- Create security event for high-risk activities
    IF risk_score_param >= 70 THEN
        PERFORM create_security_event(
            'high_risk_activity',
            CASE 
                WHEN risk_score_param >= 90 THEN 'critical'
                WHEN risk_score_param >= 80 THEN 'high'
                ELSE 'medium'
            END,
            'High-risk activity detected',
            format('Event %s triggered with risk score %s', event_type_param, risk_score_param),
            current_actor_id,
            current_org_id,
            jsonb_build_object('audit_log_id', audit_id, 'risk_score', risk_score_param),
            'automated'
        );
    END IF;
    
    RETURN audit_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to log data access
CREATE OR REPLACE FUNCTION log_data_access(
    table_name_param TEXT,
    operation_param TEXT,
    row_ids_param TEXT[] DEFAULT NULL,
    columns_param TEXT[] DEFAULT NULL,
    classification_param TEXT DEFAULT 'internal',
    purpose_param TEXT DEFAULT NULL
) RETURNS UUID AS $$
DECLARE
    access_id UUID;
    current_user_id UUID;
    current_org_id UUID;
BEGIN
    current_user_id := auth.uid();
    
    -- Get user's org
    SELECT org_id INTO current_org_id
    FROM organization_members
    WHERE user_id = current_user_id
    LIMIT 1;
    
    INSERT INTO data_access_logs (
        user_id,
        org_id,
        table_name,
        operation,
        row_ids,
        columns_accessed,
        data_classification,
        purpose,
        ip_address
    ) VALUES (
        current_user_id,
        current_org_id,
        table_name_param,
        operation_param,
        row_ids_param,
        columns_param,
        classification_param,
        purpose_param,
        inet_client_addr()
    ) RETURNING id INTO access_id;
    
    -- Also log in main audit log
    PERFORM log_audit_event(
        'data.' || operation_param,
        'data_access',
        current_user_id,
        'user',
        current_org_id,
        'table',
        table_name_param,
        jsonb_build_object(
            'classification', classification_param,
            'purpose', purpose_param,
            'records_count', COALESCE(array_length(row_ids_param, 1), 0)
        )
    );
    
    RETURN access_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Trigger to automatically log certain table modifications
CREATE OR REPLACE FUNCTION audit_table_changes() 
RETURNS TRIGGER AS $$
BEGIN
    -- Log significant table changes
    PERFORM log_audit_event(
        TG_OP::text,
        'data_modification',
        auth.uid(),
        'user',
        NULL,
        'table',
        TG_TABLE_NAME::text,
        jsonb_build_object(
            'old_values', CASE WHEN TG_OP = 'DELETE' THEN to_jsonb(OLD) ELSE NULL END,
            'new_values', CASE WHEN TG_OP IN ('INSERT', 'UPDATE') THEN to_jsonb(NEW) ELSE NULL END
        )
    );
    
    RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Add audit triggers to important tables
DROP TRIGGER IF EXISTS audit_organizations_changes ON organizations;
CREATE TRIGGER audit_organizations_changes
    AFTER INSERT OR UPDATE OR DELETE ON organizations
    FOR EACH ROW EXECUTE FUNCTION audit_table_changes();

DROP TRIGGER IF EXISTS audit_organization_members_changes ON organization_members;
CREATE TRIGGER audit_organization_members_changes
    AFTER INSERT OR UPDATE OR DELETE ON organization_members
    FOR EACH ROW EXECUTE FUNCTION audit_table_changes();

DROP TRIGGER IF EXISTS audit_subscriptions_changes ON subscriptions;
CREATE TRIGGER audit_subscriptions_changes
    AFTER INSERT OR UPDATE OR DELETE ON subscriptions
    FOR EACH ROW EXECUTE FUNCTION audit_table_changes();