import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { MetricCard } from '../MetricCard';
import { FluentProvider } from '@fluentui/react-components';
import { lightTheme } from '@/config/theme.config';

const renderWithProviders = (component: React.ReactElement) => {
  return render(
    <FluentProvider theme={lightTheme}>
      {component}
    </FluentProvider>
  );
};

describe('MetricCard', () => {
  it('renders title and value', () => {
    renderWithProviders(
      <MetricCard title="Test Metric" value={42} />
    );
    
    expect(screen.getByText('Test Metric')).toBeInTheDocument();
    expect(screen.getByText('42')).toBeInTheDocument();
  });

  it('shows loading state', () => {
    renderWithProviders(
      <MetricCard title="Test Metric" loading={true} />
    );
    
    expect(screen.getByText('Test Metric')).toBeInTheDocument();
    expect(screen.getByRole('progressbar')).toBeInTheDocument();
  });

  it('shows error state', () => {
    renderWithProviders(
      <MetricCard title="Test Metric" error={true} />
    );
    
    expect(screen.getByText('Test Metric')).toBeInTheDocument();
    expect(screen.getByText('Failed to load')).toBeInTheDocument();
  });

  it('renders with subtitle', () => {
    renderWithProviders(
      <MetricCard title="Test Metric" value={42} subtitle="Test subtitle" />
    );
    
    expect(screen.getByText('Test subtitle')).toBeInTheDocument();
  });

  it('applies warning status correctly', () => {
    renderWithProviders(
      <MetricCard title="Test Metric" value={10} status="warning" />
    );
    
    expect(screen.getByText('10')).toBeInTheDocument();
  });

  it('applies error status correctly', () => {
    renderWithProviders(
      <MetricCard title="Test Metric" value={5} status="error" />
    );
    
    expect(screen.getByText('5')).toBeInTheDocument();
  });

  it('shows dash when value is undefined', () => {
    renderWithProviders(
      <MetricCard title="Test Metric" />
    );
    
    expect(screen.getByText('-')).toBeInTheDocument();
  });
});