import React, { useMemo } from 'react';
import {
  Card,
  CardHeader,
  Text,
  makeStyles,
  tokens,
  Dropdown,
  Option,
  Button,
  Spinner,
  MessageBar,
  MessageBarBody,
  MessageBarTitle,
  TabList,
  Tab,
  DataGrid,
  DataGridHeader,
  DataGridRow,
  DataGridHeaderCell,
  DataGridBody,
  DataGridCell,
  createTableColumn,
} from '@fluentui/react-components';
import { ArrowDownload24Regular } from '@fluentui/react-icons';
import { useTemplates } from '../../hooks/useTemplates';
import type { 
  TemplateAnalytics as ITemplateAnalytics,
  TemplateUsageEntry,
  PerformanceMetric,
  Template,
} from '../../types/templates';

const useStyles = makeStyles({
  container: {
    display: 'flex',
    flexDirection: 'column',
    gap: tokens.spacingVerticalL,
  },
  header: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  controls: {
    display: 'flex',
    gap: tokens.spacingHorizontalM,
    alignItems: 'center',
  },
  summaryCards: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
    gap: tokens.spacingHorizontalL,
  },
  card: {
    padding: tokens.spacingVerticalM,
  },
  cardValue: {
    fontSize: tokens.fontSizeHero700,
    fontWeight: tokens.fontWeightBold,
  },
  cardLabel: {
    color: tokens.colorNeutralForeground3,
    fontSize: tokens.fontSizeBase200,
  },
  trend: {
    fontSize: tokens.fontSizeBase300,
  },
  trendUp: {
    color: tokens.colorPaletteGreenForeground1,
  },
  trendDown: {
    color: tokens.colorPaletteRedForeground1,
  },
  trendStable: {
    color: tokens.colorNeutralForeground3,
  },
  tabContent: {
    paddingTop: tokens.spacingVerticalL,
    display: 'flex',
    flexDirection: 'column',
    gap: tokens.spacingVerticalL,
  },
  chart: {
    height: '300px',
    width: '100%',
    border: `1px solid ${tokens.colorNeutralStroke1}`,
    borderRadius: tokens.borderRadiusMedium,
    padding: tokens.spacingVerticalM,
  },
  heatMap: {
    display: 'flex',
    flexDirection: 'column',
    gap: '2px',
  },
  heatMapRow: {
    display: 'flex',
    gap: '2px',
  },
  heatMapCell: {
    width: '20px',
    height: '20px',
    border: `1px solid ${tokens.colorNeutralStroke2}`,
  },
  errorList: {
    display: 'flex',
    flexDirection: 'column',
    gap: tokens.spacingVerticalS,
  },
  errorItem: {
    display: 'flex',
    justifyContent: 'space-between',
    padding: tokens.spacingVerticalS,
    backgroundColor: tokens.colorNeutralBackground2,
    borderRadius: tokens.borderRadiusSmall,
  },
  loader: {
    display: 'flex',
    justifyContent: 'center',
    padding: tokens.spacingVerticalXXL,
  },
});

interface TemplateAnalyticsProps {
  templateId: string;
  template?: Template;
}

