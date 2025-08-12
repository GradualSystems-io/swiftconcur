-- GitHub Marketplace integration tables

-- GitHub Marketplace plans mapping
CREATE TABLE github_marketplace_plans (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    github_plan_id INTEGER UNIQUE NOT NULL,
    internal_plan_id TEXT NOT NULL, -- 'free', 'pro', 'enterprise'
    name TEXT NOT NULL,
    price_monthly_cents INTEGER NOT NULL,
    price_yearly_cents INTEGER NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Insert GitHub Marketplace plan mappings
INSERT INTO github_marketplace_plans (github_plan_id, internal_plan_id, name, price_monthly_cents, price_yearly_cents) VALUES
(1001, 'free', 'Free', 0, 0),
(1002, 'pro', 'Pro', 1200, 12000),
(1003, 'enterprise', 'Enterprise', 9900, 99000);

-- GitHub accounts (organizations/users)
CREATE TABLE github_accounts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    github_account_id INTEGER UNIQUE NOT NULL,
    github_login TEXT NOT NULL,
    account_type TEXT NOT NULL CHECK (account_type IN ('User', 'Organization')),
    avatar_url TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Extend subscriptions table to support GitHub Marketplace
ALTER TABLE subscriptions ADD COLUMN IF NOT EXISTS billing_provider TEXT DEFAULT 'stripe' CHECK (billing_provider IN ('stripe', 'github_marketplace'));
ALTER TABLE subscriptions ADD COLUMN IF NOT EXISTS github_account_id INTEGER REFERENCES github_accounts(github_account_id);
ALTER TABLE subscriptions ADD COLUMN IF NOT EXISTS github_marketplace_purchase_id TEXT;
ALTER TABLE subscriptions ADD COLUMN IF NOT EXISTS billing_cycle TEXT CHECK (billing_cycle IN ('monthly', 'yearly'));
ALTER TABLE subscriptions ADD COLUMN IF NOT EXISTS unit_count INTEGER DEFAULT 1;
ALTER TABLE subscriptions ADD COLUMN IF NOT EXISTS on_free_trial BOOLEAN DEFAULT false;
ALTER TABLE subscriptions ADD COLUMN IF NOT EXISTS free_trial_ends_on TIMESTAMPTZ;

-- GitHub Marketplace purchase history
CREATE TABLE github_marketplace_purchases (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    subscription_id UUID REFERENCES subscriptions(id),
    github_account_id INTEGER NOT NULL REFERENCES github_accounts(github_account_id),
    github_plan_id INTEGER NOT NULL,
    action TEXT NOT NULL CHECK (action IN ('purchased', 'changed', 'cancelled', 'pending_change', 'pending_change_cancelled')),
    billing_cycle TEXT NOT NULL CHECK (billing_cycle IN ('monthly', 'yearly')),
    unit_count INTEGER NOT NULL DEFAULT 1,
    next_billing_date TIMESTAMPTZ,
    on_free_trial BOOLEAN DEFAULT false,
    free_trial_ends_on TIMESTAMPTZ,
    effective_date TIMESTAMPTZ,
    purchase_data JSONB NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Extend billing_events to track GitHub events
ALTER TABLE billing_events ADD COLUMN IF NOT EXISTS github_delivery_id TEXT;
ALTER TABLE billing_events ADD COLUMN IF NOT EXISTS billing_provider TEXT DEFAULT 'stripe' CHECK (billing_provider IN ('stripe', 'github_marketplace'));

-- Update billing_events unique constraint
DROP INDEX IF EXISTS idx_billing_events_stripe_id;
CREATE UNIQUE INDEX idx_billing_events_stripe_id ON billing_events(stripe_event_id) WHERE stripe_event_id IS NOT NULL;
CREATE UNIQUE INDEX idx_billing_events_github_id ON billing_events(github_delivery_id) WHERE github_delivery_id IS NOT NULL;

-- Indexes for performance
CREATE INDEX idx_github_accounts_login ON github_accounts(github_login);
CREATE INDEX idx_github_accounts_account_id ON github_accounts(github_account_id);
CREATE INDEX idx_github_marketplace_purchases_account ON github_marketplace_purchases(github_account_id);
CREATE INDEX idx_github_marketplace_purchases_subscription ON github_marketplace_purchases(subscription_id);
CREATE INDEX idx_subscriptions_github_account ON subscriptions(github_account_id);
CREATE INDEX idx_subscriptions_billing_provider ON subscriptions(billing_provider);

-- Update RLS policies for new tables
ALTER TABLE github_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE github_marketplace_plans ENABLE ROW LEVEL SECURITY;
ALTER TABLE github_marketplace_purchases ENABLE ROW LEVEL SECURITY;

-- RLS Policies for security
CREATE POLICY "GitHub accounts are readable by authenticated users" ON github_accounts
    FOR SELECT USING (auth.role() = 'authenticated');

CREATE POLICY "GitHub marketplace plans are readable by authenticated users" ON github_marketplace_plans
    FOR SELECT USING (auth.role() = 'authenticated');

CREATE POLICY "Users can only see their GitHub marketplace purchases" ON github_marketplace_purchases
    FOR SELECT USING (
        subscription_id IN (
            SELECT id FROM subscriptions WHERE user_id = auth.uid()
        )
    );

-- Function to get plan by GitHub plan ID
CREATE OR REPLACE FUNCTION get_plan_by_github_id(p_github_plan_id INTEGER)
RETURNS TEXT AS $$
DECLARE
    v_plan_id TEXT;
BEGIN
    SELECT internal_plan_id INTO v_plan_id
    FROM github_marketplace_plans
    WHERE github_plan_id = p_github_plan_id;
    
    RETURN COALESCE(v_plan_id, 'free');
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to handle GitHub Marketplace subscription changes
CREATE OR REPLACE FUNCTION sync_github_subscription(
    p_github_account_id INTEGER,
    p_github_login TEXT,
    p_account_type TEXT,
    p_github_plan_id INTEGER,
    p_action TEXT,
    p_billing_cycle TEXT DEFAULT 'monthly',
    p_unit_count INTEGER DEFAULT 1,
    p_next_billing_date TIMESTAMPTZ DEFAULT NULL,
    p_on_free_trial BOOLEAN DEFAULT false,
    p_free_trial_ends_on TIMESTAMPTZ DEFAULT NULL
) RETURNS UUID AS $$
DECLARE
    v_subscription_id UUID;
    v_plan_id TEXT;
    v_account_uuid UUID;
    v_user_id UUID;
BEGIN
    -- Get or create GitHub account
    INSERT INTO github_accounts (github_account_id, github_login, account_type)
    VALUES (p_github_account_id, p_github_login, p_account_type)
    ON CONFLICT (github_account_id) 
    DO UPDATE SET 
        github_login = EXCLUDED.github_login,
        account_type = EXCLUDED.account_type,
        updated_at = NOW()
    RETURNING id INTO v_account_uuid;
    
    -- Get plan ID
    v_plan_id := get_plan_by_github_id(p_github_plan_id);
    
    -- For now, link to the first user with matching email (this would need enhancement for orgs)
    -- In production, you'd need proper GitHub OAuth integration
    SELECT id INTO v_user_id FROM auth.users LIMIT 1;
    
    IF p_action = 'purchased' THEN
        -- Create new subscription
        INSERT INTO subscriptions (
            user_id,
            billing_provider,
            github_account_id,
            plan_id,
            status,
            billing_cycle,
            unit_count,
            on_free_trial,
            free_trial_ends_on,
            current_period_start,
            current_period_end,
            created_at
        ) VALUES (
            v_user_id,
            'github_marketplace',
            p_github_account_id,
            v_plan_id,
            'active',
            p_billing_cycle,
            p_unit_count,
            p_on_free_trial,
            p_free_trial_ends_on,
            NOW(),
            COALESCE(p_next_billing_date, NOW() + INTERVAL '1 month')
        ) RETURNING id INTO v_subscription_id;
        
    ELSIF p_action = 'changed' THEN
        -- Update existing subscription
        UPDATE subscriptions 
        SET 
            plan_id = v_plan_id,
            billing_cycle = p_billing_cycle,
            unit_count = p_unit_count,
            current_period_end = COALESCE(p_next_billing_date, current_period_end),
            updated_at = NOW()
        WHERE billing_provider = 'github_marketplace' 
          AND github_account_id = p_github_account_id
        RETURNING id INTO v_subscription_id;
        
    ELSIF p_action = 'cancelled' THEN
        -- Cancel subscription
        UPDATE subscriptions 
        SET 
            status = 'canceled',
            canceled_at = NOW(),
            updated_at = NOW()
        WHERE billing_provider = 'github_marketplace' 
          AND github_account_id = p_github_account_id
        RETURNING id INTO v_subscription_id;
    END IF;
    
    -- Record purchase history
    INSERT INTO github_marketplace_purchases (
        subscription_id,
        github_account_id,
        github_plan_id,
        action,
        billing_cycle,
        unit_count,
        next_billing_date,
        on_free_trial,
        free_trial_ends_on,
        purchase_data
    ) VALUES (
        v_subscription_id,
        p_github_account_id,
        p_github_plan_id,
        p_action,
        p_billing_cycle,
        p_unit_count,
        p_next_billing_date,
        p_on_free_trial,
        p_free_trial_ends_on,
        jsonb_build_object(
            'github_account_id', p_github_account_id,
            'github_login', p_github_login,
            'action', p_action,
            'timestamp', NOW()
        )
    );
    
    RETURN v_subscription_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;