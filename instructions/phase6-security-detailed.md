}
```

## SOC-2 Timeline & Implementation

### Month 0: Foundation & Tool Selection

1. **Select Compliance Platform**
   - Recommended: Drata or Vanta (better GitHub/Cloudflare integrations)
   - Alternative: Secureframe (more affordable)
   - Manual option: Strike Graph (consultant-led)

2. **Choose Auditor**
   - Recommended firms:
     - Prescient Assurance (developer-friendly)
     - Johanson Group (fast turnaround)
     - Schellman (enterprise credibility)

3. **Initial Gap Assessment**
   ```typescript
   // Run compliance check script
   npm run compliance:check
   
   // Output example:
   // ✅ Access control policies defined
   // ✅ Audit logging implemented
   // ❌ Vendor management process missing
   // ❌ Disaster recovery plan needed
   // ❌ Employee security training records
   ```

### Month 1: Policy Development

Create and implement required policies:

1. **Information Security Policy**
2. **Access Control Policy** ✅ (implemented above)
3. **Data Protection Policy**
4. **Incident Response Plan** ✅ (implemented above)
5. **Business Continuity Plan**
6. **Vendor Management Policy**
7. **Risk Assessment Procedures**
8. **Change Management Policy**
9. **Acceptable Use Policy**
10. **Security Awareness Training**

### Month 2: Technical Controls

1. **Implement Remaining Controls**
   - Vulnerability scanning (Snyk/Dependabot)
   - Penetration testing setup
   - Backup verification
   - Disaster recovery testing

2. **Evidence Collection Automation**
   ```typescript
   // Schedule daily evidence collection
   cron.schedule('0 2 * * *', async () => {
     await EvidenceCollector.collectDailyEvidence();
   });
   ```

### Month 3: Monitoring & Testing

1. **Security Monitoring Dashboard**
   ```tsx
   // components/security/SecurityDashboard.tsx
   export function SecurityDashboard() {
     const { data: metrics } = useSecurityMetrics();
     
     return (
       <div className="grid gap-4 md:grid-cols-3">
         <MetricCard
           title="Failed Login Attempts"
           value={metrics.failedLogins}
           trend={metrics.failedLoginsTrend}
           threshold={100}
         />
         <MetricCard
           title="High Risk Events"
           value={metrics.highRiskEvents}
           severity="high"
         />
         <MetricCard
           title="Unresolved Incidents"
           value={metrics.unresolvedIncidents}
           action="Review"
         />
       </div>
     );
   }
   ```

2. **Penetration Testing**
   - Hire external firm (budget: $10-15k)
   - Focus areas: API, SSO, data access
   - Remediate critical findings

### Month 4-5: Operations & Refinement

1. **Run Controls**
   - Daily monitoring checks
   - Weekly access reviews
   - Monthly security training
   - Quarterly vendor assessments

2. **Evidence Review**
   - Weekly evidence quality checks
   - Fix any gaps in documentation
   - Prepare for auditor questions

### Month 6: Audit & Certification

1. **Pre-Audit Preparation**
   - Internal audit simulation
   - Document all remediation
   - Prepare audit workroom

2. **Auditor Fieldwork**
   - 2-3 weeks of auditor review
   - Daily standup meetings
   - Rapid response to requests

3. **Report Issuance**
   - Review draft report
   - Remediate any findings
   - Receive final SOC-2 Type II report

## Infrastructure Security

### 1. Cloudflare Security Configuration

```typescript
// cloudflare-config.ts
export const securityHeaders = {
  'Strict-Transport-Security': 'max-age=31536000; includeSubDomains',
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
  'X-XSS-Protection': '1; mode=block',
  'Content-Security-Policy': `
    default-src 'self';
    script-src 'self' 'unsafe-inline' 'unsafe-eval' https://cdn.jsdelivr.net;
    style-src 'self' 'unsafe-inline';
    img-src 'self' data: https:;
    font-src 'self' data:;
    connect-src 'self' https://api.swiftconcur.dev wss://api.swiftconcur.dev;
    frame-ancestors 'none';
  `.replace(/\s+/g, ' ').trim(),
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'Permissions-Policy': 'camera=(), microphone=(), geolocation=()',
};

// Enable in Cloudflare Worker
export function addSecurityHeaders(response: Response): Response {
  const newHeaders = new Headers(response.headers);
  
  Object.entries(securityHeaders).forEach(([key, value]) => {
    newHeaders.set(key, value);
  });
  
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers: newHeaders,
  });
}
```

### 2. Backup & Disaster Recovery

```typescript
// backup/disaster-recovery.ts
export class DisasterRecovery {
  static async performDailyBackup() {
    const timestamp = new Date().toISOString();
    
    // 1. Database backup (Supabase handles automatically)
    // Verify Supabase Point-in-Time Recovery is enabled
    
    // 2. R2 bucket replication
    await this.replicateR2Buckets();
    
    // 3. Configuration backup
    await this.backupConfigurations();
    
    // 4. Verify backup integrity
    const verified = await this.verifyBackups(timestamp);
    
    // 5. Log backup completion
    await auditLog({
      event: 'backup.completed',
      category: 'system',
      metadata: {
        timestamp,
        verified,
        components: ['database', 'r2', 'config'],
      },
    });
  }
  
  static async testDisasterRecovery() {
    // Monthly DR drill
    const testEnvironment = 'dr-test';
    
    try {
      // 1. Restore database to test instance
      await this.restoreDatabase(testEnvironment);
      
      // 2. Restore R2 data
      await this.restoreR2Data(testEnvironment);
      
      // 3. Verify application functionality
      const healthCheck = await this.verifyApplication(testEnvironment);
      
      // 4. Document RTO/RPO metrics
      await this.documentDRMetrics({
        rto: healthCheck.recoveryTime, // Recovery Time Objective
        rpo: healthCheck.dataLossWindow, // Recovery Point Objective
      });
      
      return { success: true, metrics: healthCheck };
    } catch (error) {
      await this.alertDRFailure(error);
      throw error;
    }
  }
}
```

### 3. Vulnerability Management

```typescript
// security/vulnerability-scanner.ts
export class VulnerabilityScanner {
  static async scanDependencies() {
    // Integration with Snyk
    const { execSync } = require('child_process');
    
    try {
      // Run Snyk test
      const result = execSync('snyk test --json', { encoding: 'utf8' });
      const vulnerabilities = JSON.parse(result);
      
      // Process vulnerabilities
      const critical = vulnerabilities.filter(v => v.severity === 'critical');
      const high = vulnerabilities.filter(v => v.severity === 'high');
      
      if (critical.length > 0) {
        await this.createSecurityIncident(critical, 'critical');
        await this.blockDeployment('Critical vulnerabilities detected');
      }
      
      // Log scan results
      await auditLog({
        event: 'security.vulnerability_scan',
        category: 'security',
        metadata: {
          total: vulnerabilities.length,
          critical: critical.length,
          high: high.length,
          tool: 'snyk',
        },
      });
      
      return vulnerabilities;
    } catch (error) {
      console.error('Vulnerability scan failed:', error);
      throw error;
    }
  }
  
