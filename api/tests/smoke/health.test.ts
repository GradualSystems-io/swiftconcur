/**
 * Smoke tests for SwiftConcur API health endpoints
 * These tests run against deployed worker environments
 */

import { describe, it, expect, beforeAll } from 'vitest'

describe('API Health Smoke Tests', () => {
  const WORKER_URL = process.env.WORKER_URL || 'http://localhost:8787'
  
  beforeAll(() => {
    console.log(`🏥 Running smoke tests against: ${WORKER_URL}`)
  })

  it('should respond to basic health check', async () => {
    const response = await fetch(`${WORKER_URL}/health`)
    
    expect(response.status).toBe(200)
    expect(response.headers.get('content-type')).toContain('application/json')
    
    const health = await response.json()
    expect(health).toHaveProperty('status', 'healthy')
    expect(health).toHaveProperty('timestamp')
    expect(health).toHaveProperty('version')
    expect(health).toHaveProperty('environment')
  })

  it('should respond to detailed health check', async () => {
    const response = await fetch(`${WORKER_URL}/health?detailed=true`)
    
    expect(response.status).toBe(200)
    
    const health = await response.json()
    expect(health).toHaveProperty('status', 'healthy')
    expect(health).toHaveProperty('services')
    
    // Services health is optional but structure should be correct
    if (health.services) {
      expect(health.services).toHaveProperty('database')
      expect(health.services).toHaveProperty('ai')
      expect(health.services).toHaveProperty('storage')
    }
  })

  it('should return 404 for non-existent endpoints', async () => {
    const response = await fetch(`${WORKER_URL}/non-existent-endpoint`)
    
    expect(response.status).toBe(404)
    
    const error = await response.json()
    expect(error).toHaveProperty('success', false)
    expect(error).toHaveProperty('error', 'Endpoint not found')
  })

  it('should have proper CORS headers', async () => {
    const response = await fetch(`${WORKER_URL}/health`)
    
    expect(response.headers.get('access-control-allow-origin')).toBe('*')
    expect(response.headers.get('access-control-allow-methods')).toContain('GET')
  })

  it('should handle OPTIONS requests', async () => {
    const response = await fetch(`${WORKER_URL}/health`, {
      method: 'OPTIONS'
    })
    
    expect(response.status).toBe(200)
    expect(response.headers.get('access-control-allow-origin')).toBe('*')
    expect(response.headers.get('access-control-allow-methods')).toBeTruthy()
  })

  it('should respond quickly to health checks', async () => {
    const startTime = Date.now()
    const response = await fetch(`${WORKER_URL}/health`)
    const endTime = Date.now()
    
    const responseTime = endTime - startTime
    
    expect(response.status).toBe(200)
    expect(responseTime).toBeLessThan(5000) // 5 seconds max for health check
  })

  it('should reject requests without proper authentication on protected endpoints', async () => {
    const response = await fetch(`${WORKER_URL}/v1/warnings`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        warnings: []
      })
    })
    
    expect(response.status).toBe(401)
    
    const error = await response.json()
    expect(error).toHaveProperty('success', false)
    expect(error.error).toContain('authentication')
  })
})