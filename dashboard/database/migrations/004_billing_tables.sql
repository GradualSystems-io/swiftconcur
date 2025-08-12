-- Stripe customers
CREATE TABLE stripe_customers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES auth.users(id) NOT NULL UNIQUE,
    stripe_customer_id TEXT UNIQUE NOT NULL,
    email TEXT NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Customer subscriptions
CREATE TABLE subscriptions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES auth.users(id) NOT NULL,
    repo_id UUID REFERENCES repos(id),
    stripe_subscription_id TEXT UNIQUE NOT NULL,
    stripe_customer_id TEXT NOT NULL REFERENCES stripe_customers(stripe_customer_id),
    plan_id TEXT NOT NULL,
    status TEXT NOT NULL CHECK (status IN ('active', 'canceled', 'incomplete', 'incomplete_expired', 'past_due', 'trialing', 'unpaid')),
    current_period_start TIMESTAMPTZ NOT NULL,
    current_period_end TIMESTAMPTZ NOT NULL,
    cancel_at_period_end BOOLEAN DEFAULT false,
    canceled_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Usage tracking with period-based structure
CREATE TABLE usage_records (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    subscription_id UUID REFERENCES subscriptions(id) NOT NULL,
    metric_name TEXT NOT NULL CHECK (metric_name IN ('warnings_processed', 'api_calls', 'exports')),
    quantity INTEGER NOT NULL DEFAULT 0,
    period_start DATE NOT NULL,
    period_end DATE NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(subscription_id, metric_name, period_start)
);

-- Billing events audit log for security and compliance
CREATE TABLE billing_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    subscription_id UUID REFERENCES subscriptions(id),
    stripe_event_id TEXT UNIQUE NOT NULL,
    event_type TEXT NOT NULL,
    event_data JSONB NOT NULL,
    processed_at TIMESTAMPTZ DEFAULT NOW(),
    processing_status TEXT DEFAULT 'processed' CHECK (processing_status IN ('processed', 'failed', 'pending'))
);