  static async scanInfrastructure() {
    // Cloud security posture scanning
    // This would integrate with cloud provider security tools
  }
}
```

## Cost Considerations

### SSO & SCIM Costs
- **WorkOS**: $49-125/mo per connection
- **Alternative**: Auth0 ($150+/mo) or build custom ($20k+ dev cost)

### SOC-2 Costs
- **Compliance Platform**: $600-2000/mo (Drata/Vanta)
- **Auditor**: $20-40k for Type II
- **Penetration Testing**: $10-15k
- **Total First Year**: ~$50-70k

### Ongoing Costs
- **Annual Audits**: $15-25k
- **Compliance Platform**: $7-24k/year
- **Security Tools**: $200-500/mo

## Security Monitoring Dashboard

```tsx
// app/(dashboard)/security/page.tsx
export default function SecurityDashboard() {
  return (
    <div className="space-y-6">
      <h1 className="text-3xl font-bold">Security Overview</h1>
      
      {/* Real-time Metrics */}
      <div className="grid gap-4 md:grid-cols-4">
        <MetricCard
          title="Active Threats"
          value={0}
          icon={Shield}
          variant="success"
        />
        <MetricCard
          title="Failed Logins (24h)"
          value={23}
          icon={AlertTriangle}
          trend="-15%"
        />
        <MetricCard
          title="Compliance Score"
          value="94%"
          icon={CheckCircle}
          variant="default"
        />
        <MetricCard
          title="Days Since Incident"
          value={127}
          icon={Calendar}
        />
      </div>
      
      {/* Recent Security Events */}
      <Card>
        <CardHeader>
          <CardTitle>Recent Security Events</CardTitle>
        </CardHeader>
        <CardContent>
          <SecurityEventsList />
        </CardContent>
      </Card>
      
      {/* Compliance Status */}
      <Card>
        <CardHeader>
          <CardTitle>SOC-2 Control Status</CardTitle>
        </CardHeader>
        <CardContent>
          <ComplianceControls />
        </CardContent>
      </Card>
    </div>
  );
}
```

## Marketing the Security Features

### Landing Page Security Section
```tsx
// components/marketing/SecuritySection.tsx
export function SecuritySection() {
  return (
    <section className="py-24 bg-slate-50">
      <div className="container mx-auto px-6">
        <div className="text-center mb-16">
          <h2 className="text-4xl font-bold mb-4">
            Enterprise-Grade Security
          </h2>
          <p className="text-xl text-muted-foreground">
            Your code and data are protected by industry-leading security practices
          </p>
        </div>
        
        <div className="grid md:grid-cols-3 gap-8">
          <div className="text-center">
            <div className="w-16 h-16 bg-blue-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <Shield className="w-8 h-8 text-blue-600" />
            </div>
            <h3 className="text-xl font-semibold mb-2">SOC-2 Type II</h3>
            <p className="text-muted-foreground">
              Independently audited security controls and processes
            </p>
          </div>
          
          <div className="text-center">
            <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <Users className="w-8 h-8 text-green-600" />
            </div>
            <h3 className="text-xl font-semibold mb-2">SAML SSO</h3>
            <p className="text-muted-foreground">
              Seamless integration with your identity provider
            </p>
          </div>
          
          <div className="text-center">
            <div className="w-16 h-16 bg-purple-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <Lock className="w-8 h-8 text-purple-600" />
            </div>
            <h3 className="text-xl font-semibold mb-2">End-to-End Encryption</h3>
            <p className="text-muted-foreground">
              Your data is encrypted at rest and in transit
            </p>
          </div>
        </div>
        
        <div className="mt-12 text-center">
          <Button size="lg" asChild>
            <a href="/security">
              View Security Details
              <ArrowRight className="w-4 h-4 ml-2" />
            </a>
          </Button>
        </div>
      </div>
    </section>
  );
}
```

## Success Metrics

1. **Security Metrics**
   - Failed login attempts < 5% of total
   - Zero critical vulnerabilities in production
   - < 4 hour incident response time
   - 99.9% uptime SLA

2. **Compliance Metrics**
   - 100% control effectiveness
   - Zero material weaknesses
   - < 5 audit findings
   - All findings remediated within 30 days

3. **Business Impact**
   - 50% increase in enterprise pipeline
   - 30% faster sales cycles with SOC-2
   - 2x higher ACVs with SSO-enabled accounts
   - 90% enterprise renewal rate

## Next Steps After Phase 6

1. **ISO 27001 Certification** (Optional)
   - Builds on SOC-2 foundation
   - Opens European enterprise market
   - 6-month additional timeline

2. **HIPAA Compliance** (If targeting healthcare)
   - Additional controls needed
   - BAA agreements required
   - Higher infrastructure costs

3. **Advanced Security Features**
   - Hardware security key support
   - IP allowlisting
   - Session recording for privileged users
   - Advanced threat detection with ML

This completes the comprehensive security implementation for SwiftConcur CI, positioning it as an enterprise-ready solution that can command premium pricing and win large deals.
```

#### Change Management (compliance/controls/CP-1.ts)
```typescript
import { createClient } from '@/lib/supabase/server';
import { auditLog } from '@/audit/lib/logger';

export class ChangeManagement {
  // CP-1: Configuration Management Policy
  static async trackConfigChange(
    userId: string,
    configType: string,
    oldValue: any,
    newValue: any
  ) {
    const supabase = createClient();
    
    // Store configuration change
    await supabase.from('configuration_changes').insert({
      user_id: userId,
      config_type: configType,
      old_value: oldValue,
      new_value: newValue,
      change_reason: 'user_initiated',
      approved_by: userId, // Self-approved for now
    });
    
    // Audit log with full context
    await auditLog({
      event: 'config.changed',
      actor_id: userId,
      category: 'configuration',
      metadata: {
        config_type: configType,
        old_value: oldValue,
        new_value: newValue,
        diff: this.calculateDiff(oldValue, newValue),
      },
    });
  }
  
  // CP-2: Baseline Configuration
  static async validateConfiguration(config: any): Promise<boolean> {
    const baseline = {
      security: {
        mfa_required: true,
        session_timeout: 28800, // 8 hours
        password_policy: {
          min_length: 12,
          require_uppercase: true,
          require_numbers: true,
          require_special: true,
        },
      },
      data_retention: {
        audit_logs: 365, // days
        user_data: 2555, // 7 years
        backups: 90,
      },
      encryption: {
        at_rest: 'AES-256',
        in_transit: 'TLS 1.3',
      },
    };
    
    // Validate against baseline
    const violations = this.findViolations(config, baseline);
    
    if (violations.length > 0) {
      await auditLog({
        event: 'config.baseline_violation',
        category: 'security',
        metadata: { violations },
        risk_score: 70,
      });
      return false;
    }
    
    return true;
  }
  
  private static calculateDiff(oldVal: any, newVal: any): any {
    // Implementation of diff calculation
    return { /* diff details */ };
  }
  
  private static findViolations(config: any, baseline: any): string[] {
    // Implementation of baseline validation
    return [];
  }
}
```

