import { render, screen } from '@testing-library/react'
import { StatCard } from '@/components/dashboard/StatCard'
import { AlertTriangle, CheckCircle } from 'lucide-react'

describe('StatCard', () => {
  it('renders basic stat card correctly', () => {
    render(
      <StatCard
        title="Total Warnings"
        value={42}
        icon={AlertTriangle}
        description="Across all repositories"
      />
    )

    expect(screen.getByText('Total Warnings')).toBeInTheDocument()
    expect(screen.getByText('42')).toBeInTheDocument()
    expect(screen.getByText('Across all repositories')).toBeInTheDocument()
  })

  it('renders loading state correctly', () => {
    render(
      <StatCard
        title="Total Warnings"
        value={0}
        icon={AlertTriangle}
        loading={true}
      />
    )

    expect(document.querySelector('.animate-pulse')).toBeInTheDocument()
    // Should show skeleton loading elements
    expect(document.querySelector('.bg-muted')).toBeInTheDocument()
  })

  it('displays trend information when provided', () => {
    render(
      <StatCard
        title="Critical Issues"
        value={5}
        icon={AlertTriangle}
        trend={15.5}
        variant="destructive"
      />
    )

    expect(screen.getByText('15.5%')).toBeInTheDocument()
    // For destructive variant, upward trend should be red (bad)
    expect(document.querySelector('[class*="text-red-600"]')).toBeInTheDocument()
  })

  it('handles different variants correctly', () => {
    const { rerender } = render(
      <StatCard
        title="Success Rate"
        value="95%"
        icon={CheckCircle}
        variant="success"
      />
    )

    // Success variant should have green styling
    expect(document.querySelector('[class*="border-green-200"]')).toBeInTheDocument()

    rerender(
      <StatCard
        title="Critical Issues"
        value={10}
        icon={AlertTriangle}
        variant="destructive"
      />
    )

    // Destructive variant should have red styling
    expect(document.querySelector('[class*="border-red-200"]')).toBeInTheDocument()
  })

  it('formats numbers correctly', () => {
    render(
      <StatCard
        title="Large Number"
        value={1234567}
        icon={CheckCircle}
      />
    )

    // Should format large numbers with commas
    expect(screen.getByText('1,234,567')).toBeInTheDocument()
  })

  it('shows progress bar for percentage success variant', () => {
    render(
      <StatCard
        title="Success Rate"
        value="85%"
        icon={CheckCircle}
        variant="success"
      />
    )

    // Should show progress bar for percentage values
    expect(document.querySelector('.bg-gradient-to-r')).toBeInTheDocument()
  })

  it('handles zero trend correctly', () => {
    render(
      <StatCard
        title="Stable Metric"
        value={100}
        icon={CheckCircle}
        trend={0}
      />
    )

    expect(screen.getByText('0.0%')).toBeInTheDocument()
    // Zero trend should have gray color
    expect(document.querySelector('[class*="text-gray-500"]')).toBeInTheDocument()
  })

  it('handles negative trend correctly for success variant', () => {
    render(
      <StatCard
        title="Success Rate"
        value="90%"
        icon={CheckCircle}
        variant="success"
        trend={-5.2}
      />
    )

    // Negative trend should show positive percentage but in red (bad for success metrics)
    expect(screen.getByText('5.2%')).toBeInTheDocument()
    expect(document.querySelector('[class*="text-red-600"]')).toBeInTheDocument()
  })

  it('applies custom className correctly', () => {
    render(
      <StatCard
        title="Custom Styled"
        value={123}
        icon={CheckCircle}
        className="custom-test-class"
      />
    )

    expect(document.querySelector('.custom-test-class')).toBeInTheDocument()
  })

  it('handles string values correctly', () => {
    render(
      <StatCard
        title="Status"
        value="Active"
        icon={CheckCircle}
        description="System is running"
      />
    )

    expect(screen.getByText('Active')).toBeInTheDocument()
    expect(screen.getByText('System is running')).toBeInTheDocument()
  })
})