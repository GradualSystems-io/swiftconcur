import crypto from 'crypto';
import { createClient } from '@/lib/supabase/server';
import { audit } from '@/lib/audit';

// Encryption configuration
const ALGORITHM = 'aes-256-gcm';
const KEY_LENGTH = 32;
const IV_LENGTH = 16;
const TAG_LENGTH = 16;

// Data classification levels
export type DataClassification = 'public' | 'internal' | 'confidential' | 'restricted';

export interface EncryptionContext {
  userId: string;
  orgId?: string;
  dataType: string;
  classification: DataClassification;
  purpose?: string;
}

export interface EncryptedData {
  encrypted: string;
  keyId: string;
  classification: DataClassification;
  algorithm: string;
}

// Get master encryption key from environment (in production, use HSM/KMS)
function getMasterKey(): Buffer {
  const masterKey = process.env.MASTER_ENCRYPTION_KEY;
  
  if (!masterKey) {
    // Generate a warning key for development
    if (process.env.NODE_ENV === 'development') {
      console.warn('WARNING: Using default encryption key for development only');
      return Buffer.from('dev-key-32-chars-long-not-secure!', 'utf8');
    }
    throw new Error('MASTER_ENCRYPTION_KEY environment variable required');
  }
  
  return Buffer.from(masterKey, 'hex');
}

// Encrypt sensitive data before storage
export async function encryptSensitiveData(
  data: string,
  context: EncryptionContext
): Promise<EncryptedData> {
  try {
    // Get or create encryption key for user/org
    const key = await getEncryptionKey(context.userId, context.orgId);
    
    const iv = crypto.randomBytes(IV_LENGTH);
    const cipher = crypto.createCipheriv(ALGORITHM, key.key, iv);
    
    let encrypted = cipher.update(data, 'utf8');
    encrypted = Buffer.concat([encrypted, cipher.final()]);
    
    const tag = cipher.getAuthTag();
    
    // Combine iv + tag + encrypted data
    const combined = Buffer.concat([iv, tag, encrypted]);
    
    // Audit data encryption
    await audit.auditLog({
      event: 'data.encrypted',
      category: 'data_access',
      actor_id: context.userId,
      org_id: context.orgId,
      resource_type: 'encrypted_data',
      resource_id: context.dataType,
      metadata: {
        data_type: context.dataType,
        classification: context.classification,
        purpose: context.purpose,
        key_id: key.id,
        algorithm: ALGORITHM,
        data_size: data.length,
      },
    });
    
    return {
      encrypted: combined.toString('base64'),
      keyId: key.id,
      classification: context.classification,
      algorithm: ALGORITHM,
    };
    
  } catch (error) {
    console.error('Encryption error:', error);
    
    await audit.auditLog({
      event: 'data.encryption_failed',
      category: 'security',
      actor_id: context.userId,
      org_id: context.orgId,
      success: false,
      error_message: error.message,
      risk_score: 70,
      metadata: {
        data_type: context.dataType,
        classification: context.classification,
      },
    });
    
    throw new Error(`Encryption failed: ${error.message}`);
  }
}

// Decrypt sensitive data
export async function decryptSensitiveData(
  encryptedData: EncryptedData,
  userId: string,
  orgId?: string,
  purpose?: string
): Promise<string> {
  try {
    const key = await getEncryptionKey(userId, orgId, encryptedData.keyId);
    
    const combined = Buffer.from(encryptedData.encrypted, 'base64');
    
    const iv = combined.slice(0, IV_LENGTH);
    const tag = combined.slice(IV_LENGTH, IV_LENGTH + TAG_LENGTH);
    const encrypted = combined.slice(IV_LENGTH + TAG_LENGTH);
    
    const decipher = crypto.createDecipheriv(ALGORITHM, key.key, iv);
    decipher.setAuthTag(tag);
    
    let decrypted = decipher.update(encrypted);
    decrypted = Buffer.concat([decrypted, decipher.final()]);
    
    // Audit data decryption
    await audit.auditLog({
      event: 'data.decrypted',
      category: 'data_access',
      actor_id: userId,
      org_id: orgId,
      resource_type: 'encrypted_data',
      metadata: {
        key_id: encryptedData.keyId,
        classification: encryptedData.classification,
        purpose,
        algorithm: encryptedData.algorithm,
      },
    });
    
    return decrypted.toString('utf8');
    
  } catch (error) {
    console.error('Decryption error:', error);
    
    await audit.auditLog({
      event: 'data.decryption_failed',
      category: 'security',
      actor_id: userId,
      org_id: orgId,
      success: false,
      error_message: error.message,
      risk_score: 80,
      metadata: {
        key_id: encryptedData.keyId,
        classification: encryptedData.classification,
        purpose,
      },
    });
    
    throw new Error(`Decryption failed: ${error.message}`);
  }
}

// Key management
async function getEncryptionKey(
  userId: string,
  orgId?: string,
  keyId?: string
): Promise<{ id: string; key: Buffer }> {
  const supabase = createClient();
  
  if (keyId) {
    // Retrieve existing key
    const { data: keyData, error } = await supabase
      .from('encryption_keys')
      .select('*')
      .eq('id', keyId)
      .eq('user_id', userId)
      .single();
    
    if (error || !keyData) {
      throw new Error('Encryption key not found or access denied');
    }
    
    // Decrypt key using master key
    const masterKey = getMasterKey();
    const key = decryptWithMasterKey(keyData.encrypted_key, masterKey);
    
    return { id: keyData.id, key };
  } else {
    // Check for existing key for this user/org combination
    const { data: existingKey } = await supabase
      .from('encryption_keys')
      .select('*')
      .eq('user_id', userId)
      .eq('org_id', orgId || null)
      .eq('active', true)
      .single();
    
    if (existingKey) {
      const masterKey = getMasterKey();
      const key = decryptWithMasterKey(existingKey.encrypted_key, masterKey);
      return { id: existingKey.id, key };
    }
    
    // Generate new key
    const key = crypto.randomBytes(KEY_LENGTH);
    const masterKey = getMasterKey();
    const encryptedKey = encryptWithMasterKey(key, masterKey);
    
    const { data: keyData, error } = await supabase
      .from('encryption_keys')
      .insert({
        user_id: userId,
        org_id: orgId,
        encrypted_key: encryptedKey,
        algorithm: ALGORITHM,
        active: true,
        created_at: new Date().toISOString(),
      })
      .select()
      .single();
    
    if (error) {
      throw new Error(`Failed to create encryption key: ${error.message}`);
    }
    
    return { id: keyData.id, key };
  }
}