#### Monitoring & Alerting (compliance/controls/MP-1.ts)
```typescript
import { createClient } from '@/lib/supabase/server';

export class MonitoringControls {
  // MP-1: Continuous Monitoring
  static async monitorSecurityEvents() {
    const supabase = createClient();
    
    // Check for suspicious patterns
    const patterns = [
      {
        name: 'excessive_api_calls',
        query: `
          SELECT actor_id, COUNT(*) as count
          FROM audit_logs
          WHERE created_at > NOW() - INTERVAL '1 hour'
            AND event_category = 'data_access'
          GROUP BY actor_id
          HAVING COUNT(*) > 1000
        `,
        severity: 'high',
      },
      {
        name: 'unusual_access_pattern',
        query: `
          SELECT actor_id, COUNT(DISTINCT ip_address) as ip_count
          FROM audit_logs
          WHERE created_at > NOW() - INTERVAL '24 hours'
          GROUP BY actor_id
          HAVING COUNT(DISTINCT ip_address) > 5
        `,
        severity: 'medium',
      },
      {
        name: 'after_hours_access',
        query: `
          SELECT actor_id, COUNT(*) as count
          FROM audit_logs
          WHERE EXTRACT(hour FROM created_at) NOT BETWEEN 6 AND 22
            AND created_at > NOW() - INTERVAL '24 hours'
          GROUP BY actor_id
          HAVING COUNT(*) > 10
        `,
        severity: 'low',
      },
    ];
    
    for (const pattern of patterns) {
      const { data: violations } = await supabase
        .rpc('execute_monitoring_query', { query: pattern.query });
      
      if (violations && violations.length > 0) {
        await this.createSecurityIncident(pattern, violations);
      }
    }
  }
  
  // MP-2: Automated Response
  static async respondToIncident(incidentId: string) {
    const supabase = createClient();
    
    const { data: incident } = await supabase
      .from('security_events')
      .select('*')
      .eq('id', incidentId)
      .single();
    
    if (!incident) return;
    
    // Automated response based on severity
    const responses = {
      critical: async () => {
        // Immediate actions for critical incidents
        await this.lockAffectedAccounts(incident);
        await this.notifySecurityTeam(incident, 'immediate');
        await this.createIncidentReport(incident);
      },
      high: async () => {
        // High severity response
        await this.restrictAccess(incident);
        await this.notifySecurityTeam(incident, 'urgent');
      },
      medium: async () => {
        // Medium severity response
        await this.increasedMonitoring(incident);
        await this.notifySecurityTeam(incident, 'standard');
      },
      low: async () => {
        // Low severity response
        await this.logForReview(incident);
      },
    };
    
    const response = responses[incident.severity];
    if (response) {
      await response();
      
      // Update incident with response actions
      await supabase
        .from('security_events')
        .update({
          response_actions: {
            automated: true,
            actions_taken: incident.severity,
            timestamp: new Date().toISOString(),
          },
        })
        .eq('id', incidentId);
    }
  }
  
  private static async createSecurityIncident(pattern: any, violations: any[]) {
    const supabase = createClient();
    
    await supabase.from('security_events').insert({
      event_type: pattern.name,
      severity: pattern.severity,
      description: `Automated detection: ${pattern.name}`,
      affected_resources: {
        users: violations.map(v => v.actor_id),
        count: violations.length,
      },
      detection_method: 'automated_monitoring',
    });
  }
  
  private static async lockAffectedAccounts(incident: any) {
    // Implementation
  }
  
  private static async notifySecurityTeam(incident: any, priority: string) {
    // Send notifications via multiple channels
    // Email, Slack, PagerDuty based on priority
  }
}
```

### 4. Data Protection & Encryption

#### Encryption at Rest (compliance/encryption/data-protection.ts)
```typescript
import crypto from 'crypto';
import { createClient } from '@/lib/supabase/server';

export class DataProtection {
  private static readonly ALGORITHM = 'aes-256-gcm';
  private static readonly KEY_LENGTH = 32;
  private static readonly IV_LENGTH = 16;
  private static readonly TAG_LENGTH = 16;
  
  // Encrypt sensitive data before storage
  static async encryptSensitiveData(
    data: string,
    context: { userId: string; dataType: string }
  ): Promise<{ encrypted: string; keyId: string }> {
    // Get or create encryption key for user
    const key = await this.getEncryptionKey(context.userId);
    
    const iv = crypto.randomBytes(this.IV_LENGTH);
    const cipher = crypto.createCipheriv(this.ALGORITHM, key.key, iv);
    
    let encrypted = cipher.update(data, 'utf8');
    encrypted = Buffer.concat([encrypted, cipher.final()]);
    
    const tag = cipher.getAuthTag();
    
    // Combine iv + tag + encrypted data
    const combined = Buffer.concat([iv, tag, encrypted]);
    
    // Audit data access
    await auditLog({
      event: 'data.encrypted',
      actor_id: context.userId,
      category: 'data_access',
      metadata: {
        data_type: context.dataType,
        key_id: key.id,
      },
    });
    
    return {
      encrypted: combined.toString('base64'),
      keyId: key.id,
    };
  }
  
  // Decrypt sensitive data
  static async decryptSensitiveData(
    encryptedData: string,
    keyId: string,
    userId: string
  ): Promise<string> {
    const key = await this.getEncryptionKey(userId, keyId);
    
    const combined = Buffer.from(encryptedData, 'base64');
    
    const iv = combined.slice(0, this.IV_LENGTH);
    const tag = combined.slice(this.IV_LENGTH, this.IV_LENGTH + this.TAG_LENGTH);
    const encrypted = combined.slice(this.IV_LENGTH + this.TAG_LENGTH);
    
    const decipher = crypto.createDecipheriv(this.ALGORITHM, key.key, iv);
    decipher.setAuthTag(tag);
    
    let decrypted = decipher.update(encrypted);
    decrypted = Buffer.concat([decrypted, decipher.final()]);
    
    // Audit data access
    await auditLog({
      event: 'data.decrypted',
      actor_id: userId,
      category: 'data_access',
      metadata: {
        key_id: keyId,
      },
    });
    
    return decrypted.toString('utf8');
  }
  
  // Key management
  private static async getEncryptionKey(
    userId: string,
    keyId?: string
  ): Promise<{ id: string; key: Buffer }> {
    const supabase = createClient();
    
    if (keyId) {
      // Retrieve existing key
      const { data: keyData } = await supabase
        .from('encryption_keys')
        .select('*')
        .eq('id', keyId)
        .eq('user_id', userId)
        .single();
      
      if (!keyData) {
        throw new Error('Encryption key not found');
      }
      
      // Decrypt key using master key (stored in HSM/KMS in production)
      const masterKey = Buffer.from(process.env.MASTER_ENCRYPTION_KEY!, 'hex');
      const key = this.decryptWithMasterKey(keyData.encrypted_key, masterKey);
      
      return { id: keyData.id, key };
    } else {
      // Generate new key
      const key = crypto.randomBytes(this.KEY_LENGTH);
      const masterKey = Buffer.from(process.env.MASTER_ENCRYPTION_KEY!, 'hex');
      const encryptedKey = this.encryptWithMasterKey(key, masterKey);
      
      const { data: keyData } = await supabase
        .from('encryption_keys')
        .insert({
          user_id: userId,
          encrypted_key: encryptedKey,
          algorithm: this.ALGORITHM,
          created_at: new Date().toISOString(),
        })
        .select()
        .single();
      
      return { id: keyData.id, key };
    }
  }
  
  private static encryptWithMasterKey(key: Buffer, masterKey: Buffer): string {
    // Implementation using HSM/KMS in production
    const iv = crypto.randomBytes(this.IV_LENGTH);
    const cipher = crypto.createCipheriv('aes-256-cbc', masterKey, iv);
    const encrypted = Buffer.concat([cipher.update(key), cipher.final()]);
    return Buffer.concat([iv, encrypted]).toString('base64');
  }
  
  private static decryptWithMasterKey(encryptedKey: string, masterKey: Buffer): Buffer {
    // Implementation using HSM/KMS in production
    const combined = Buffer.from(encryptedKey, 'base64');
    const iv = combined.slice(0, 16);
    const encrypted = combined.slice(16);
    const decipher = crypto.createDecipheriv('aes-256-cbc', masterKey, iv);
    return Buffer.concat([decipher.update(encrypted), decipher.final()]);
  }
}
```

### 5. Security Policies

#### Access Control Policy (compliance/policies/access-control.md)
```markdown
# Access Control Policy

## Purpose
This policy establishes the framework for managing user access to SwiftConcur CI systems and data.

## Scope
This policy applies to all employees, contractors, and third parties with access to SwiftConcur systems.

## Policy

### 1. Principle of Least Privilege
- Users are granted only the minimum access necessary to perform their job functions
- Access rights are reviewed quarterly and adjusted as needed
- Temporary elevated privileges require approval and are time-limited

### 2. User Access Management
- All access requests must be approved by the user's manager and system owner
- User accounts are created only after employment verification
- Accounts are disabled immediately upon termination

### 3. Authentication Requirements
- Multi-factor authentication (MFA) is mandatory for all users
- Passwords must meet complexity requirements:
  - Minimum 12 characters
  - Mix of uppercase, lowercase, numbers, and special characters
  - Changed every 90 days
  - Cannot reuse last 12 passwords

### 4. Privileged Access Management
- Administrative accounts are separate from regular user accounts
- Privileged actions are logged and monitored
- Privileged sessions are recorded when accessing production systems

### 5. Access Reviews
- Quarterly reviews of all user access rights
- Annual certification by managers of their team's access
- Immediate review triggered by role changes

## Enforcement
Violations of this policy may result in disciplinary action up to and including termination.

## Review
This policy is reviewed annually and updated as needed.

Last Updated: [Date]
Approved By: [Security Officer]
```

