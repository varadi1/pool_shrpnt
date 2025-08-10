import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import AuditAnalytics, { ReportType } from '../AuditAnalytics';
import { AuditEntry, AuditFilter, AuditStats } from '../../../types/audit';

const mockEntries: AuditEntry[] = [
  {
    id: '1',
    timestamp: new Date().toISOString(),
    actor: {
      id: 'user1',
      name: 'John Doe',
      email: 'john@example.com',
      role: 'Admin',
      type: 'user',
    },
    action: {
      type: 'TEMPLATE_CREATED',
      category: 'template',
      severity: 'info',
      description: 'Created new template',
    },
    target: {
      type: 'template',
      id: 'template1',
      name: 'Test Template',
    },
    metadata: {
      correlationId: 'corr1',
      duration: 1000,
    },
    status: 'success',
  },
  {
    id: '2',
    timestamp: new Date(Date.now() - 86400000).toISOString(),
    actor: {
      id: 'user2',
      name: 'Jane Smith',
      email: 'jane@example.com',
      role: 'User',
      type: 'user',
    },
    action: {
      type: 'PERMISSION_GRANTED',
      category: 'security',
      severity: 'info',
      description: 'Granted permission',
    },
    target: {
      type: 'permission',
      id: 'perm1',
      name: 'Read Access',
    },
    metadata: {
      correlationId: 'corr2',
      duration: 500,
    },
    status: 'success',
  },
  {
    id: '3',
    timestamp: new Date(Date.now() - 172800000).toISOString(),
    actor: {
      id: 'user1',
      name: 'John Doe',
      email: 'john@example.com',
      role: 'Admin',
      type: 'user',
    },
    action: {
      type: 'ORDER_FAILED',
      category: 'provisioning',
      severity: 'error',
      description: 'Order failed',
    },
    target: {
      type: 'order',
      id: 'order1',
      name: 'Test Order',
    },
    metadata: {
      correlationId: 'corr3',
      duration: 2000,
    },
    status: 'failure',
  },
];

const mockStats: AuditStats = {
  totalEvents: 150,
  uniqueUsers: 25,
  avgResponseTime: '1.2s',
  eventsByCategory: {
    template: 50,
    provisioning: 30,
    security: 40,
    lock: 10,
    user: 15,
    system: 5,
  },
  eventsBySeverity: {
    info: 100,
    warning: 30,
    error: 15,
    critical: 5,
  },
  topUsers: [
    { userId: 'user1', userName: 'John Doe', eventCount: 45 },
    { userId: 'user2', userName: 'Jane Smith', eventCount: 30 },
  ],
  topActions: [
    { action: 'TEMPLATE_CREATED', count: 25 },
    { action: 'PERMISSION_GRANTED', count: 20 },
  ],
  failureRate: 10,
  successRate: 90,
};

const mockFilters: AuditFilter = {};