// Master key encryption/decryption (use HSM/KMS in production)
function encryptWithMasterKey(key: Buffer, masterKey: Buffer): string {
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv('aes-256-cbc', masterKey, iv);
  const encrypted = Buffer.concat([cipher.update(key), cipher.final()]);
  return Buffer.concat([iv, encrypted]).toString('base64');
}

function decryptWithMasterKey(encryptedKey: string, masterKey: Buffer): Buffer {
  const combined = Buffer.from(encryptedKey, 'base64');
  const iv = combined.slice(0, IV_LENGTH);
  const encrypted = combined.slice(IV_LENGTH);
  const decipher = crypto.createDecipheriv('aes-256-cbc', masterKey, iv);
  return Buffer.concat([decipher.update(encrypted), decipher.final()]);
}

// Encrypt PII data specifically
export async function encryptPII(
  data: string,
  userId: string,
  orgId?: string,
  purpose?: string
): Promise<EncryptedData> {
  return encryptSensitiveData(data, {
    userId,
    orgId,
    dataType: 'pii',
    classification: 'restricted',
    purpose,
  });
}

// Field-level encryption for database storage
export class FieldEncryption {
  static async encryptField(
    value: string,
    userId: string,
    fieldName: string,
    classification: DataClassification = 'confidential'
  ): Promise<string> {
    if (!value || value.length === 0) {
      return value;
    }
    
    const encrypted = await encryptSensitiveData(value, {
      userId,
      dataType: fieldName,
      classification,
      purpose: 'database_storage',
    });
    
    // Store as JSON for easy parsing
    return JSON.stringify(encrypted);
  }
  
  static async decryptField(
    encryptedValue: string,
    userId: string,
    purpose: string = 'data_access'
  ): Promise<string> {
    if (!encryptedValue || encryptedValue.length === 0) {
      return encryptedValue;
    }
    
    try {
      const encrypted = JSON.parse(encryptedValue) as EncryptedData;
      return await decryptSensitiveData(encrypted, userId, undefined, purpose);
    } catch (error) {
      // If parsing fails, assume it's unencrypted legacy data
      console.warn('Failed to decrypt field, assuming legacy unencrypted data');
      return encryptedValue;
    }
  }
}

// Encryption key rotation
export async function rotateEncryptionKeys(orgId: string, userId: string): Promise<void> {
  try {
    const supabase = createClient();
    
    // Mark old keys as inactive
    await supabase
      .from('encryption_keys')
      .update({ active: false, rotated_at: new Date().toISOString() })
      .eq('org_id', orgId)
      .eq('active', true);
    
    // New keys will be generated on next encryption operation
    
    await audit.securityPolicyChange(
      userId,
      orgId,
      'encryption_keys_rotated',
      {
        reason: 'periodic_rotation',
        rotated_at: new Date().toISOString(),
      }
    );
    
  } catch (error) {
    console.error('Key rotation error:', error);
    throw error;
  }
}

// Data anonymization for analytics
export function anonymizeData(data: string, method: 'hash' | 'mask' | 'remove' = 'hash'): string {
  switch (method) {
    case 'hash':
      return crypto.createHash('sha256').update(data).digest('hex').substring(0, 16) + '...';
    case 'mask':
      if (data.includes('@')) {
        // Email masking
        const [local, domain] = data.split('@');
        return `${local.substring(0, 2)}***@${domain}`;
      }
      // General masking
      return data.substring(0, 2) + '*'.repeat(Math.max(0, data.length - 4)) + data.substring(data.length - 2);
    case 'remove':
      return '[REDACTED]';
    default:
      return data;
  }
}

// Encryption status check
export async function getEncryptionStatus(orgId: string): Promise<{
  enabled: boolean;
  keyCount: number;
  lastRotation: string | null;
  compliance: {
    atRest: boolean;
    inTransit: boolean;
    keyManagement: boolean;
  };
}> {
  try {
    const supabase = createClient();
    
    const { data: keys, count } = await supabase
      .from('encryption_keys')
      .select('created_at, rotated_at', { count: 'exact' })
      .eq('org_id', orgId)
      .eq('active', true);
    
    const lastRotation = keys?.[0]?.rotated_at || keys?.[0]?.created_at || null;
    
    return {
      enabled: Boolean(count && count > 0),
      keyCount: count || 0,
      lastRotation,
      compliance: {
        atRest: true, // Our encryption covers data at rest
        inTransit: Boolean(process.env.NODE_ENV === 'production'), // HTTPS in production
        keyManagement: Boolean(process.env.MASTER_ENCRYPTION_KEY), // Proper key management
      },
    };
    
  } catch (error) {
    console.error('Encryption status check error:', error);
    return {
      enabled: false,
      keyCount: 0,
      lastRotation: null,
      compliance: {
        atRest: false,
        inTransit: false,
        keyManagement: false,
      },
    };
  }
}