#### Incident Response Plan (compliance/policies/incident-response.md)
```markdown
# Incident Response Plan

## Purpose
Define procedures for responding to security incidents at SwiftConcur CI.

## Incident Classification

### Severity Levels
- **Critical**: Immediate threat to data security or system availability
- **High**: Significant security risk requiring urgent attention
- **Medium**: Security issue requiring prompt resolution
- **Low**: Minor security concern for scheduled resolution

## Response Procedures

### 1. Detection & Analysis (0-15 minutes)
- Automated monitoring alerts trigger investigation
- Security team validates and classifies incident
- Initial impact assessment completed

### 2. Containment (15-60 minutes)
- Isolate affected systems
- Preserve evidence for investigation
- Prevent further damage

### 3. Eradication (1-4 hours)
- Remove threat from environment
- Patch vulnerabilities
- Update security controls

### 4. Recovery (4-24 hours)
- Restore systems from clean backups
- Verify system integrity
- Resume normal operations

### 5. Post-Incident (24-72 hours)
- Document lessons learned
- Update response procedures
- Implement preventive measures

## Contact Information

### Internal Escalation
- L1 Security: security@swiftconcur.dev
- L2 Security Lead: [Phone]
- L3 CTO: [Phone]

### External Contacts
- Legal Counsel: [Contact]
- Cyber Insurance: [Policy #]
- Law Enforcement: Local FBI Cyber Division

## Communication Plan
- Customer notification within 72 hours for data breaches
- Regulatory notification per compliance requirements
- Internal stakeholder updates every 2 hours during incident

Last Updated: [Date]
Approved By: [Security Officer]
```

### 6. Evidence Collection for Auditors

#### Evidence Collection Script (compliance/evidence/collect.ts)
```typescript
import { createClient } from '@/lib/supabase/server';
import { generatePDF } from '@/lib/pdf';
import archiver from 'archiver';
import fs from 'fs';

export class EvidenceCollector {
  static async collectSOC2Evidence(
    startDate: Date,
    endDate: Date
  ): Promise<string> {
    const evidenceDir = `/tmp/soc2-evidence-${Date.now()}`;
    fs.mkdirSync(evidenceDir, { recursive: true });
    
    // Collect all evidence types
    await Promise.all([
      this.collectAccessControlEvidence(evidenceDir, startDate, endDate),
      this.collectChangeManagementEvidence(evidenceDir, startDate, endDate),
      this.collectSecurityEventEvidence(evidenceDir, startDate, endDate),
      this.collectEncryptionEvidence(evidenceDir),
      this.collectBackupEvidence(evidenceDir),
    ]);
    
    // Create zip archive
    const outputPath = `/tmp/soc2-evidence-${startDate.toISOString()}-${endDate.toISOString()}.zip`;
    await this.createArchive(evidenceDir, outputPath);
    
    return outputPath;
  }
  
  private static async collectAccessControlEvidence(
    dir: string,
    startDate: Date,
    endDate: Date
  ) {
    const supabase = createClient();
    
    // User access reviews
    const { data: accessReviews } = await supabase
      .from('access_reviews')
      .select('*')
      .gte('review_date', startDate.toISOString())
      .lte('review_date', endDate.toISOString());
    
    await this.saveAsJSON(
      `${dir}/access-reviews.json`,
      accessReviews
    );
    
    // Failed login attempts
    const { data: failedLogins } = await supabase
      .from('audit_logs')
      .select('*')
      .eq('event_type', 'auth.login_failed')
      .gte('created_at', startDate.toISOString())
      .lte('created_at', endDate.toISOString());
    
    await this.saveAsJSON(
      `${dir}/failed-logins.json`,
      failedLogins
    );
    
    // Generate access control report
    const report = await this.generateAccessControlReport(
      accessReviews,
      failedLogins
    );
    
    await generatePDF(report, `${dir}/access-control-report.pdf`);
  }
  
  private static async collectChangeManagementEvidence(
    dir: string,
    startDate: Date,
    endDate: Date
  ) {
    const supabase = createClient();
    
    // Configuration changes
    const { data: configChanges } = await supabase
      .from('audit_logs')
      .select('*')
      .eq('event_category', 'configuration')
      .gte('created_at', startDate.toISOString())
      .lte('created_at', endDate.toISOString());
    
    await this.saveAsJSON(
      `${dir}/configuration-changes.json`,
      configChanges
    );
    
    // Change approval records
    const { data: approvals } = await supabase
      .from('change_approvals')
      .select('*')
      .gte('created_at', startDate.toISOString())
      .lte('created_at', endDate.toISOString());
    
    await this.saveAsJSON(
      `${dir}/change-approvals.json`,
      approvals
    );
  }
  
  private static async createArchive(
    sourceDir: string,
    outputPath: string
  ): Promise<void> {
    return new Promise((resolve, reject) => {
      const output = fs.createWriteStream(outputPath);
      const archive = archiver('zip', { zlib: { level: 9 } });
      
      output.on('close', () => resolve());
      archive.on('error', (err) => reject(err));
      
      archive.pipe(output);
      archive.directory(sourceDir, false);
      archive.finalize();
    });
  }
  
  private static async saveAsJSON(path: string, data: any) {
    fs.writeFileSync(path, JSON.stringify(data, null, 2));
  }
  
  private static async generateAccessControlReport(
    reviews: any[],
    failedLogins: any[]
  ): Promise<string> {
    // Generate HTML report for PDF conversion
    return `
      <h1>Access Control Evidence Report</h1>
      <h2>Reporting Period: ${new Date().toLocaleDateString()}</h2>
      
      <h3>Access Reviews Completed</h3>
      <p>Total Reviews: ${reviews.length}</p>
      
      <h3>Failed Login Analysis</h3>
      <p>Total Failed Attempts: ${failedLogins.length}</p>
      <p>Unique Accounts: ${new Set(failedLogins.map(l => l.metadata?.email)).size}</p>
      
      <h3>Compliance Status</h3>
      <p>All access controls are operating effectively.</p>
    `;
  }
}
```

### 7. SSO Settings Component (sso/components/SSOSettings.tsx)