describe('AuditAnalytics', () => {
  const mockGenerateReport = vi.fn();

  beforeEach(() => {
    mockGenerateReport.mockClear();
  });

  it('renders statistics and report tabs', () => {
    render(
      <AuditAnalytics
        entries={mockEntries}
        filters={mockFilters}
        onGenerateReport={mockGenerateReport}
        stats={mockStats}
      />
    );

    expect(screen.getByText('Audit Analytics & Compliance')).toBeInTheDocument();
    expect(screen.getByText('Statistics')).toBeInTheDocument();
    expect(screen.getByText('Compliance Reports')).toBeInTheDocument();
  });

  it('displays statistics cards', () => {
    render(
      <AuditAnalytics
        entries={mockEntries}
        filters={mockFilters}
        onGenerateReport={mockGenerateReport}
        stats={mockStats}
      />
    );

    expect(screen.getByText('150')).toBeInTheDocument();
    expect(screen.getByText('Total Events')).toBeInTheDocument();
    expect(screen.getByText('25')).toBeInTheDocument();
    expect(screen.getByText('Unique Users')).toBeInTheDocument();
    expect(screen.getByText('33.33%')).toBeInTheDocument();
    expect(screen.getByText('Failure Rate')).toBeInTheDocument();
    expect(screen.getByText('1.2s')).toBeInTheDocument();
    expect(screen.getByText('Avg Response Time')).toBeInTheDocument();
  });

  it('calculates failure rate from entries', () => {
    render(
      <AuditAnalytics
        entries={mockEntries}
        filters={mockFilters}
        onGenerateReport={mockGenerateReport}
      />
    );

    expect(screen.getByText('33.33%')).toBeInTheDocument();
  });

  it('shows loading state', () => {
    render(
      <AuditAnalytics
        entries={[]}
        filters={mockFilters}
        loading={true}
        onGenerateReport={mockGenerateReport}
      />
    );

    expect(screen.getByText('Loading analytics...')).toBeInTheDocument();
  });

  it('shows error state', () => {
    const error = new Error('Failed to load');
    render(
      <AuditAnalytics
        entries={[]}
        filters={mockFilters}
        error={error}
        onGenerateReport={mockGenerateReport}
      />
    );

    expect(screen.getByText(/Failed to load analytics/)).toBeInTheDocument();
  });

  it('switches between statistics and reports tabs', () => {
    render(
      <AuditAnalytics
        entries={mockEntries}
        filters={mockFilters}
        onGenerateReport={mockGenerateReport}
        stats={mockStats}
      />
    );

    const reportsTab = screen.getByText('Compliance Reports');
    fireEvent.click(reportsTab);

    expect(screen.getByText('User Access Report')).toBeInTheDocument();
    expect(screen.getByText('Permission Changes Report')).toBeInTheDocument();
    expect(screen.getByText('System Access Report')).toBeInTheDocument();
  });

  it('displays events per day', () => {
    render(
      <AuditAnalytics
        entries={mockEntries}
        filters={mockFilters}
        onGenerateReport={mockGenerateReport}
      />
    );

    expect(screen.getByText('Events Per Day')).toBeInTheDocument();
  });

  it('displays top users by activity', () => {
    render(
      <AuditAnalytics
        entries={mockEntries}
        filters={mockFilters}
        onGenerateReport={mockGenerateReport}
      />
    );

    expect(screen.getByText('Top Users by Activity')).toBeInTheDocument();
    expect(screen.getByText('John Doe')).toBeInTheDocument();
    expect(screen.getByText('Jane Smith')).toBeInTheDocument();
  });

  it('displays most common actions', () => {
    render(
      <AuditAnalytics
        entries={mockEntries}
        filters={mockFilters}
        onGenerateReport={mockGenerateReport}
      />
    );

    expect(screen.getByText('Most Common Actions')).toBeInTheDocument();
    expect(screen.getByText('template created')).toBeInTheDocument();
    expect(screen.getByText('permission granted')).toBeInTheDocument();
  });

  it('changes time range', () => {
    render(
      <AuditAnalytics
        entries={mockEntries}
        filters={mockFilters}
        onGenerateReport={mockGenerateReport}
      />
    );

    const select = screen.getByRole('combobox');
    fireEvent.change(select, { target: { value: '30d' } });

    expect(select).toHaveValue('30d');
  });

  it('generates user access report', () => {
    render(
      <AuditAnalytics
        entries={mockEntries}
        filters={mockFilters}
        onGenerateReport={mockGenerateReport}
      />
    );

    const reportsTab = screen.getByText('Compliance Reports');
    fireEvent.click(reportsTab);

    const generateButtons = screen.getAllByText('Generate Report');
    fireEvent.click(generateButtons[0]);

    expect(mockGenerateReport).toHaveBeenCalledWith('user-access', {
      categories: ['user', 'security'],
    });
  });

  it('generates permission changes report', () => {
    render(
      <AuditAnalytics
        entries={mockEntries}
        filters={mockFilters}
        onGenerateReport={mockGenerateReport}
      />
    );

    const reportsTab = screen.getByText('Compliance Reports');
    fireEvent.click(reportsTab);

    const generateButtons = screen.getAllByText('Generate Report');
    fireEvent.click(generateButtons[1]);

    expect(mockGenerateReport).toHaveBeenCalledWith('permission-changes', {
      actionTypes: ['PERMISSION_GRANTED', 'PERMISSION_REVOKED', 'PERMISSION_MODIFIED'],
    });
  });

  it('generates system access report', () => {
    render(
      <AuditAnalytics
        entries={mockEntries}
        filters={mockFilters}
        onGenerateReport={mockGenerateReport}
      />
    );

    const reportsTab = screen.getByText('Compliance Reports');
    fireEvent.click(reportsTab);

    const generateButtons = screen.getAllByText('Generate Report');
    fireEvent.click(generateButtons[2]);

    expect(mockGenerateReport).toHaveBeenCalledWith('system-access', {
      categories: ['system'],
    });
  });

  it('handles empty entries list', () => {
    render(
      <AuditAnalytics
        entries={[]}
        filters={mockFilters}
        onGenerateReport={mockGenerateReport}
      />
    );

    expect(screen.getByText('0')).toBeInTheDocument();
    expect(screen.getByText('0.00%')).toBeInTheDocument();
  });

  it('displays report descriptions', () => {
    render(
      <AuditAnalytics
        entries={mockEntries}
        filters={mockFilters}
        onGenerateReport={mockGenerateReport}
      />
    );

    const reportsTab = screen.getByText('Compliance Reports');
    fireEvent.click(reportsTab);

    expect(screen.getByText(/Shows all user access activities/)).toBeInTheDocument();
    expect(screen.getByText(/Tracks all permission grants/)).toBeInTheDocument();
    expect(screen.getByText(/Details system-level access/)).toBeInTheDocument();
  });

  it('merges filters with report template filters', () => {
    const customFilters: AuditFilter = {
      dateRange: {
        from: new Date('2024-01-01'),
        to: new Date('2024-01-31'),
      },
    };

    render(
      <AuditAnalytics
        entries={mockEntries}
        filters={customFilters}
        onGenerateReport={mockGenerateReport}
      />
    );

    const reportsTab = screen.getByText('Compliance Reports');
    fireEvent.click(reportsTab);

    const generateButtons = screen.getAllByText('Generate Report');
    fireEvent.click(generateButtons[0]);

    expect(mockGenerateReport).toHaveBeenCalledWith('user-access', {
      dateRange: customFilters.dateRange,
      categories: ['user', 'security'],
    });
  });
});