export const TemplateAnalytics: React.FC<TemplateAnalyticsProps> = ({ 
  templateId,
  template 
}) => {
  const styles = useStyles();
  const [selectedTab, setSelectedTab] = React.useState<string>('trends');
  const [timeRange, setTimeRange] = React.useState<string>('30d');
  const [exportFormat, setExportFormat] = React.useState<string>('csv');
  
  const { 
    analytics,
    isLoadingAnalytics,
    analyticsError,
    exportAnalytics 
  } = useTemplates();

  const currentAnalytics = analytics.data?.get(templateId);

  const handleTabSelect = (event: any, data: any) => {
    setSelectedTab(data.value as string);
  };

  const handleExport = async () => {
    try {
      await exportAnalytics.mutateAsync({
        templateId,
        format: exportFormat as 'csv' | 'json' | 'pdf',
        timeRange,
      });
    } catch (error) {
      console.error('Failed to export analytics:', error);
    }
  };

  const usageColumns: TableColumnDefinition<TemplateUsageEntry>[] = [
    createTableColumn<TemplateUsageEntry>({
      columnId: 'orderId',
      renderHeaderCell: () => 'Order ID',
      renderCell: (item) => item.orderId,
    }),
    createTableColumn<TemplateUsageEntry>({
      columnId: 'orderName',
      renderHeaderCell: () => 'Order Name',
      renderCell: (item) => item.orderName,
    }),
    createTableColumn<TemplateUsageEntry>({
      columnId: 'version',
      renderHeaderCell: () => 'Template Version',
      renderCell: (item) => item.templateVersion,
    }),
    createTableColumn<TemplateUsageEntry>({
      columnId: 'createdAt',
      renderHeaderCell: () => 'Created',
      renderCell: (item) => new Date(item.createdAt).toLocaleDateString(),
    }),
    createTableColumn<TemplateUsageEntry>({
      columnId: 'status',
      renderHeaderCell: () => 'Status',
      renderCell: (item) => (
        <Text
          className={
            item.status === 'active' ? styles.trendUp : 
            item.status === 'completed' ? styles.trendStable : styles.trendDown
          }
        >
          {item.status}
        </Text>
      ),
    }),
  ];

  const performanceColumns: TableColumnDefinition<PerformanceMetric>[] = [
    createTableColumn<PerformanceMetric>({
      columnId: 'metric',
      renderHeaderCell: () => 'Metric',
      renderCell: (item) => item.name,
    }),
    createTableColumn<PerformanceMetric>({
      columnId: 'value',
      renderHeaderCell: () => 'Value',
      renderCell: (item) => `${item.value} ${item.unit}`,
    }),
    createTableColumn<PerformanceMetric>({
      columnId: 'trend',
      renderHeaderCell: () => 'Trend',
      renderCell: (item) => (
        <Text
          className={
            item.trend === 'up' ? styles.trendUp : 
            item.trend === 'down' ? styles.trendDown : styles.trendStable
          }
        >
          {item.trend === 'up' ? '↑' : item.trend === 'down' ? '↓' : '→'}
          {' '}{Math.abs(item.changePercent || 0)}%
        </Text>
      ),
    }),
  ];

  const renderChart = useMemo(() => {
    if (!currentAnalytics?.adoptionMetrics?.monthlyUsage) return null;

    // Simple bar chart representation
    const maxCount = Math.max(...currentAnalytics.adoptionMetrics.monthlyUsage.map(m => m.count));
    
    return (
      <div className={styles.chart}>
        <Text weight="semibold" size={400}>Monthly Usage</Text>
        <div style={{ display: 'flex', alignItems: 'flex-end', height: '250px', gap: '10px', marginTop: '20px' }}>
          {currentAnalytics.adoptionMetrics.monthlyUsage.map((entry, index) => (
            <div key={index} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
              <div
                style={{
                  width: '100%',
                  backgroundColor: tokens.colorBrandBackground,
                  height: `${(entry.count / maxCount) * 200}px`,
                  borderRadius: tokens.borderRadiusSmall,
                }}
                title={`${entry.count} orders`}
              />
              <Text size={200} style={{ marginTop: '8px' }}>
                {new Date(entry.month).toLocaleDateString('en-US', { month: 'short' })}
              </Text>
            </div>
          ))}
        </div>
      </div>
    );
  }, [currentAnalytics]);

  const heatMapData = useMemo(() => {
    if (!currentAnalytics?.usageHeatMap) return null;

    return (
      <div className={styles.heatMap}>
        {currentAnalytics.usageHeatMap.map((row, i) => (
          <div key={i} className={styles.heatMapRow}>
            {row.map((value, j) => (
              <div
                key={j}
                className={styles.heatMapCell}
                style={{
                  backgroundColor: `rgba(0, 120, 212, ${value / 100})`,
                }}
                title={`Week ${i + 1}, Day ${j + 1}: ${value}% usage`}
              />
            ))}
          </div>
        ))}
      </div>
    );
  }, [currentAnalytics]);

  if (isLoadingAnalytics) {
    return (
      <div className={styles.loader}>
        <Spinner size="large" label="Loading analytics..." />
      </div>
    );
  }

  if (analyticsError) {
    return (
      <MessageBar intent="error">
        <MessageBarBody>
          <MessageBarTitle>Failed to load analytics</MessageBarTitle>
          {analyticsError.message}
        </MessageBarBody>
      </MessageBar>
    );
  }

  if (!currentAnalytics) {
    return (
      <MessageBar>
        <MessageBarBody>
          No analytics data available for this template
        </MessageBarBody>
      </MessageBar>
    );
  }

  const performanceMetrics: PerformanceMetric[] = [
    {
      name: 'Average Provisioning Time',
      value: currentAnalytics.usageMetrics.averageProvisionTime,
      unit: 'seconds',
      trend: currentAnalytics.usageMetrics.averageProvisionTime < 600 ? 'up' : 'down',
      changePercent: 5,
    },
    {
      name: 'Success Rate',
      value: currentAnalytics.usageMetrics.successRate,
      unit: '%',
      trend: currentAnalytics.usageMetrics.successRate > 95 ? 'up' : 'down',
      changePercent: 2,
    },
    {
      name: 'Average Folder Count',
      value: currentAnalytics.performanceMetrics.avgFolderCount,
      unit: 'folders',
      trend: 'stable',
      changePercent: 0,
    },
    {
      name: 'Average Depth',
      value: currentAnalytics.performanceMetrics.avgDepth,
      unit: 'levels',
      trend: 'stable',
      changePercent: 0,
    },
  ];

  return (
    <div className={styles.container}>
      {/* Header */}
      <div className={styles.header}>
        <Text size={700} weight="semibold">Template Analytics</Text>
        <div className={styles.controls}>
          <Dropdown
            placeholder="Time range"
            value={timeRange === '7d' ? 'Last 7 days' : 
                   timeRange === '30d' ? 'Last 30 days' :
                   timeRange === '90d' ? 'Last 90 days' :
                   timeRange === '1y' ? 'Last year' : 'All time'}
            onOptionSelect={(e, data) => data.optionValue && setTimeRange(data.optionValue)}
          >
            <Option value="7d">Last 7 days</Option>
            <Option value="30d">Last 30 days</Option>
            <Option value="90d">Last 90 days</Option>
            <Option value="1y">Last year</Option>
            <Option value="all">All time</Option>
          </Dropdown>
          <Dropdown
            placeholder="Export format"
            value={exportFormat === 'csv' ? 'CSV' : 
                   exportFormat === 'json' ? 'JSON' : 'PDF Report'}
            onOptionSelect={(e, data) => data.optionValue && setExportFormat(data.optionValue)}
          >
            <Option value="csv">CSV</Option>
            <Option value="json">JSON</Option>
            <Option value="pdf">PDF Report</Option>
          </Dropdown>
          <Button
            icon={<ArrowDownload24Regular />}
            onClick={handleExport}
            disabled={exportAnalytics.isPending}
          >
            Export
          </Button>
        </div>
      </div>

      {/* Summary Cards */}
      <div className={styles.summaryCards}>
        <Card className={styles.card}>
          <Text className={styles.cardLabel}>Total Orders</Text>
          <Text className={styles.cardValue}>{currentAnalytics.usageMetrics.totalOrders}</Text>
        </Card>
        <Card className={styles.card}>
          <Text className={styles.cardLabel}>Active Orders</Text>
          <Text className={styles.cardValue}>{currentAnalytics.usageMetrics.activeOrders}</Text>
        </Card>
        <Card className={styles.card}>
          <Text className={styles.cardLabel}>Adoption Rate</Text>
          <Text className={styles.cardValue}>{currentAnalytics.adoptionMetrics.adoptionRate}%</Text>
          <Text 
            className={`${styles.trend} ${
              currentAnalytics.adoptionMetrics.trendDirection === 'up' ? styles.trendUp : 
              currentAnalytics.adoptionMetrics.trendDirection === 'down' ? styles.trendDown : 
              styles.trendStable
            }`}
          >
            {currentAnalytics.adoptionMetrics.trendDirection === 'up' ? '↑' : 
             currentAnalytics.adoptionMetrics.trendDirection === 'down' ? '↓' : '→'} Trend
          </Text>
        </Card>
      </div>

      {/* Tabs */}
      <TabList selectedValue={selectedTab} onTabSelect={handleTabSelect}>
        <Tab value="trends">Usage Trends</Tab>
        <Tab value="orders">Orders</Tab>
        <Tab value="performance">Performance</Tab>
      </TabList>

      {/* Tab Content */}
      <div className={styles.tabContent}>
        {selectedTab === 'trends' && (
          <>
            {renderChart}
            
            {heatMapData && (
              <Card className={styles.card}>
                <CardHeader header={<Text weight="semibold">Usage Heat Map</Text>} />
                <Text size={200} className={styles.cardLabel}>
                  Weekly usage intensity (darker = higher usage)
                </Text>
                {heatMapData}
              </Card>
            )}
          </>
        )}

        {selectedTab === 'orders' && (
          <Card>
            <CardHeader header={<Text weight="semibold">Orders Using This Template</Text>} />
            <DataGrid
              items={currentAnalytics.orders || []}
              columns={usageColumns}
              sortable
              resizableColumns
            >
              <DataGridHeader>
                <DataGridRow>
                  {({ renderHeaderCell }) => (
                    <DataGridHeaderCell>{renderHeaderCell()}</DataGridHeaderCell>
                  )}
                </DataGridRow>
              </DataGridHeader>
              <DataGridBody<TemplateUsageEntry>>
                {({ item, rowId }) => (
                  <DataGridRow<TemplateUsageEntry> key={rowId}>
                    {({ renderCell }) => (
                      <DataGridCell>{renderCell(item)}</DataGridCell>
                    )}
                  </DataGridRow>
                )}
              </DataGridBody>
            </DataGrid>
          </Card>
        )}

        {selectedTab === 'performance' && (
          <>
            <Card>
              <CardHeader header={<Text weight="semibold">Performance Metrics</Text>} />
              <DataGrid
                items={performanceMetrics}
                columns={performanceColumns}
                sortable
                resizableColumns
              >
                <DataGridHeader>
                  <DataGridRow>
                    {({ renderHeaderCell }) => (
                      <DataGridHeaderCell>{renderHeaderCell()}</DataGridHeaderCell>
                    )}
                  </DataGridRow>
                </DataGridHeader>
                <DataGridBody<PerformanceMetric>>
                  {({ item, rowId }) => (
                    <DataGridRow<PerformanceMetric> key={rowId}>
                      {({ renderCell }) => (
                        <DataGridCell>{renderCell(item)}</DataGridCell>
                      )}
                    </DataGridRow>
                  )}
                </DataGridBody>
              </DataGrid>
            </Card>

            {currentAnalytics.performanceMetrics.provisioningErrors?.length > 0 && (
              <Card>
                <CardHeader header={<Text weight="semibold">Common Errors</Text>} />
                <div className={styles.errorList}>
                  {currentAnalytics.performanceMetrics.provisioningErrors.map((error, index) => (
                    <div key={index} className={styles.errorItem}>
                      <Text>{error.error}</Text>
                      <Text className={styles.trendDown}>
                        {error.count} occurrences
                      </Text>
                    </div>
                  ))}
                </div>
              </Card>
            )}
          </>
        )}
      </div>
    </div>
  );
}