```tsx
'use client';

import { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { useToast } from '@/components/ui/use-toast';
import { Shield, Users, Key, AlertTriangle } from 'lucide-react';

interface SSOSettingsProps {
  organization: {
    id: string;
    name: string;
    sso_enabled: boolean;
    sso_provider?: string;
    sso_connection_id?: string;
    scim_enabled: boolean;
  };
}

export function SSOSettings({ organization }: SSOSettingsProps) {
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [ssoEnabled, setSsoEnabled] = useState(organization.sso_enabled);
  const [scimEnabled, setScimEnabled] = useState(organization.scim_enabled);
  const [scimToken, setScimToken] = useState('');
  
  const handleEnableSSO = async () => {
    setLoading(true);
    
    try {
      const response = await fetch('/api/sso/configure', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          org_id: organization.id,
          enable: !ssoEnabled,
        }),
      });
      
      if (!response.ok) throw new Error('Failed to update SSO');
      
      const data = await response.json();
      
      setSsoEnabled(!ssoEnabled);
      
      toast({
        title: ssoEnabled ? 'SSO Disabled' : 'SSO Enabled',
        description: ssoEnabled 
          ? 'Users can now login with email/password only'
          : 'Users can now login via your identity provider',
      });
      
      if (!ssoEnabled && data.connection_url) {
        // Show connection instructions
        window.open(data.connection_url, '_blank');
      }
    } catch (error) {
      toast({
        title: 'Error',
        description: 'Failed to update SSO settings',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };
  
  const generateScimToken = async () => {
    setLoading(true);
    
    try {
      const response = await fetch('/api/scim/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ org_id: organization.id }),
      });
      
      const data = await response.json();
      setScimToken(data.token);
      
      toast({
        title: 'SCIM Token Generated',
        description: 'Copy this token now - it won\'t be shown again',
      });
    } catch (error) {
      toast({
        title: 'Error',
        description: 'Failed to generate SCIM token',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };
  
  return (
    <div className="space-y-6">
      {/* SSO Configuration */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Shield className="w-5 h-5" />
            Single Sign-On (SSO)
          </CardTitle>
          <CardDescription>
            Enable SAML 2.0 SSO for your organization
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <Label htmlFor="sso-enabled">Enable SSO</Label>
              <p className="text-sm text-muted-foreground">
                Require users to authenticate via your identity provider
              </p>
            </div>
            <Switch
              id="sso-enabled"
              checked={ssoEnabled}
              onCheckedChange={handleEnableSSO}
              disabled={loading}
            />
          </div>
          
          {ssoEnabled && (
            <>
              <div className="rounded-lg border p-4 space-y-2">
                <p className="text-sm font-medium">SSO Provider</p>
                <p className="text-sm text-muted-foreground">
                  {organization.sso_provider || 'Not configured'}
                </p>
              </div>
              
              <div className="rounded-lg border p-4 space-y-2">
                <p className="text-sm font-medium">SSO Login URL</p>
                <code className="text-xs bg-muted p-1 rounded">
                  {`${process.env.NEXT_PUBLIC_APP_URL}/api/sso/login/${organization.id}`}
                </code>
              </div>
              
              <Alert>
                <AlertTriangle className="h-4 w-4" />
                <AlertDescription>
                  Once SSO is enabled, all users must authenticate through your identity provider.
                  Ensure your IdP is properly configured before enforcing SSO.
                </AlertDescription>
              </Alert>
            </>
          )}
        </CardContent>
      </Card>
      
      {/* SCIM Configuration */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Users className="w-5 h-5" />
            SCIM Provisioning
          </CardTitle>
          <CardDescription>
            Automatically sync users from your identity provider
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <Label htmlFor="scim-enabled">Enable SCIM 2.0</Label>
              <p className="text-sm text-muted-foreground">
                Allow automatic user provisioning and deprovisioning
              </p>
            </div>
            <Switch
              id="scim-enabled"
              checked={scimEnabled}
              onCheckedChange={setScimEnabled}
              disabled={!ssoEnabled || loading}
            />
          </div>
          
          {scimEnabled && (
            <>
              <div className="space-y-2">
                <Label>SCIM Base URL</Label>
                <Input
                  value={`${process.env.NEXT_PUBLIC_APP_URL}/api/scim`}
                  readOnly
                />
              </div>
              
              <div className="space-y-2">
                <Label>SCIM Bearer Token</Label>
                <div className="flex gap-2">
                  <Input
                    type="password"
                    value={scimToken}
                    placeholder="Generate a token"
                    readOnly
                  />
                  <Button
                    onClick={generateScimToken}
                    disabled={loading}
                  >
                    <Key className="w-4 h-4 mr-2" />
                    Generate
                  </Button>
                </div>
                {scimToken && (
                  <p className="text-xs text-muted-foreground">
                    Save this token securely - it won't be displayed again
                  </p>
                )}
              </div>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}# Phase 6: Security, SSO & SOC-2 Compliance - Enhanced Implementation Guide

## Overview
Implement enterprise-grade security features including SAML SSO, comprehensive audit logging, and SOC-2 Type II compliance infrastructure. This phase unlocks enterprise sales by meeting security requirements that large organizations mandate.

## Why This Matters
- **Enterprise Requirements**: 73% of enterprise buyers require SSO before procurement
- **Revenue Acceleration**: SSO alone can increase deal size by 2-3x
- **Trust Signal**: SOC-2 certification reduces sales friction and shortens cycles
- **Competitive Advantage**: Many developer tools lack proper security certifications

## Architecture

```
User Authentication Flow:
┌─────────────┐     ┌──────────────┐     ┌─────────────┐
│   Browser   │────▶│  Dashboard   │────▶│   WorkOS    │
└─────────────┘     └──────────────┘     └─────────────┘
                            │                     │
                            ▼                     ▼
                    ┌──────────────┐     ┌─────────────┐
                    │   Supabase   │     │   Okta/     │
                    │     Auth      │     │   Azure AD  │
                    └──────────────┘     └─────────────┘

Audit & Compliance Infrastructure:
┌─────────────────┐     ┌─────────────────┐     ┌──────────────┐
│  Application    │────▶│  Audit Events   │────▶│   Drata/     │
│  (Dashboard/API)│     │  (Supabase)     │     │  SecureFrame │
└─────────────────┘     └─────────────────┘     └──────────────┘
         │                       │                        │
         ▼                       ▼                        ▼
┌─────────────────┐     ┌─────────────────┐     ┌──────────────┐
│ Cloudflare Logs │────▶│   Log Storage   │────▶│   Auditor    │
│                 │     │   (S3/Splunk)   │     │   Evidence   │
└─────────────────┘     └─────────────────┘     └──────────────┘
```

## Implementation Structure

```
security/
├── sso/
│   ├── lib/
│   │   ├── workos.ts          # WorkOS client configuration
│   │   ├── auth.ts            # SSO authentication logic
│   │   └── tenant.ts          # Multi-tenant management
│   ├── api/
│   │   ├── sso/
│   │   │   ├── callback/
│   │   │   │   └── route.ts   # SAML callback handler
│   │   │   └── configure/
│   │   │       └── route.ts   # SSO configuration endpoint
│   │   └── scim/
│   │       └── [...path]/
│   │           └── route.ts    # SCIM provisioning
│   └── components/
│       ├── SSOLogin.tsx       # SSO login button
│       └── SSOSettings.tsx    # SSO configuration UI
├── compliance/
│   ├── policies/              # Security policies (markdown)
│   │   ├── access-control.md
│   │   ├── data-protection.md
│   │   ├── incident-response.md
│   │   └── vendor-management.md
│   ├── controls/              # SOC-2 control implementations
│   │   ├── AC-1.ts           # Access Control
│   │   ├── CP-1.ts           # Change Management
│   │   └── MP-1.ts           # Monitoring
│   └── evidence/              # Evidence collection scripts
│       ├── collect.ts
│       └── export.ts
├── audit/
│   ├── lib/
│   │   ├── logger.ts         # Audit logging utilities
│   │   ├── events.ts         # Event definitions
│   │   └── retention.ts      # Log retention policies
│   └── middleware/
│       └── audit.ts          # Audit logging middleware
└── database/
    └── migrations/
        ├── 005_sso_tables.sql
        └── 006_audit_tables.sql
```

## Phase 1: SSO Implementation (Weeks 1-2)

### 1. Database Schema for SSO

```sql
-- database/migrations/005_sso_tables.sql

-- Organizations with SSO support
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS (
    sso_enabled BOOLEAN DEFAULT FALSE,
    sso_provider TEXT CHECK (sso_provider IN ('okta', 'azure', 'google', 'custom')),
    sso_connection_id TEXT UNIQUE,
    sso_default_role TEXT DEFAULT 'member',
    scim_enabled BOOLEAN DEFAULT FALSE,
    scim_token_hash TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- SSO Sessions
CREATE TABLE sso_sessions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES auth.users(id) NOT NULL,
    org_id UUID REFERENCES organizations(id) NOT NULL,
    session_token TEXT UNIQUE NOT NULL,
    idp_session_id TEXT,
    expires_at TIMESTAMPTZ NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    last_activity TIMESTAMPTZ DEFAULT NOW()
);

-- SSO User Mappings
CREATE TABLE sso_user_mappings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id UUID REFERENCES organizations(id) NOT NULL,
    external_id TEXT NOT NULL, -- ID from IdP
    user_id UUID REFERENCES auth.users(id) NOT NULL,
    email TEXT NOT NULL,
    attributes JSONB, -- Additional SAML attributes
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(org_id, external_id)
);

