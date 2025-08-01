import {
  cn,
  isValidUUID,
  isValidEmail,
  sanitizeFileName,
  escapeHtml,
  formatDate,
  formatRelativeTime,
  formatNumber,
  formatPercentage,
  getSeverityColor,
  calculateQualityGate,
  ClientRateLimit
} from '@/lib/utils'

describe('Utility Functions', () => {
  describe('cn (className utility)', () => {
    it('combines class names correctly', () => {
      expect(cn('btn', 'btn-primary')).toBe('btn btn-primary')
    })

    it('handles conditional classes', () => {
      expect(cn('btn', true && 'active', false && 'disabled')).toBe('btn active')
    })

    it('merges Tailwind classes correctly', () => {
      expect(cn('bg-red-500', 'bg-blue-500')).toBe('bg-blue-500')
    })
  })

  describe('Security Validation Functions', () => {
    describe('isValidUUID', () => {
      it('validates correct UUID v4', () => {
        expect(isValidUUID('123e4567-e89b-12d3-a456-426614174000')).toBe(true)
      })

      it('rejects invalid UUID format', () => {
        expect(isValidUUID('invalid-uuid')).toBe(false)
        expect(isValidUUID('123e4567-e89b-12d3-a456')).toBe(false)
        expect(isValidUUID('')).toBe(false)
      })

      it('rejects UUID with invalid version', () => {
        expect(isValidUUID('123e4567-e89b-02d3-a456-426614174000')).toBe(false)
      })
    })

    describe('isValidEmail', () => {
      it('validates correct email addresses', () => {
        expect(isValidEmail('test@example.com')).toBe(true)
        expect(isValidEmail('user.name+tag@domain.co.uk')).toBe(true)
      })

      it('rejects invalid email formats', () => {
        expect(isValidEmail('invalid-email')).toBe(false)
        expect(isValidEmail('@domain.com')).toBe(false)
        expect(isValidEmail('user@')).toBe(false)
        expect(isValidEmail('')).toBe(false)
      })

      it('rejects emails that are too long', () => {
        const longEmail = 'a'.repeat(300) + '@example.com'
        expect(isValidEmail(longEmail)).toBe(false)
      })
    })

    describe('sanitizeFileName', () => {
      it('sanitizes dangerous characters', () => {
        expect(sanitizeFileName('file<>name.txt')).toBe('file__name.txt')
        expect(sanitizeFileName('file|name?.txt')).toBe('file_name_.txt')
      })

      it('preserves safe characters', () => {
        expect(sanitizeFileName('safe-file_name.123.txt')).toBe('safe-file_name.123.txt')
      })

      it('limits file name length', () => {
        const longName = 'a'.repeat(300) + '.txt'
        const sanitized = sanitizeFileName(longName)
        expect(sanitized.length).toBeLessThanOrEqual(255)
      })
    })

    describe('escapeHtml', () => {
      it('escapes dangerous HTML characters', () => {
        expect(escapeHtml('<script>alert("xss")</script>'))
          .toBe('&lt;script&gt;alert(&quot;xss&quot;)&lt;/script&gt;')
      })

      it('escapes quotes and ampersands', () => {
        expect(escapeHtml('Tom & Jerry "cartoon"'))
          .toBe('Tom &amp; Jerry &quot;cartoon&quot;')
      })

      it('handles empty strings', () => {
        expect(escapeHtml('')).toBe('')
      })
    })
  })

  describe('Formatting Functions', () => {
    describe('formatDate', () => {
      const testDate = new Date('2024-01-15T10:30:00Z')

      it('formats date in short format', () => {
        const result = formatDate(testDate, 'short')
        expect(result).toMatch(/Jan 15, 2024/)
      })

      it('formats date in long format', () => {
        const result = formatDate(testDate, 'long')
        expect(result).toMatch(/January 15, 2024/)
      })

      it('handles invalid dates', () => {
        expect(formatDate('invalid-date')).toBe('Invalid date')
      })
    })

    describe('formatRelativeTime', () => {
      it('formats recent time correctly', () => {
        const now = new Date()
        const fiveMinutesAgo = new Date(now.getTime() - 5 * 60 * 1000)
        expect(formatRelativeTime(fiveMinutesAgo)).toBe('5 minutes ago')
      })

      it('formats very recent time as "just now"', () => {
        const now = new Date()
        const thirtySecondsAgo = new Date(now.getTime() - 30 * 1000)
        expect(formatRelativeTime(thirtySecondsAgo)).toBe('just now')
      })

      it('formats hours correctly', () => {
        const now = new Date()
        const twoHoursAgo = new Date(now.getTime() - 2 * 60 * 60 * 1000)
        expect(formatRelativeTime(twoHoursAgo)).toBe('2 hours ago')
      })
    })

    describe('formatNumber', () => {
      it('formats numbers with commas', () => {
        expect(formatNumber(1234567)).toBe('1,234,567')
      })

      it('formats compact numbers when requested', () => {
        expect(formatNumber(1500, true)).toBe('1.5K')
        expect(formatNumber(1000000, true)).toBe('1M')
      })

      it('handles small numbers in compact mode', () => {
        expect(formatNumber(500, true)).toBe('500')
      })
    })

    describe('formatPercentage', () => {
      it('calculates percentage correctly', () => {
        expect(formatPercentage(25, 100)).toBe('25%')
      })

      it('handles zero total', () => {
        expect(formatPercentage(10, 0)).toBe('0%')
      })

      it('rounds percentages', () => {
        expect(formatPercentage(1, 3)).toBe('33%')
      })
    })
  })

  describe('Severity and Quality Functions', () => {
    describe('getSeverityColor', () => {
      it('returns correct colors for severity levels', () => {
        expect(getSeverityColor('critical')).toMatch(/text-red-600/)
        expect(getSeverityColor('high')).toMatch(/text-orange-600/)
        expect(getSeverityColor('medium')).toMatch(/text-yellow-600/)
        expect(getSeverityColor('low')).toMatch(/text-blue-600/)
      })
    })

    describe('calculateQualityGate', () => {
      it('returns red status for critical warnings', () => {
        const result = calculateQualityGate(5, 10)
        expect(result.status).toBe('red')
        expect(result.message).toBe('Critical issues detected')
      })

      it('returns yellow status for many warnings', () => {
        const result = calculateQualityGate(0, 15)
        expect(result.status).toBe('yellow')
        expect(result.message).toBe('Multiple warnings detected')
      })

      it('returns green status for few warnings', () => {
        const result = calculateQualityGate(0, 5)
        expect(result.status).toBe('green')
        expect(result.message).toBe('All checks passed')
      })

      it('calculates score correctly', () => {
        const result = calculateQualityGate(1, 5)
        expect(result.score).toBeLessThan(50) // Should be low due to critical warning
      })
    })
  })

  describe('ClientRateLimit', () => {
    let rateLimit: ClientRateLimit

    beforeEach(() => {
      rateLimit = new ClientRateLimit(3, 1000) // 3 requests per second for testing
    })

    it('allows requests within limit', () => {
      expect(rateLimit.isAllowed('test-key')).toBe(true)
      expect(rateLimit.isAllowed('test-key')).toBe(true)
      expect(rateLimit.isAllowed('test-key')).toBe(true)
    })

    it('blocks requests exceeding limit', () => {
      // Use up the limit
      rateLimit.isAllowed('test-key')
      rateLimit.isAllowed('test-key')
      rateLimit.isAllowed('test-key')
      
      // Should now be blocked
      expect(rateLimit.isAllowed('test-key')).toBe(false)
    })

    it('handles different keys independently', () => {
      // Use up limit for first key
      rateLimit.isAllowed('key1')
      rateLimit.isAllowed('key1')
      rateLimit.isAllowed('key1')
      
      // Second key should still work
      expect(rateLimit.isAllowed('key2')).toBe(true)
    })

    it('resets limits for specific keys', () => {
      // Use up the limit
      rateLimit.isAllowed('test-key')
      rateLimit.isAllowed('test-key')
      rateLimit.isAllowed('test-key')
      
      expect(rateLimit.isAllowed('test-key')).toBe(false)
      
      // Reset and try again
      rateLimit.reset('test-key')
      expect(rateLimit.isAllowed('test-key')).toBe(true)
    })

    it('resets all limits when no key specified', () => {
      rateLimit.isAllowed('key1')
      rateLimit.isAllowed('key1')
      rateLimit.isAllowed('key1')
      
      rateLimit.reset() // Reset all
      
      expect(rateLimit.isAllowed('key1')).toBe(true)
    })
  })
})