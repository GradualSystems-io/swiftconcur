import { renderHook, act } from '@testing-library/react'
import { useRealtime } from '@/lib/hooks/useRealtime'
import { createClient } from '@/lib/supabase/client'

// Mock the providers
const mockReportSecurityEvent = jest.fn()
jest.mock('@/app/providers', () => ({
  useSecurity: () => ({
    reportSecurityEvent: mockReportSecurityEvent,
  }),
}))

// Mock console.log to reduce noise in tests
const originalConsoleLog = console.log
beforeAll(() => {
  console.log = jest.fn()
})

afterAll(() => {
  console.log = originalConsoleLog
})

describe('useRealtime', () => {
  const mockChannel = {
    on: jest.fn().mockReturnThis(),
    subscribe: jest.fn(),
    unsubscribe: jest.fn(),
    send: jest.fn(),
    state: 'joined',
  }

  beforeEach(() => {
    jest.clearAllMocks()
    const mockSupabase = createClient()
    mockSupabase.channel.mockReturnValue(mockChannel)
    mockSupabase.removeChannel = jest.fn()
  })

  it('does not subscribe when repoId is undefined', () => {
    const mockOnUpdate = jest.fn()
    
    renderHook(() => useRealtime(undefined, mockOnUpdate))
    
    const mockSupabase = createClient()
    expect(mockSupabase.channel).not.toHaveBeenCalled()
  })

  it('validates repoId format and reports security event for invalid UUID', () => {
    const mockOnUpdate = jest.fn()
    const invalidRepoId = 'invalid-uuid-format'
    
    renderHook(() => useRealtime(invalidRepoId, mockOnUpdate))
    
    expect(mockReportSecurityEvent).toHaveBeenCalledWith(
      'invalid_realtime_repo_id',
      { repoId: invalidRepoId }
    )
  })

  it('sets up realtime subscription for valid repoId', () => {
    const mockOnUpdate = jest.fn()
    const validRepoId = '123e4567-e89b-12d3-a456-426614174000'
    
    renderHook(() => useRealtime(validRepoId, mockOnUpdate))
    
    const mockSupabase = createClient()
    expect(mockSupabase.channel).toHaveBeenCalled()
    expect(mockChannel.on).toHaveBeenCalledTimes(3) // Three event listeners
    expect(mockChannel.subscribe).toHaveBeenCalled()
  })

  it('subscribes to INSERT events on runs table', () => {
    const mockOnUpdate = jest.fn()
    const validRepoId = '123e4567-e89b-12d3-a456-426614174000'
    
    renderHook(() => useRealtime(validRepoId, mockOnUpdate))
    
    expect(mockChannel.on).toHaveBeenCalledWith(
      'postgres_changes',
      {
        event: 'INSERT',
        schema: 'public',
        table: 'runs',
        filter: `repo_id=eq.${validRepoId}`,
      },
      expect.any(Function)
    )
  })

  it('subscribes to UPDATE events on runs table', () => {
    const mockOnUpdate = jest.fn()
    const validRepoId = '123e4567-e89b-12d3-a456-426614174000'
    
    renderHook(() => useRealtime(validRepoId, mockOnUpdate))
    
    expect(mockChannel.on).toHaveBeenCalledWith(
      'postgres_changes',  
      {
        event: 'UPDATE',
        schema: 'public',
        table: 'runs',
        filter: `repo_id=eq.${validRepoId}`,
      },
      expect.any(Function)
    )
  })

  it('subscribes to INSERT events on warnings table', () => {
    const mockOnUpdate = jest.fn()
    const validRepoId = '123e4567-e89b-12d3-a456-426614174000'
    
    renderHook(() => useRealtime(validRepoId, mockOnUpdate))
    
    expect(mockChannel.on).toHaveBeenCalledWith(
      'postgres_changes',
      {
        event: 'INSERT',
        schema: 'public',
        table: 'warnings',
      },
      expect.any(Function)
    )
  })

  it('calls onUpdate when new run is detected', () => {
    const mockOnUpdate = jest.fn()
    const mockOptions = { onNewRun: jest.fn() }
    const validRepoId = '123e4567-e89b-12d3-a456-426614174000'
    
    renderHook(() => useRealtime(validRepoId, mockOnUpdate, mockOptions))
    
    // Get the callback function for INSERT on runs
    const insertCallback = mockChannel.on.mock.calls.find(
      call => call[1].event === 'INSERT' && call[1].table === 'runs'
    )[2]
    
    const mockPayload = { new: { id: 'run-123', repo_id: validRepoId } }
    insertCallback(mockPayload)
    
    expect(mockOptions.onNewRun).toHaveBeenCalledWith(mockPayload.new)
    expect(mockOnUpdate).toHaveBeenCalled()
  })

  it('handles subscription errors correctly', () => {
    const mockOnUpdate = jest.fn()
    const mockOptions = { onError: jest.fn() }
    const validRepoId = '123e4567-e89b-12d3-a456-426614174000'
    
    renderHook(() => useRealtime(validRepoId, mockOnUpdate, mockOptions))
    
    // Get the subscribe callback
    const subscribeCallback = mockChannel.subscribe.mock.calls[0][0]
    const mockError = new Error('Connection failed')
    
    subscribeCallback('error', mockError)
    
    expect(mockOptions.onError).toHaveBeenCalledWith(mockError)
    expect(mockReportSecurityEvent).toHaveBeenCalledWith(
      'realtime_subscription_error',
      { error: mockError.message, repoId: validRepoId }
    )
  })

  it('reports security event when subscribed successfully', () => {
    const mockOnUpdate = jest.fn()
    const validRepoId = '123e4567-e89b-12d3-a456-426614174000'
    
    renderHook(() => useRealtime(validRepoId, mockOnUpdate))
    
    // Get the subscribe callback
    const subscribeCallback = mockChannel.subscribe.mock.calls[0][0]
    
    subscribeCallback('SUBSCRIBED', null)
    
    expect(mockReportSecurityEvent).toHaveBeenCalledWith(
      'realtime_subscribed',
      expect.objectContaining({ repoId: validRepoId })
    )
  })

  it('cleans up subscription on unmount', () => {
    const mockOnUpdate = jest.fn()
    const validRepoId = '123e4567-e89b-12d3-a456-426614174000'
    
    const { unmount } = renderHook(() => useRealtime(validRepoId, mockOnUpdate))
    
    const mockSupabase = createClient()
    
    unmount()
    
    expect(mockSupabase.removeChannel).toHaveBeenCalled()
  })

  it('returns connection status correctly', () => {
    const mockOnUpdate = jest.fn()
    const validRepoId = '123e4567-e89b-12d3-a456-426614174000'
    
    const { result } = renderHook(() => useRealtime(validRepoId, mockOnUpdate))
    
    expect(result.current.isConnected).toBe(true) // mockChannel.state is 'joined'
    expect(result.current.channel).toBe(mockChannel)
  })

  it('provides disconnect function', () => {
    const mockOnUpdate = jest.fn()
    const validRepoId = '123e4567-e89b-12d3-a456-426614174000'
    
    const { result } = renderHook(() => useRealtime(validRepoId, mockOnUpdate))
    
    const mockSupabase = createClient()
    
    act(() => {
      result.current.disconnect()
    })
    
    expect(mockSupabase.removeChannel).toHaveBeenCalledWith(mockChannel)
  })

  it('monitors connection health', async () => {
    const mockOnUpdate = jest.fn()
    const validRepoId = '123e4567-e89b-12d3-a456-426614174000'
    
    // Mock unhealthy connection
    mockChannel.state = 'errored'
    
    renderHook(() => useRealtime(validRepoId, mockOnUpdate))
    
    // Fast-forward time to trigger health check
    jest.advanceTimersByTime(60000)
    
    expect(mockReportSecurityEvent).toHaveBeenCalledWith(
      'realtime_connection_unhealthy',
      { state: 'errored', repoId: validRepoId }
    )
  })
})