-- SCIM Provisioning Log
CREATE TABLE scim_operations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id UUID REFERENCES organizations(id) NOT NULL,
    operation TEXT NOT NULL CHECK (operation IN ('create', 'update', 'delete', 'sync')),
    resource_type TEXT NOT NULL CHECK (resource_type IN ('user', 'group')),
    resource_id TEXT NOT NULL,
    status TEXT NOT NULL CHECK (status IN ('pending', 'success', 'failed')),
    error_message TEXT,
    request_data JSONB,
    response_data JSONB,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes
CREATE INDEX idx_sso_sessions_user ON sso_sessions(user_id);
CREATE INDEX idx_sso_sessions_expires ON sso_sessions(expires_at);
CREATE INDEX idx_sso_mappings_email ON sso_user_mappings(email);
CREATE INDEX idx_scim_operations_org ON scim_operations(org_id, created_at DESC);
```

### 2. WorkOS Integration (sso/lib/workos.ts)

```typescript
import { WorkOS } from '@workos-inc/node';

if (!process.env.WORKOS_API_KEY || !process.env.WORKOS_CLIENT_ID) {
  throw new Error('WorkOS configuration missing');
}

export const workos = new WorkOS(process.env.WORKOS_API_KEY);

export const WORKOS_CONFIG = {
  clientId: process.env.WORKOS_CLIENT_ID!,
  redirectUri: `${process.env.NEXT_PUBLIC_APP_URL}/api/sso/callback`,
  baseUrl: process.env.NEXT_PUBLIC_APP_URL!,
};

export interface SSOProfile {
  id: string;
  email: string;
  firstName?: string;
  lastName?: string;
  rawAttributes: Record<string, any>;
  connectionId: string;
  organizationId: string;
}

export async function createSSOConnection(org: {
  id: string;
  name: string;
  domain: string;
}) {
  try {
    const connection = await workos.sso.createConnection({
      name: org.name,
      domains: [org.domain],
    });
    
    return {
      connectionId: connection.id,
      loginUrl: getAuthorizationUrl(connection.id),
    };
  } catch (error) {
    console.error('Failed to create SSO connection:', error);
    throw error;
  }
}

export function getAuthorizationUrl(
  connectionId: string,
  state?: string
): string {
  return workos.sso.getAuthorizationUrl({
    clientId: WORKOS_CONFIG.clientId,
    connection: connectionId,
    redirectUri: WORKOS_CONFIG.redirectUri,
    state: state || generateState(),
  });
}

export async function handleSSOCallback(code: string): Promise<SSOProfile> {
  try {
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
      organizationId: profile.organizationId,
    };
  } catch (error) {
    console.error('SSO callback error:', error);
    throw error;
  }
}

function generateState(): string {
  return crypto.randomBytes(32).toString('hex');
}
```

### 3. SSO Callback Handler (api/sso/callback/route.ts)

```typescript
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { handleSSOCallback } from '@/sso/lib/workos';
import { auditLog } from '@/audit/lib/logger';

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const code = searchParams.get('code');
  const state = searchParams.get('state');
  const error = searchParams.get('error');
  
  if (error) {
    console.error('SSO error:', error);
    return NextResponse.redirect(
      `${process.env.NEXT_PUBLIC_APP_URL}/login?error=sso_failed`
    );
  }
  
  if (!code) {
    return NextResponse.redirect(
      `${process.env.NEXT_PUBLIC_APP_URL}/login?error=missing_code`
    );
  }
  
  try {
    // Handle WorkOS callback
    const profile = await handleSSOCallback(code);
    const supabase = createClient();
    
    // Find or create user
    let { data: ssoMapping } = await supabase
      .from('sso_user_mappings')
      .select('user_id, org_id')
      .eq('external_id', profile.id)
      .single();
    
    let userId: string;
    let orgId: string;
    
    if (!ssoMapping) {
      // Create new user
      const { data: authUser, error: authError } = await supabase.auth.admin.createUser({
        email: profile.email,
        email_confirm: true,
        user_metadata: {
          full_name: `${profile.firstName} ${profile.lastName}`.trim(),
          sso: true,
        },
      });
      
      if (authError) throw authError;
      
      // Get organization by connection ID
      const { data: org } = await supabase
        .from('organizations')
        .select('id')
        .eq('sso_connection_id', profile.connectionId)
        .single();
      
      if (!org) throw new Error('Organization not found');
      
      // Create mapping
      await supabase.from('sso_user_mappings').insert({
        org_id: org.id,
        external_id: profile.id,
        user_id: authUser.user.id,
        email: profile.email,
        attributes: profile.rawAttributes,
      });
      
      userId = authUser.user.id;
      orgId = org.id;
      
      // Audit log
      await auditLog({
        event: 'user.sso_created',
        actor_id: userId,
        org_id: orgId,
        metadata: {
          email: profile.email,
          provider: 'workos',
        },
      });
    } else {
      userId = ssoMapping.user_id;
      orgId = ssoMapping.org_id;
      
      // Update last login
      await supabase
        .from('sso_user_mappings')
        .update({ updated_at: new Date().toISOString() })
        .eq('id', ssoMapping.id);
    }
    
    // Create SSO session
    const sessionToken = crypto.randomBytes(32).toString('hex');
    const expiresAt = new Date();
    expiresAt.setHours(expiresAt.getHours() + 8); // 8 hour session
    
    await supabase.from('sso_sessions').insert({
      user_id: userId,
      org_id: orgId,
      session_token: sessionToken,
      idp_session_id: profile.id,
      expires_at: expiresAt.toISOString(),
    });
    
    // Set session cookie
    const response = NextResponse.redirect(
      `${process.env.NEXT_PUBLIC_APP_URL}/dashboard`
    );
    
    response.cookies.set('sso_session', sessionToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      expires: expiresAt,
    });
    
    // Audit successful login
    await auditLog({
      event: 'auth.sso_login',
      actor_id: userId,
      org_id: orgId,
      metadata: {
        ip: request.ip,
        user_agent: request.headers.get('user-agent'),
      },
    });
    
    return response;
  } catch (error) {
    console.error('SSO callback error:', error);
    
    // Audit failed login
    await auditLog({
      event: 'auth.sso_login_failed',
      metadata: {
        error: error.message,
        code,
      },
    });
    
    return NextResponse.redirect(
      `${process.env.NEXT_PUBLIC_APP_URL}/login?error=sso_error`
    );
  }
}
```

### 4. SCIM 2.0 Provisioning (api/scim/[...path]/route.ts)

```typescript
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import crypto from 'crypto';

// SCIM 2.0 endpoint for automatic user provisioning/deprovisioning
export async function GET(
  request: NextRequest,
  { params }: { params: { path: string[] } }
) {
  const [resource, id] = params.path;
  
  // Validate SCIM token
  const authHeader = request.headers.get('Authorization');
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return NextResponse.json(
      { error: 'Unauthorized' },
      { status: 401 }
    );
  }
  
  const token = authHeader.substring(7);
  const supabase = createClient();
  
  // Verify token
  const { data: org } = await supabase
    .from('organizations')
    .select('id, scim_token_hash')
    .eq('scim_enabled', true)
    .single();
  
  if (!org || !verifyScimToken(token, org.scim_token_hash)) {
    return NextResponse.json(
      { error: 'Invalid token' },
      { status: 401 }
    );
  }
  
  if (resource === 'Users') {
    if (id) {
      // Get specific user
      const { data: user } = await supabase
        .from('sso_user_mappings')
        .select('*')
        .eq('org_id', org.id)
        .eq('external_id', id)
        .single();
      
      if (!user) {
        return NextResponse.json(
          { error: 'User not found' },
          { status: 404 }
        );
      }
      
      return NextResponse.json(formatScimUser(user));
    } else {
      // List users
      const { data: users } = await supabase
        .from('sso_user_mappings')
        .select('*')
        .eq('org_id', org.id);
      
      return NextResponse.json({
        schemas: ['urn:ietf:params:scim:api:messages:2.0:ListResponse'],
        totalResults: users?.length || 0,
        Resources: users?.map(formatScimUser) || [],
      });
    }
  }
  
  return NextResponse.json(
    { error: 'Resource not found' },
    { status: 404 }
  );
}

