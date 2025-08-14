import { render, screen, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { TrendChart } from '@/components/charts/TrendChart'
import { createClient } from '@/lib/supabase/client'

// Mock the providers
const TestProviders = ({ children }: { children: React.ReactNode }) => {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  })
  
  return (
    <QueryClientProvider client={queryClient}>
      <div data-testid="security-provider">
        <div data-testid="auth-provider">
          {children}
        </div>
      </div>
    </QueryClientProvider>
  )
}

// Mock the security context
jest.mock('@/app/providers', () => ({
  useSecurity: jest.fn(() => ({
    reportSecurityEvent: jest.fn(),
    rateLimit: {
      isAllowed: jest.fn(() => true),
    },
  })),
}))

// Mock the realtime hook
jest.mock('@/lib/hooks/useRealtime', () => ({
  useRealtime: jest.fn(),
}))

// Mock Supabase client with chainable query methods that tests can control
jest.mock('@/lib/supabase/client', () => {
  const orderFn = jest.fn();
  // Allow tests to do: ...order().mockResolvedValue(...)
  orderFn.mockReturnValue(orderFn);
  const chain = {
    select: jest.fn(() => chain),
    gte: jest.fn(() => chain),
    order: orderFn,
  } as any;
  return {
    createClient: jest.fn(() => ({
      from: jest.fn(() => chain),
    })),
  };
});

// Mock recharts to avoid canvas issues in tests
jest.mock('recharts', () => ({
  LineChart: ({ children }: any) => <div data-testid="line-chart">{children}</div>,
  AreaChart: ({ children }: any) => <div data-testid="area-chart">{children}</div>,
  Line: () => <div data-testid="line" />,
  Area: () => <div data-testid="area" />,
  XAxis: () => <div data-testid="x-axis" />,
  YAxis: () => <div data-testid="y-axis" />,
  CartesianGrid: () => <div data-testid="cartesian-grid" />,
  Tooltip: () => <div data-testid="tooltip" />,
  ResponsiveContainer: ({ children }: any) => <div data-testid="responsive-container">{children}</div>,
}))

describe('TrendChart', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  it('renders loading state correctly', () => {
    // Mock the query to return loading state
    const mockSupabase = createClient()
    mockSupabase.from().select().gte().order().mockReturnValue({
      then: () => new Promise(() => {}) // Never resolves to keep loading
    })

    render(
      <TestProviders>
        <TrendChart />
      </TestProviders>
    )

    expect(screen.getByText('Warning Trends (30 days)')).toBeInTheDocument()
    // Should show loading skeleton
    expect(document.querySelector('.animate-pulse')).toBeInTheDocument()
  })

  it('renders error state correctly', async () => {
    // Mock the query to return an error
    const mockSupabase = createClient()
    mockSupabase.from().select().gte().order().mockRejectedValue(
      new Error('Database connection failed')
    )

    render(
      <TestProviders>
        <TrendChart />
      </TestProviders>
    )

    await waitFor(() => {
      expect(screen.getByText('Error Loading Trend Data')).toBeInTheDocument()
    })
    
    expect(screen.getByText('Database connection failed')).toBeInTheDocument()
  })

  it('renders empty state when no data available', async () => {
    // Mock the query to return empty data
    const mockSupabase = createClient()
    mockSupabase.from().select().gte().order().mockResolvedValue({
      data: [],
      error: null
    })

    render(
      <TestProviders>
        <TrendChart />
      </TestProviders>
    )

    await waitFor(() => {
      expect(screen.getByText('No data available for the selected period')).toBeInTheDocument()
    })
    
    expect(screen.getByText('Run some builds to see trends')).toBeInTheDocument()
  })

  it('renders chart with data correctly', async () => {
    // Mock the query to return trend data
    const mockData = [
      {
        date: '2024-01-01',
        total_warnings: 10,
        run_count: 2,
        critical_warnings: 1,
      },
      {
        date: '2024-01-02',
        total_warnings: 8,
        run_count: 1,
        critical_warnings: 0,
      },
    ]

    const mockSupabase = createClient()
    mockSupabase.from().select().gte().order().mockResolvedValue({
      data: mockData,
      error: null
    })

    render(
      <TestProviders>
        <TrendChart variant="area" />
      </TestProviders>
    )

    await waitFor(() => {
      expect(screen.getByTestId('area-chart')).toBeInTheDocument()
    })
    
    expect(screen.getByText('Warning Trends (30 days)')).toBeInTheDocument()
    expect(screen.getByText('2 data points • 18 total warnings')).toBeInTheDocument()
  })

  it('validates repo ID format for security', async () => {
    const { useSecurity } = require('@/app/providers')
    const mockReportSecurityEvent = jest.fn()
    useSecurity.mockReturnValue({
      reportSecurityEvent: mockReportSecurityEvent,
      rateLimit: { isAllowed: () => true },
    })

    const invalidRepoId = 'invalid-uuid-format'

    render(
      <TestProviders>
        <TrendChart repoId={invalidRepoId} />
      </TestProviders>
    )

    await waitFor(() => {
      expect(mockReportSecurityEvent).toHaveBeenCalledWith(
        'invalid_repo_id',
        { repoId: invalidRepoId }
      )
    })
  })

  it('handles different time periods', async () => {
    const mockSupabase = createClient()
    mockSupabase.from().select().gte().order().mockResolvedValue({
      data: [],
      error: null
    })

    const { rerender } = render(
      <TestProviders>
        <TrendChart days={7} />
      </TestProviders>
    )

    expect(screen.getByText('Warning Trends (7 days)')).toBeInTheDocument()

    rerender(
      <TestProviders>
        <TrendChart days={90} />
      </TestProviders>
    )

    expect(screen.getByText('Warning Trends (90 days)')).toBeInTheDocument()
  })

  it('shows trend analysis when comparison is enabled', async () => {
    const mockData = Array.from({ length: 14 }, (_, i) => ({
      date: `2024-01-${(i + 1).toString().padStart(2, '0')}`,
      total_warnings: i < 7 ? 10 : 15, // Increasing trend
      run_count: 1,
      critical_warnings: 0,
    }))

    const mockSupabase = createClient()
    mockSupabase.from().select().gte().order().mockResolvedValue({
      data: mockData,
      error: null
    })

    render(
      <TestProviders>
        <TrendChart showComparison={true} />
      </TestProviders>
    )

    await waitFor(() => {
      // Should show trend indicator for significant changes
      expect(document.querySelector('[class*="text-red-600"]')).toBeInTheDocument()
    })
  })

  it('switches between line and area chart variants', async () => {
    const mockSupabase = createClient()
    mockSupabase.from().select().gte().order().mockResolvedValue({
      data: [
        { date: '2024-01-01', total_warnings: 5, run_count: 1, critical_warnings: 0 }
      ],
      error: null
    })

    const { rerender } = render(
      <TestProviders>
        <TrendChart variant="line" />
      </TestProviders>
    )

    await waitFor(() => {
      expect(screen.getByTestId('line-chart')).toBeInTheDocument()
    })

    rerender(
      <TestProviders>
        <TrendChart variant="area" />
      </TestProviders>
    )

    await waitFor(() => {
      expect(screen.getByTestId('area-chart')).toBeInTheDocument()
    })
  })
})
