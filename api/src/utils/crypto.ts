/**
 * Crypto utilities for secure token generation and validation
 */

export class CryptoUtils {
  /**
   * Generate a cryptographically secure random token
   */
  static async generateSecureToken(length: number = 32): Promise<string> {
    const array = new Uint8Array(length);
    crypto.getRandomValues(array);
    return Array.from(array, byte => byte.toString(16).padStart(2, '0')).join('');
  }
  
  /**
   * Generate a repository API token with metadata
   */
  static async generateRepoToken(repoId: string): Promise<string> {
    const timestamp = Date.now().toString(36);
    const random = await this.generateSecureToken(16);
    const prefix = 'scr_'; // SwiftConcur Repository token
    
    return `${prefix}${timestamp}_${random}`;
  }
  
  /**
   * Validate token format (basic format validation, not cryptographic verification)
   */
  static validateTokenFormat(token: string): boolean {
    const tokenPattern = /^scr_[a-z0-9]+_[a-f0-9]{32}$/;
    return tokenPattern.test(token);
  }
  
  /**
   * Hash a string using SHA-256
   */
  static async sha256(data: string): Promise<string> {
    const encoder = new TextEncoder();
    const dataBuffer = encoder.encode(data);
    const hashBuffer = await crypto.subtle.digest('SHA-256', dataBuffer);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
  }
  
  /**
   * Create a timing-safe string comparison
   */
  static timingSafeEqual(a: string, b: string): boolean {
    if (a.length !== b.length) {
      return false;
    }
    
    let result = 0;
    for (let i = 0; i < a.length; i++) {
      result |= a.charCodeAt(i) ^ b.charCodeAt(i);
    }
    
    return result === 0;
  }
  
  /**
   * Generate a rate limiting key
   */
  static generateRateLimitKey(prefix: string, identifier: string): string {
    return `${prefix}:${identifier}`;
  }
}