export async function POST(
  request: NextRequest,
  { params }: { params: { path: string[] } }
) {
  const [resource] = params.path;
  
  if (resource !== 'Users') {
    return NextResponse.json(
      { error: 'Resource not supported' },
      { status: 400 }
    );
  }
  
  // Validate SCIM token (same as GET)
  const authHeader = request.headers.get('Authorization');
  // ... token validation ...
  
  const body = await request.json();
  const supabase = createClient();
  
  try {
    // Create user
    const email = body.emails?.[0]?.value;
    const externalId = body.externalId || body.id;
    const userName = body.userName;
    
    if (!email || !externalId) {
      return NextResponse.json(
        { error: 'Missing required fields' },
        { status: 400 }
      );
    }
    
    // Create auth user
    const { data: authUser } = await supabase.auth.admin.createUser({
      email,
      email_confirm: true,
      user_metadata: {
        full_name: `${body.name?.givenName} ${body.name?.familyName}`.trim(),
        scim_provisioned: true,
      },
    });
    
    // Create SSO mapping
    await supabase.from('sso_user_mappings').insert({
      org_id: org.id,
      external_id: externalId,
      user_id: authUser.user.id,
      email,
      attributes: {
        userName,
        displayName: body.displayName,
        active: body.active !== false,
      },
    });
    
    // Log SCIM operation
    await supabase.from('scim_operations').insert({
      org_id: org.id,
      operation: 'create',
      resource_type: 'user',
      resource_id: externalId,
      status: 'success',
      request_data: body,
    });
    
    return NextResponse.json(
      formatScimUser({
        external_id: externalId,
        email,
        attributes: body,
      }),
      { status: 201 }
    );
  } catch (error) {
    // Log failed operation
    await supabase.from('scim_operations').insert({
      org_id: org.id,
      operation: 'create',
      resource_type: 'user',
      resource_id: body.externalId,
      status: 'failed',
      error_message: error.message,
      request_data: body,
    });
    
    return NextResponse.json(
      { error: 'Failed to create user' },
      { status: 500 }
    );
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: { path: string[] } }
) {
  const [resource, id] = params.path;
  
  if (resource !== 'Users' || !id) {
    return NextResponse.json(
      { error: 'Invalid request' },
      { status: 400 }
    );
  }
  
  // ... token validation ...
  
  const supabase = createClient();
  
  try {
    // Soft delete user
    const { data: mapping } = await supabase
      .from('sso_user_mappings')
      .select('user_id')
      .eq('org_id', org.id)
      .eq('external_id', id)
      .single();
    
    if (!mapping) {
      return NextResponse.json(
        { error: 'User not found' },
        { status: 404 }
      );
    }
    
    // Deactivate user
    await supabase.auth.admin.updateUserById(mapping.user_id, {
      user_metadata: { deactivated: true },
    });
    
    // Log operation
    await supabase.from('scim_operations').insert({
      org_id: org.id,
      operation: 'delete',
      resource_type: 'user',
      resource_id: id,
      status: 'success',
    });
    
    return new NextResponse(null, { status: 204 });
  } catch (error) {
    return NextResponse.json(
      { error: 'Failed to delete user' },
      { status: 500 }
    );
  }
}

function formatScimUser(user: any) {
  return {
    schemas: ['urn:ietf:params:scim:schemas:core:2.0:User'],
    id: user.external_id,
    externalId: user.external_id,
    userName: user.attributes?.userName || user.email,
    emails: [{
      value: user.email,
      primary: true,
    }],
    active: user.attributes?.active !== false,
    meta: {
      resourceType: 'User',
      created: user.created_at,
      lastModified: user.updated_at,
    },
  };
}

function verifyScimToken(token: string, hash: string): boolean {
  const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
  return crypto.timingSafeEqual(Buffer.from(tokenHash), Buffer.from(hash));
}
```

## Phase 2: SOC-2 Compliance Infrastructure (Months 1-6)

### 1. Audit Logging System

```sql
-- database/migrations/006_audit_tables.sql

-- Comprehensive audit log
CREATE TABLE audit_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    event_type TEXT NOT NULL,
    event_category TEXT NOT NULL CHECK (event_category IN (
        'authentication', 'authorization', 'data_access', 
        'data_modification', 'configuration', 'security'
    )),
    actor_id UUID,
    actor_type TEXT CHECK (actor_type IN ('user', 'system', 'api')),
    org_id UUID REFERENCES organizations(id),
    resource_type TEXT,
    resource_id TEXT,
    ip_address INET,
    user_agent TEXT,
    metadata JSONB,
    risk_score INTEGER DEFAULT 0 CHECK (risk_score >= 0 AND risk_score <= 100),
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Data access log for sensitive operations
CREATE TABLE data_access_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES auth.users(id),
    org_id UUID REFERENCES organizations(id),
    table_name TEXT NOT NULL,
    operation TEXT NOT NULL CHECK (operation IN ('select', 'insert', 'update', 'delete')),
    row_ids TEXT[],
    columns_accessed TEXT[],
    query_hash TEXT,
    execution_time_ms INTEGER,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Security events for SOC-2 monitoring
CREATE TABLE security_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    event_type TEXT NOT NULL,
    severity TEXT NOT NULL CHECK (severity IN ('info', 'low', 'medium', 'high', 'critical')),
    description TEXT NOT NULL,
    affected_resources JSONB,
    detection_method TEXT,
    response_actions JSONB,
    resolved BOOLEAN DEFAULT FALSE,
    resolved_at TIMESTAMPTZ,
    resolved_by UUID REFERENCES auth.users(id),
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for performance and compliance queries
CREATE INDEX idx_audit_logs_event ON audit_logs(event_type, created_at DESC);
CREATE INDEX idx_audit_logs_actor ON audit_logs(actor_id, created_at DESC);
CREATE INDEX idx_audit_logs_org ON audit_logs(org_id, created_at DESC);
CREATE INDEX idx_audit_logs_risk ON audit_logs(risk_score) WHERE risk_score > 50;
CREATE INDEX idx_data_access_logs_user ON data_access_logs(user_id, created_at DESC);
CREATE INDEX idx_security_events_severity ON security_events(severity, resolved);

-- Partitioning for long-term storage
CREATE TABLE audit_logs_2024 PARTITION OF audit_logs 
    FOR VALUES FROM ('2024-01-01') TO ('2025-01-01');
```

### 2. Audit Logging Implementation (audit/lib/logger.ts)

```typescript
import { createClient } from '@/lib/supabase/server';

export interface AuditEvent {
  event: string;
  category?: 'authentication' | 'authorization' | 'data_access' | 
             'data_modification' | 'configuration' | 'security';
  actor_id?: string;
  actor_type?: 'user' | 'system' | 'api';
  org_id?: string;
  resource_type?: string;
  resource_id?: string;
  metadata?: Record<string, any>;
  risk_score?: number;
}

export async function auditLog(event: AuditEvent): Promise<void> {
  try {
    const supabase = createClient();
    
    // Determine event category if not provided
    const category = event.category || categorizeEvent(event.event);
    
    // Calculate risk score if not provided
    const riskScore = event.risk_score ?? calculateRiskScore(event);
    
    // Get request context
    const context = getRequestContext();
    
    await supabase.from('audit_logs').insert({
      event_type: event.event,
      event_category: category,
      actor_id: event.actor_id,
      actor_type: event.actor_type || 'user',
      org_id: event.org_id,
      resource_type: event.resource_type,
      resource_id: event.resource_id,
      ip_address: context.ip,
      user_agent: context.userAgent,
      metadata: {
        ...event.metadata,
        timestamp: new Date().toISOString(),
        request_id: context.requestId,
      },
      risk_score: riskScore,
    });
    
    // Alert on high-risk events
    if (riskScore >= 70) {
      await createSecurityAlert(event, riskScore);
    }
  } catch (error) {
    // Never fail the main operation due to audit logging
    console.error('Audit log error:', error);
    
    // Send to backup logging service
    await sendToBackupLogger(event, error);
  }
}

