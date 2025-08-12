-- Encryption key management tables for data protection
-- This supports the encryption infrastructure required for SOC-2 compliance

-- Encryption keys table for managing per-user/org encryption keys
CREATE TABLE IF NOT EXISTS encryption_keys (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
    org_id UUID REFERENCES organizations(id) ON DELETE CASCADE,
    encrypted_key TEXT NOT NULL, -- Encrypted with master key
    algorithm TEXT NOT NULL DEFAULT 'aes-256-gcm',
    active BOOLEAN DEFAULT TRUE,
    purpose TEXT DEFAULT 'general' CHECK (purpose IN ('general', 'pii', 'financial', 'backup')),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    rotated_at TIMESTAMPTZ,
    expires_at TIMESTAMPTZ, -- For automatic key rotation
    metadata JSONB
);

-- Enable RLS on encryption keys
ALTER TABLE encryption_keys ENABLE ROW LEVEL SECURITY;

-- Policy: Users can only access their own encryption keys
CREATE POLICY "Users can access own encryption keys" ON encryption_keys
    FOR ALL USING (
        user_id = auth.uid() 
        OR org_id IN (
            SELECT org_id FROM organization_members 
            WHERE user_id = auth.uid() AND role IN ('owner', 'admin')
        )
    );

-- Data classification tracking for compliance
CREATE TABLE IF NOT EXISTS data_classifications (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    table_name TEXT NOT NULL,
    column_name TEXT NOT NULL,
    classification TEXT NOT NULL CHECK (classification IN ('public', 'internal', 'confidential', 'restricted')),
    encryption_required BOOLEAN DEFAULT FALSE,
    retention_days INTEGER,
    access_controls JSONB,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(table_name, column_name)
);

-- Insert default data classifications
INSERT INTO data_classifications (table_name, column_name, classification, encryption_required, retention_days) VALUES
    ('auth.users', 'email', 'internal', false, 2555), -- 7 years
    ('auth.users', 'phone', 'confidential', true, 2555),
    ('organizations', 'name', 'internal', false, 2555),
    ('organization_members', 'role', 'internal', false, 2555),
    ('sso_user_mappings', 'email', 'internal', false, 2555),
    ('sso_user_mappings', 'display_name', 'internal', false, 2555),
    ('sso_user_mappings', 'attributes', 'confidential', true, 2555),
    ('audit_logs', 'ip_address', 'confidential', true, 2555),
    ('audit_logs', 'user_agent', 'internal', false, 2555),
    ('audit_logs', 'metadata', 'internal', false, 2555),
    ('subscriptions', 'stripe_customer_id', 'confidential', true, 2555),
    ('usage_records', 'details', 'internal', false, 365)
ON CONFLICT (table_name, column_name) DO NOTHING;