-- Usage limits cache (for fast enforcement and security)
CREATE TABLE usage_limits (
    subscription_id UUID REFERENCES subscriptions(id) PRIMARY KEY,
    warnings_limit INTEGER NOT NULL,
    api_calls_limit INTEGER NOT NULL,
    current_warnings INTEGER NOT NULL DEFAULT 0,
    current_api_calls INTEGER NOT NULL DEFAULT 0,
    period_start DATE NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- API tokens for secure access
CREATE TABLE api_tokens (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES auth.users(id) NOT NULL,
    subscription_id UUID REFERENCES subscriptions(id),
    token_hash TEXT UNIQUE NOT NULL, -- Store hashed version for security
    name TEXT NOT NULL,
    last_used_at TIMESTAMPTZ,
    expires_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    is_active BOOLEAN DEFAULT true
);

-- Indexes for performance and security
CREATE INDEX idx_stripe_customers_user_id ON stripe_customers(user_id);
CREATE INDEX idx_subscriptions_user_id ON subscriptions(user_id);
CREATE INDEX idx_subscriptions_status ON subscriptions(status);
CREATE INDEX idx_subscriptions_stripe_id ON subscriptions(stripe_subscription_id);
CREATE INDEX idx_usage_records_subscription_period ON usage_records(subscription_id, period_start);
CREATE INDEX idx_billing_events_subscription ON billing_events(subscription_id);
CREATE INDEX idx_billing_events_type ON billing_events(event_type);
CREATE INDEX idx_billing_events_stripe_id ON billing_events(stripe_event_id);
CREATE INDEX idx_api_tokens_user_id ON api_tokens(user_id);
CREATE INDEX idx_api_tokens_hash ON api_tokens(token_hash);

-- Row Level Security (RLS) for data protection
ALTER TABLE stripe_customers ENABLE ROW LEVEL SECURITY;
ALTER TABLE subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE usage_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE api_tokens ENABLE ROW LEVEL SECURITY;

-- RLS Policies for security
CREATE POLICY "Users can only see their own customer records" ON stripe_customers
    FOR ALL USING (auth.uid() = user_id);

CREATE POLICY "Users can only see their own subscriptions" ON subscriptions
    FOR ALL USING (auth.uid() = user_id);

CREATE POLICY "Users can only see their subscription usage" ON usage_records
    FOR ALL USING (
        subscription_id IN (
            SELECT id FROM subscriptions WHERE user_id = auth.uid()
        )
    );

CREATE POLICY "Users can only see their own API tokens" ON api_tokens
    FOR ALL USING (auth.uid() = user_id);

-- Function to increment usage atomically (for security and consistency)
CREATE OR REPLACE FUNCTION increment_usage(
    p_subscription_id UUID,
    p_metric_name TEXT,
    p_quantity INTEGER DEFAULT 1
) RETURNS TABLE(allowed BOOLEAN, current_usage INTEGER, limit_value INTEGER) AS $$
DECLARE
    v_period_start DATE;
    v_period_end DATE;
    v_current INTEGER;
    v_limit INTEGER;
BEGIN
    -- Calculate current billing period
    v_period_start := DATE_TRUNC('month', CURRENT_DATE)::DATE;
    v_period_end := (DATE_TRUNC('month', CURRENT_DATE) + INTERVAL '1 month - 1 day')::DATE;
    
    -- Get current limits
    SELECT 
        CASE 
            WHEN p_metric_name = 'warnings_processed' THEN warnings_limit
            WHEN p_metric_name = 'api_calls' THEN api_calls_limit
            ELSE 0
        END,
        CASE 
            WHEN p_metric_name = 'warnings_processed' THEN current_warnings
            WHEN p_metric_name = 'api_calls' THEN current_api_calls
            ELSE 0
        END
    INTO v_limit, v_current
    FROM usage_limits
    WHERE subscription_id = p_subscription_id AND period_start = v_period_start;
    
    -- Check if increment would exceed limit
    IF v_current + p_quantity > v_limit THEN
        RETURN QUERY SELECT false, v_current, v_limit;
        RETURN;
    END IF;
    
    -- Upsert usage record
    INSERT INTO usage_records (subscription_id, metric_name, quantity, period_start, period_end)
    VALUES (p_subscription_id, p_metric_name, p_quantity, v_period_start, v_period_end)
    ON CONFLICT (subscription_id, metric_name, period_start)
    DO UPDATE SET 
        quantity = usage_records.quantity + p_quantity,
        updated_at = NOW();
    
    -- Update cache
    IF p_metric_name = 'warnings_processed' THEN
        UPDATE usage_limits
        SET current_warnings = current_warnings + p_quantity,
            updated_at = NOW()
        WHERE subscription_id = p_subscription_id AND period_start = v_period_start;
    ELSIF p_metric_name = 'api_calls' THEN
        UPDATE usage_limits
        SET current_api_calls = current_api_calls + p_quantity,
            updated_at = NOW()
        WHERE subscription_id = p_subscription_id AND period_start = v_period_start;
    END IF;
    
    RETURN QUERY SELECT true, v_current + p_quantity, v_limit;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to reset monthly usage (called by cron job)
CREATE OR REPLACE FUNCTION reset_monthly_usage() RETURNS void AS $$
DECLARE
    v_new_period_start DATE;
BEGIN
    v_new_period_start := DATE_TRUNC('month', CURRENT_DATE)::DATE;
    
    -- Reset usage limits for new period
    UPDATE usage_limits
    SET 
        current_warnings = 0,
        current_api_calls = 0,
        period_start = v_new_period_start,
        updated_at = NOW()
    WHERE period_start < v_new_period_start;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Trigger to update repo tier on subscription change
CREATE OR REPLACE FUNCTION update_repo_tier() RETURNS TRIGGER AS $$
BEGIN
    -- Update repo tier if repo_id is set
    IF NEW.repo_id IS NOT NULL THEN
        UPDATE repos
        SET tier = NEW.plan_id,
            updated_at = NOW()
        WHERE id = NEW.repo_id;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER subscription_tier_sync
    AFTER INSERT OR UPDATE ON subscriptions
    FOR EACH ROW
    EXECUTE FUNCTION update_repo_tier();

-- Security: Function to hash API tokens
CREATE OR REPLACE FUNCTION hash_api_token(token TEXT) RETURNS TEXT AS $$
BEGIN
    RETURN encode(digest(token, 'sha256'), 'hex');
END;
$$ LANGUAGE plpgsql IMMUTABLE SECURITY DEFINER;