function categorizeEvent(eventType: string): string {
  const categories = {
    authentication: ['login', 'logout', 'sso', 'mfa'],
    authorization: ['permission', 'role', 'access'],
    data_access: ['view', 'read', 'export', 'download'],
    data_modification: ['create', 'update', 'delete'],
    configuration: ['settings', 'config', 'setup'],
    security: ['threat', 'violation', 'suspicious'],
  };
  
  for (const [category, keywords] of Object.entries(categories)) {
    if (keywords.some(keyword => eventType.includes(keyword))) {
      return category;
    }
  }
  
  return 'data_access';
}

function calculateRiskScore(event: AuditEvent): number {
  let score = 0;
  
  // High-risk event types
  const highRiskEvents = [
    'auth.failed_login_repeated',
    'auth.privilege_escalation',
    'data.mass_export',
    'security.api_abuse',
    'config.security_disabled',
  ];
  
  if (highRiskEvents.includes(event.event)) {
    score += 50;
  }
  
  // Suspicious patterns
  if (event.metadata?.failed_attempts > 5) score += 20;
  if (event.metadata?.unusual_time) score += 10;
  if (event.metadata?.new_location) score += 15;
  if (event.metadata?.api_rate_exceeded) score += 25;
  
  return Math.min(score, 100);
}

async function createSecurityAlert(event: AuditEvent, riskScore: number) {
  const supabase = createClient();
  
  await supabase.from('security_events').insert({
    event_type: `high_risk_${event.event}`,
    severity: riskScore >= 90 ? 'critical' : 'high',
    description: `High-risk event detected: ${event.event}`,
    affected_resources: {
      actor: event.actor_id,
      resource: event.resource_id,
      organization: event.org_id,
    },
    detection_method: 'risk_score_threshold',
    response_actions: {
      alert_sent: true,
      requires_review: true,
    },
  });
  
  // Send immediate notification
  await sendSecurityNotification(event, riskScore);
}

// Audit middleware for API routes
export function withAuditLog(
  handler: Function,
  eventType: string,
  options?: { highRisk?: boolean }
) {
  return async (req: Request, ...args: any[]) => {
    const startTime = Date.now();
    let response;
    let error;
    
    try {
      response = await handler(req, ...args);
      return response;
    } catch (e) {
      error = e;
      throw e;
    } finally {
      // Log after response
      setImmediate(async () => {
        await auditLog({
          event: eventType,
          actor_id: req.user?.id,
          org_id: req.user?.org_id,
          metadata: {
            method: req.method,
            path: req.url,
            duration_ms: Date.now() - startTime,
            status: response?.status || 500,
            error: error?.message,
          },
          risk_score: options?.highRisk ? 60 : undefined,
        });
      });
    }
  };
}
```

### 3. SOC-2 Control Implementation

#### Access Control (compliance/controls/AC-1.ts)
```typescript
import { createClient } from '@/lib/supabase/server';
import { auditLog } from '@/audit/lib/logger';

export class AccessControl {
  // AC-1: Access Control Policy
  static async enforceAccessPolicy(
    userId: string,
    resource: string,
    action: string
  ): Promise<boolean> {
    const supabase = createClient();
    
    // Get user's role and permissions
    const { data: user } = await supabase
      .from('organization_members')
      .select('role, permissions, org_id')
      .eq('user_id', userId)
      .single();
    
    if (!user) {
      await auditLog({
        event: 'access.denied_no_user',
        actor_id: userId,
        resource_type: resource,
        category: 'authorization',
        risk_score: 50,
      });
      return false;
    }
    
    // Check role-based access
    const hasAccess = this.checkRolePermission(user.role, resource, action);
    
    // Log access attempt
    await auditLog({
      event: hasAccess ? 'access.granted' : 'access.denied',
      actor_id: userId,
      org_id: user.org_id,
      resource_type: resource,
      category: 'authorization',
      metadata: {
        action,
        role: user.role,
        granted: hasAccess,
      },
    });
    
    return hasAccess;
  }
  
  // AC-2: Account Management
  static async createUserAccount(
    adminId: string,
    userData: {
      email: string;
      role: string;
      org_id: string;
    }
  ) {
    // Verify admin has permission
    const canCreate = await this.enforceAccessPolicy(
      adminId,
      'user_management',
      'create'
    );
    
    if (!canCreate) {
      throw new Error('Insufficient permissions');
    }
    
    const supabase = createClient();
    
    // Create user with least privilege principle
    const { data: user, error } = await supabase.auth.admin.createUser({
      email: userData.email,
      email_confirm: true,
      user_metadata: {
        role: userData.role,
        created_by: adminId,
      },
    });
    
    if (error) throw error;
    
    // Add to organization
    await supabase.from('organization_members').insert({
      user_id: user.user.id,
      org_id: userData.org_id,
      role: userData.role,
      invited_by: adminId,
    });
    
    // Audit log
    await auditLog({
      event: 'user.created',
      actor_id: adminId,
      org_id: userData.org_id,
      resource_id: user.user.id,
      category: 'configuration',
      metadata: {
        email: userData.email,
        role: userData.role,
      },
    });
    
    return user;
  }
  
  // AC-3: Access Enforcement
  static checkRolePermission(
    role: string,
    resource: string,
    action: string
  ): boolean {
    const permissions = {
      owner: ['*:*'], // All resources and actions
      admin: [
        'user_management:*',
        'settings:*',
        'data:read',
        'data:write',
        'export:*',
      ],
      member: [
        'data:read',
        'export:own',
        'settings:read',
      ],
      viewer: [
        'data:read',
      ],
    };
    
    const userPermissions = permissions[role] || [];
    
    // Check exact match or wildcard
    return userPermissions.some(perm => {
      const [permResource, permAction] = perm.split(':');
      return (
        (permResource === '*' || permResource === resource) &&
        (permAction === '*' || permAction === action)
      );
    });
  }
  
  // AC-7: Unsuccessful Login Attempts
  static async handleFailedLogin(
    email: string,
    ip: string,
    userAgent: string
  ) {
    const supabase = createClient();
    
    // Get recent failed attempts
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
    const { data: recentAttempts } = await supabase
      .from('audit_logs')
      .select('count')
      .eq('event_type', 'auth.login_failed')
      .eq('metadata->email', email)
      .gte('created_at', oneHourAgo.toISOString());
    
    const attemptCount = recentAttempts?.[0]?.count || 0;
    
    // Lock account after 5 failed attempts
    if (attemptCount >= 5) {
      await this.lockAccount(email);
      
      await auditLog({
        event: 'security.account_locked',
        category: 'security',
        metadata: {
          email,
          reason: 'excessive_failed_logins',
          attempt_count: attemptCount + 1,
        },
        risk_score: 80,
      });
    }
    
    // Log the failed attempt
    await auditLog({
      event: 'auth.login_failed',
      category: 'authentication',
      metadata: {
        email,
        ip,
        user_agent: userAgent,
        attempt_number: attemptCount + 1,
      },
      risk_score: attemptCount >= 3 ? 60 : 20,
    });
  }
  
  private static async lockAccount(email: string) {
    const supabase = createClient();
    
    const { data: user } = await supabase
      .from('auth.users')
      .select('id')
      .eq('email', email)
      .single();
    
    if (user) {
      await supabase.auth.admin.updateUserById(user.id, {
        banned_until: new Date(Date.now() + 30 * 60 * 1000).toISOString(), // 30 min
      });
    }
  }
}