-- Data retention policies
CREATE TABLE IF NOT EXISTS data_retention_policies (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    table_name TEXT NOT NULL UNIQUE,
    retention_days INTEGER NOT NULL,
    archive_after_days INTEGER,
    deletion_method TEXT DEFAULT 'soft_delete' CHECK (deletion_method IN ('soft_delete', 'hard_delete', 'anonymize')),
    legal_hold_exempt BOOLEAN DEFAULT FALSE,
    policy_reason TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Insert default retention policies
INSERT INTO data_retention_policies (table_name, retention_days, archive_after_days, deletion_method, policy_reason) VALUES
    ('audit_logs', 2555, 365, 'soft_delete', 'SOC-2 compliance requires 7 years'),
    ('data_access_logs', 2555, 365, 'soft_delete', 'SOC-2 compliance requires 7 years'),
    ('security_events', 2555, 365, 'soft_delete', 'Security incident records'),
    ('login_attempts', 365, 90, 'hard_delete', 'Security monitoring only'),
    ('sso_sessions', 90, 30, 'hard_delete', 'Session management'),
    ('usage_records', 2555, 365, 'soft_delete', 'Billing and compliance'),
    ('configuration_changes', 2555, 365, 'soft_delete', 'Change management audit'),
    ('backup_logs', 365, 90, 'soft_delete', 'Backup verification'),
    ('scim_operations', 365, 90, 'soft_delete', 'SCIM provisioning audit')
ON CONFLICT (table_name) DO NOTHING;

-- PII detection and handling
CREATE TABLE IF NOT EXISTS pii_detections (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    table_name TEXT NOT NULL,
    column_name TEXT NOT NULL,
    row_id TEXT NOT NULL,
    pii_type TEXT NOT NULL CHECK (pii_type IN ('email', 'phone', 'ssn', 'credit_card', 'ip_address', 'name')),
    confidence_score DECIMAL(3,2) CHECK (confidence_score >= 0 AND confidence_score <= 1),
    detected_at TIMESTAMPTZ DEFAULT NOW(),
    handled BOOLEAN DEFAULT FALSE,
    handling_method TEXT CHECK (handling_method IN ('encrypted', 'anonymized', 'removed', 'approved')),
    handled_at TIMESTAMPTZ,
    handled_by UUID REFERENCES auth.users(id) ON DELETE SET NULL
);

-- Enable RLS on PII detections
ALTER TABLE pii_detections ENABLE ROW LEVEL SECURITY;

-- Policy: Only admins can view PII detections
CREATE POLICY "Admins can view PII detections" ON pii_detections
    FOR ALL USING (
        EXISTS (
            SELECT 1 FROM organization_members 
            WHERE user_id = auth.uid() AND role IN ('owner', 'admin')
        )
    );

-- Security headers and policies tracking
CREATE TABLE IF NOT EXISTS security_policies (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    policy_name TEXT NOT NULL UNIQUE,
    policy_type TEXT NOT NULL CHECK (policy_type IN ('header', 'cors', 'csp', 'encryption', 'access')),
    enabled BOOLEAN DEFAULT TRUE,
    configuration JSONB NOT NULL,
    compliance_frameworks TEXT[], -- e.g., ['SOC-2', 'GDPR', 'HIPAA']
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    last_reviewed TIMESTAMPTZ DEFAULT NOW(),
    review_frequency_days INTEGER DEFAULT 90
);

-- Insert default security policies
INSERT INTO security_policies (policy_name, policy_type, enabled, configuration, compliance_frameworks) VALUES
    ('strict_transport_security', 'header', true, 
     '{"max_age": 31536000, "include_subdomains": true, "preload": true}', 
     ARRAY['SOC-2', 'GDPR']),
    ('content_security_policy', 'header', true,
     '{"default_src": ["self"], "script_src": ["self", "unsafe-inline"], "style_src": ["self", "unsafe-inline"]}',
     ARRAY['SOC-2']),
    ('x_frame_options', 'header', true,
     '{"value": "DENY"}',
     ARRAY['SOC-2']),
    ('data_encryption_at_rest', 'encryption', true,
     '{"algorithm": "aes-256-gcm", "key_rotation_days": 90}',
     ARRAY['SOC-2', 'GDPR']),
    ('password_policy', 'access', true,
     '{"min_length": 12, "require_uppercase": true, "require_numbers": true, "require_special": true}',
     ARRAY['SOC-2']),
    ('session_management', 'access', true,
     '{"timeout_minutes": 480, "concurrent_sessions": 3, "secure_cookies": true}',
     ARRAY['SOC-2'])
ON CONFLICT (policy_name) DO NOTHING;

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_encryption_keys_user ON encryption_keys(user_id, active);
CREATE INDEX IF NOT EXISTS idx_encryption_keys_org ON encryption_keys(org_id, active);
CREATE INDEX IF NOT EXISTS idx_encryption_keys_expires ON encryption_keys(expires_at) WHERE expires_at IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_data_classifications_table ON data_classifications(table_name, column_name);
CREATE INDEX IF NOT EXISTS idx_pii_detections_table ON pii_detections(table_name, column_name);
CREATE INDEX IF NOT EXISTS idx_pii_detections_handled ON pii_detections(handled, detected_at);
CREATE INDEX IF NOT EXISTS idx_security_policies_type ON security_policies(policy_type, enabled);

-- Function to check if data should be encrypted
CREATE OR REPLACE FUNCTION should_encrypt_column(table_name_param TEXT, column_name_param TEXT)
RETURNS BOOLEAN AS $$
DECLARE
    encrypt_required BOOLEAN;
BEGIN
    SELECT encryption_required INTO encrypt_required
    FROM data_classifications
    WHERE table_name = table_name_param AND column_name = column_name_param;
    
    RETURN COALESCE(encrypt_required, FALSE);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to get data retention period
CREATE OR REPLACE FUNCTION get_retention_days(table_name_param TEXT)
RETURNS INTEGER AS $$
DECLARE
    retention_days INTEGER;
BEGIN
    SELECT retention_days INTO retention_days
    FROM data_retention_policies
    WHERE table_name = table_name_param;
    
    RETURN COALESCE(retention_days, 365); -- Default 1 year
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to automatically clean up expired data
CREATE OR REPLACE FUNCTION cleanup_expired_data()
RETURNS TABLE(table_name TEXT, deleted_count BIGINT) AS $$
DECLARE
    policy_record RECORD;
    delete_count BIGINT;
    sql_statement TEXT;
BEGIN
    FOR policy_record IN 
        SELECT * FROM data_retention_policies 
        WHERE deletion_method != 'soft_delete' OR archive_after_days IS NOT NULL
    LOOP
        -- Calculate cutoff date
        DECLARE
            cutoff_date TIMESTAMPTZ;
        BEGIN
            cutoff_date := NOW() - (policy_record.retention_days || ' days')::INTERVAL;
            
            IF policy_record.deletion_method = 'hard_delete' THEN
                -- Hard delete expired records
                sql_statement := format('DELETE FROM %I WHERE created_at < %L', 
                                      policy_record.table_name, cutoff_date);
                EXECUTE sql_statement;
                GET DIAGNOSTICS delete_count = ROW_COUNT;
                
                table_name := policy_record.table_name;
                deleted_count := delete_count;
                RETURN NEXT;
                
            ELSIF policy_record.deletion_method = 'anonymize' THEN
                -- Anonymize old records (implementation depends on table structure)
                -- This would need custom logic per table
                CONTINUE;
            END IF;
        END;
    END LOOP;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to detect PII in text
CREATE OR REPLACE FUNCTION detect_pii_patterns(text_content TEXT)
RETURNS TABLE(pii_type TEXT, confidence DECIMAL) AS $$
BEGIN
    -- Email detection
    IF text_content ~* '\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b' THEN
        pii_type := 'email';
        confidence := 0.95;
        RETURN NEXT;
    END IF;
    
    -- Phone number detection (simple pattern)
    IF text_content ~* '\b\d{3}[-.]?\d{3}[-.]?\d{4}\b' THEN
        pii_type := 'phone';
        confidence := 0.85;
        RETURN NEXT;
    END IF;
    
    -- IP address detection
    IF text_content ~* '\b\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}\b' THEN
        pii_type := 'ip_address';
        confidence := 0.90;
        RETURN NEXT;
    END IF;
    
    -- Credit card detection (simplified)
    IF text_content ~* '\b\d{4}[-\s]?\d{4}[-\s]?\d{4}[-\s]?\d{4}\b' THEN
        pii_type := 'credit_card';
        confidence := 0.80;
        RETURN NEXT;
    END IF;
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- Trigger to update updated_at timestamp
DROP TRIGGER IF EXISTS update_data_classifications_updated_at ON data_classifications;
CREATE TRIGGER update_data_classifications_updated_at
    BEFORE UPDATE ON data_classifications
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_data_retention_policies_updated_at ON data_retention_policies;
CREATE TRIGGER update_data_retention_policies_updated_at
    BEFORE UPDATE ON data_retention_policies
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_security_policies_updated_at ON security_policies;
CREATE TRIGGER update_security_policies_updated_at
    BEFORE UPDATE ON security_policies
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Schedule cleanup job (requires pg_cron extension)
-- This would be set up in production with proper job scheduling
-- SELECT cron.schedule('cleanup-expired-data', '0 2 * * *', 'SELECT cleanup_expired_data();');