import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { TemplateAnalytics } from '../TemplateAnalytics';
import { useTemplates } from '../../../hooks/useTemplates';
import type { Template, TemplateAnalytics as ITemplateAnalytics } from '../../../types/templates';

// Mock the useTemplates hook
vi.mock('../../../hooks/useTemplates');

// Mock Fluent UI LineChart component
vi.mock('@fluentui/react', async () => {
  const actual = await vi.importActual('@fluentui/react');
  return {
    ...actual,
    LineChart: ({ data }: any) => (
      <div data-testid="line-chart">
        {data.lineChartData[0].data.length} data points
      </div>
    ),
  };
});

describe('TemplateAnalytics', () => {
  let queryClient: QueryClient;
  const mockTemplate: Template = {
    id: 'template-1',
    name: 'Test Template',
    description: 'Test template description',
    status: 'active',
    currentVersion: '1.0.0',
    createdBy: 'user-1',
    createdAt: new Date('2024-01-01'),
    updatedAt: new Date('2024-01-15'),
    usageCount: 25,
    tags: ['production'],
  };

  const mockAnalytics: ITemplateAnalytics = {
    usageMetrics: {
      totalOrders: 100,
      activeOrders: 75,
      averageProvisionTime: 450,
      successRate: 98.5,
    },
    adoptionMetrics: {
      adoptionRate: 65,
      trendDirection: 'up',
      monthlyUsage: [
        { month: '2024-01', count: 10 },
        { month: '2024-02', count: 15 },
        { month: '2024-03', count: 20 },
        { month: '2024-04', count: 25 },
        { month: '2024-05', count: 30 },
      ],
    },
    performanceMetrics: {
      avgFolderCount: 42,
      avgDepth: 4,
      avgPermissionGroups: 6,
      provisioningErrors: [
        { error: 'Timeout during folder creation', count: 3 },
        { error: 'Permission denied', count: 2 },
      ],
    },
    orders: [
      {
        orderId: 'order-1',
        orderName: 'Project Alpha',
        templateVersion: '1.0.0',
        createdAt: new Date('2024-01-10'),
        status: 'active',
      },
      {
        orderId: 'order-2',
        orderName: 'Project Beta',
        templateVersion: '1.0.0',
        createdAt: new Date('2024-01-15'),
        status: 'completed',
      },
    ],
    usageHeatMap: [
      [10, 20, 30, 40, 50, 60, 70],
      [15, 25, 35, 45, 55, 65, 75],
      [20, 30, 40, 50, 60, 70, 80],
      [25, 35, 45, 55, 65, 75, 85],
    ],
  };

  const mockExportAnalytics = vi.fn();

  beforeEach(() => {
    queryClient = new QueryClient({
      defaultOptions: {
        queries: { retry: false },
        mutations: { retry: false },
      },
    });

    vi.clearAllMocks();

    const mockUseTemplates = vi.mocked(useTemplates);
    mockUseTemplates.mockReturnValue({
      analytics: {
        data: new Map([['template-1', mockAnalytics]]),
        useAnalytics: vi.fn(),
        useStatistics: vi.fn(),
        useTrends: vi.fn(),
        useMetrics: vi.fn(),
        useHeatMap: vi.fn(),
      },
      isLoadingAnalytics: false,
      analyticsError: null,
      exportAnalytics: {
        mutateAsync: mockExportAnalytics,
        isPending: false,
      } as any,
    } as any);
  });

  const renderComponent = (props = {}) => {
    return render(
      <QueryClientProvider client={queryClient}>
        <TemplateAnalytics
          templateId="template-1"
          template={mockTemplate}
          {...props}
        />
      </QueryClientProvider>
    );
  };

  it('should render analytics summary cards', () => {
    renderComponent();

    expect(screen.getByText('Total Orders')).toBeInTheDocument();
    expect(screen.getByText('100')).toBeInTheDocument();

    expect(screen.getByText('Active Orders')).toBeInTheDocument();
    expect(screen.getByText('75')).toBeInTheDocument();

    expect(screen.getByText('Adoption Rate')).toBeInTheDocument();
    expect(screen.getByText('65%')).toBeInTheDocument();
    expect(screen.getByText('↑ Trend')).toBeInTheDocument();
  });

  it('should render usage trends chart', async () => {
    renderComponent();

    const user = userEvent.setup();
    const trendsTab = screen.getByText('Usage Trends');
    await user.click(trendsTab);

    expect(screen.getByText('Monthly Usage')).toBeInTheDocument();
    expect(screen.getByTestId('line-chart')).toBeInTheDocument();
    expect(screen.getByText('5 data points')).toBeInTheDocument();
  });

  it('should render usage heat map', async () => {
    renderComponent();

    const user = userEvent.setup();
    const trendsTab = screen.getByText('Usage Trends');
    await user.click(trendsTab);

    expect(screen.getByText('Usage Heat Map')).toBeInTheDocument();
    expect(screen.getByText('Weekly usage intensity (darker = higher usage)')).toBeInTheDocument();
    
    // Check heat map cells are rendered
    const heatMapContainer = screen.getByText('Usage Heat Map').parentElement;
    const cells = heatMapContainer?.querySelectorAll('div[style*="background"]');
    expect(cells?.length).toBeGreaterThan(0);
  });

  it('should render orders list', async () => {
    renderComponent();

    const user = userEvent.setup();
    const ordersTab = screen.getByText('Orders');
    await user.click(ordersTab);

    expect(screen.getByText('Orders Using This Template')).toBeInTheDocument();
    expect(screen.getByText('order-1')).toBeInTheDocument();
    expect(screen.getByText('Project Alpha')).toBeInTheDocument();
    expect(screen.getByText('order-2')).toBeInTheDocument();
    expect(screen.getByText('Project Beta')).toBeInTheDocument();
  });

  it('should render performance metrics', async () => {
    renderComponent();

    const user = userEvent.setup();
    const performanceTab = screen.getByText('Performance');
    await user.click(performanceTab);

    expect(screen.getByText('Performance Metrics')).toBeInTheDocument();
    expect(screen.getByText('Average Provisioning Time')).toBeInTheDocument();
    expect(screen.getByText('450 seconds')).toBeInTheDocument();
    expect(screen.getByText('Success Rate')).toBeInTheDocument();
    expect(screen.getByText('98.5 %')).toBeInTheDocument();
  });

  it('should render common errors', async () => {
    renderComponent();

    const user = userEvent.setup();
    const performanceTab = screen.getByText('Performance');
    await user.click(performanceTab);

    expect(screen.getByText('Common Errors')).toBeInTheDocument();
    expect(screen.getByText('Timeout during folder creation')).toBeInTheDocument();
    expect(screen.getByText('3 occurrences')).toBeInTheDocument();
    expect(screen.getByText('Permission denied')).toBeInTheDocument();
    expect(screen.getByText('2 occurrences')).toBeInTheDocument();
  });

  it('should handle time range selection', async () => {
    renderComponent();

    const user = userEvent.setup();
    const timeRangeDropdown = screen.getByRole('combobox', { name: /time range/i });
    
    await user.click(timeRangeDropdown);
    const option = await screen.findByText('Last 90 days');
    await user.click(option);

    // Verify dropdown value changed
    expect(timeRangeDropdown).toHaveTextContent('Last 90 days');
  });

  it('should handle export format selection', async () => {
    renderComponent();

    const user = userEvent.setup();
    const exportDropdown = screen.getByRole('combobox', { name: /export format/i });
    
    await user.click(exportDropdown);
    const option = await screen.findByText('PDF Report');
    await user.click(option);

    // Verify dropdown value changed
    expect(exportDropdown).toHaveTextContent('PDF Report');
  });

  it('should handle export button click', async () => {
    renderComponent();

    const user = userEvent.setup();
    const exportButton = screen.getByRole('button', { name: /export/i });
    
    await user.click(exportButton);

    await waitFor(() => {
      expect(mockExportAnalytics).toHaveBeenCalledWith({
        templateId: 'template-1',
        format: 'csv',
        timeRange: '30d',
      });
    });
  });

  it('should show loading state', () => {
    const mockUseTemplates = vi.mocked(useTemplates);
    mockUseTemplates.mockReturnValue({
      analytics: {
        data: new Map(),
      },
      isLoadingAnalytics: true,
      analyticsError: null,
      exportAnalytics: {
        mutateAsync: mockExportAnalytics,
        isPending: false,
      } as any,
    } as any);

    renderComponent();

    expect(screen.getByText('Loading analytics...')).toBeInTheDocument();
  });

  it('should show error state', () => {
    const mockUseTemplates = vi.mocked(useTemplates);
    mockUseTemplates.mockReturnValue({
      analytics: {
        data: new Map(),
      },
      isLoadingAnalytics: false,
      analyticsError: new Error('Failed to load analytics'),
      exportAnalytics: {
        mutateAsync: mockExportAnalytics,
        isPending: false,
      } as any,
    } as any);

    renderComponent();

    expect(screen.getByText(/Failed to load analytics/)).toBeInTheDocument();
  });

  it('should show no data message', () => {
    const mockUseTemplates = vi.mocked(useTemplates);
    mockUseTemplates.mockReturnValue({
      analytics: {
        data: new Map(),
      },
      isLoadingAnalytics: false,
      analyticsError: null,
      exportAnalytics: {
        mutateAsync: mockExportAnalytics,
        isPending: false,
      } as any,
    } as any);

    renderComponent();

    expect(screen.getByText('No analytics data available for this template')).toBeInTheDocument();
  });

  it('should disable export button when export is pending', () => {
    const mockUseTemplates = vi.mocked(useTemplates);
    mockUseTemplates.mockReturnValue({
      analytics: {
        data: new Map([['template-1', mockAnalytics]]),
      },
      isLoadingAnalytics: false,
      analyticsError: null,
      exportAnalytics: {
        mutateAsync: mockExportAnalytics,
        isPending: true,
      } as any,
    } as any);

    renderComponent();

    const exportButton = screen.getByRole('button', { name: /export/i });
    expect(exportButton).toBeDisabled();
  });

  it('should display correct trend indicators', async () => {
    renderComponent();

    const user = userEvent.setup();
    const performanceTab = screen.getByText('Performance');
    await user.click(performanceTab);

    // Check success rate has up trend (>95%)
    const successRateRow = screen.getByText('Success Rate').closest('tr');
    expect(within(successRateRow!).getByText('↑ 2%')).toBeInTheDocument();

    // Check stable trends
    const folderCountRow = screen.getByText('Average Folder Count').closest('tr');
    expect(within(folderCountRow!).getByText('→ 0%')).toBeInTheDocument();
  });

  it('should format dates correctly in orders list', async () => {
    renderComponent();

    const user = userEvent.setup();
    const ordersTab = screen.getByText('Orders');
    await user.click(ordersTab);

    // Check date formatting
    expect(screen.getByText('1/10/2024')).toBeInTheDocument();
    expect(screen.getByText('1/15/2024')).toBeInTheDocument();
  });

  it('should apply correct status colors in orders list', async () => {
    renderComponent();

    const user = userEvent.setup();
    const ordersTab = screen.getByText('Orders');
    await user.click(ordersTab);

    const activeStatus = screen.getByText('active');
    expect(activeStatus).toHaveStyle({ color: '#107C10' });

    const completedStatus = screen.getByText('completed');
    expect(completedStatus).toHaveStyle({ color: '#005A9E' });
  });
});