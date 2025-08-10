import React, { useState, useCallback, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import {
  makeStyles,
  tokens,
  shorthands,
  Text,
  Button,
  SearchBox,
  Dropdown,
  Option,
  Toolbar,
  ToolbarButton,
  Spinner,
  MessageBar,
  MessageBarBody,
  MessageBarTitle,
} from '@fluentui/react-components';
import {
  Add24Regular,
  ArrowSort24Regular,
  Filter24Regular,
  ArrowDownload24Regular,
  ArrowUpload24Regular,
} from '@fluentui/react-icons';
import { TemplateCard } from '@/components/templates/TemplateCard';
import { templatesApi } from '@/services/templates';
import type { Template, TemplateFilters, TemplateSortOptions, TemplateStatus } from '@/types/templates';

const useStyles = makeStyles({
  root: {
    display: 'flex',
    flexDirection: 'column',
    height: '100%',
    ...shorthands.padding(tokens.spacingVerticalL, tokens.spacingHorizontalL),
  },
  header: {
    marginBottom: tokens.spacingVerticalL,
  },
  title: {
    marginBottom: tokens.spacingVerticalM,
  },
  controls: {
    display: 'flex',
    flexDirection: 'column',
    ...shorthands.gap(tokens.spacingVerticalM),
  },
  topControls: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    flexWrap: 'wrap',
    ...shorthands.gap(tokens.spacingHorizontalM),
  },
  searchControls: {
    display: 'flex',
    alignItems: 'center',
    ...shorthands.gap(tokens.spacingHorizontalS),
    flexGrow: 1,
    maxWidth: '600px',
  },
  actionButtons: {
    display: 'flex',
    ...shorthands.gap(tokens.spacingHorizontalS),
  },
  filterBar: {
    display: 'flex',
    alignItems: 'center',
    ...shorthands.gap(tokens.spacingHorizontalM),
    flexWrap: 'wrap',
  },
  content: {
    flexGrow: 1,
    overflowY: 'auto',
  },
  grid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fill, minmax(400px, 1fr))',
    ...shorthands.gap(tokens.spacingVerticalM, tokens.spacingHorizontalM),
  },
  emptyState: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: '400px',
    ...shorthands.gap(tokens.spacingVerticalL),
  },
  spinner: {
    display: 'flex',
    justifyContent: 'center',
    alignItems: 'center',
    minHeight: '400px',
  },
  pagination: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: tokens.spacingVerticalL,
    ...shorthands.padding(tokens.spacingVerticalS, 0),
    borderTop: `1px solid ${tokens.colorNeutralStroke1}`,
  },
  paginationInfo: {
    color: tokens.colorNeutralForeground3,
  },
  paginationButtons: {
    display: 'flex',
    ...shorthands.gap(tokens.spacingHorizontalS),
  },
});

const statusOptions: TemplateStatus[] = ['draft', 'active', 'default', 'deprecated', 'archived'];
const sortOptions: { value: TemplateSortOptions['field']; label: string }[] = [
  { value: 'name', label: 'Name' },
  { value: 'date', label: 'Modified Date' },
  { value: 'usage', label: 'Usage Count' },
  { value: 'status', label: 'Status' },
];

export const TemplateList: React.FC = () => {
  const styles = useStyles();
  const navigate = useNavigate();

  const [page, setPage] = useState(1);
  const [pageSize] = useState(20);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedStatuses, setSelectedStatuses] = useState<TemplateStatus[]>([]);
  const [sortField, setSortField] = useState<TemplateSortOptions['field']>('date');
  const [sortDirection, setSortDirection] = useState<TemplateSortOptions['direction']>('desc');

  const filters = useMemo<TemplateFilters>(() => ({
    search: searchQuery || undefined,
    status: selectedStatuses.length > 0 ? selectedStatuses : undefined,
  }), [searchQuery, selectedStatuses]);

  const sort = useMemo<TemplateSortOptions>(() => ({
    field: sortField,
    direction: sortDirection,
  }), [sortField, sortDirection]);

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['templates', page, pageSize, filters, sort],
    queryFn: () => templatesApi.getTemplates(page, pageSize, filters, sort),
    keepPreviousData: true,
  });

  const handleSearch = useCallback((value: string) => {
    setSearchQuery(value);
    setPage(1);
  }, []);

  const handleStatusChange = useCallback((event: any, data: any) => {
    const selected = data.selectedOptions as TemplateStatus[];
    setSelectedStatuses(selected);
    setPage(1);
  }, []);

  const handleSortChange = useCallback((event: any, data: any) => {
    setSortField(data.value as TemplateSortOptions['field']);
  }, []);

  const toggleSortDirection = useCallback(() => {
    setSortDirection((prev) => (prev === 'asc' ? 'desc' : 'asc'));
  }, []);

  const handleCreateTemplate = useCallback(() => {
    navigate('/templates/new');
  }, [navigate]);

  const handleImportTemplate = useCallback(() => {
    navigate('/templates/import');
  }, [navigate]);

  const handleExportTemplates = useCallback(() => {
    console.log('Export templates');
  }, []);

  const handleViewTemplate = useCallback((template: Template) => {
    navigate(`/templates/${template.id}`);
  }, [navigate]);

  const handleEditTemplate = useCallback((template: Template) => {
    navigate(`/templates/${template.id}/edit`);
  }, [navigate]);

  const handleViewHistory = useCallback((template: Template) => {
    navigate(`/templates/${template.id}/history`);
  }, [navigate]);

  const handleCloneTemplate = useCallback((template: Template) => {
    navigate(`/templates/${template.id}/clone`);
  }, [navigate]);

  const handleDeleteTemplate = useCallback(async (template: Template) => {
    if (window.confirm(`Are you sure you want to delete template "${template.name}"?`)) {
      try {
        await templatesApi.deleteTemplate(template.id);
        refetch();
      } catch (error) {
        console.error('Failed to delete template:', error);
      }
    }
  }, [refetch]);

  const handleNextPage = useCallback(() => {
    if (data && page < Math.ceil(data.total / pageSize)) {
      setPage((prev) => prev + 1);
    }
  }, [data, page, pageSize]);

  const handlePrevPage = useCallback(() => {
    if (page > 1) {
      setPage((prev) => prev - 1);
    }
  }, [page]);

  const renderContent = () => {
    if (isLoading) {
      return (
        <div className={styles.spinner}>
          <Spinner size="large" label="Loading templates..." />
        </div>
      );
    }

    if (error) {
      return (
        <MessageBar intent="error">
          <MessageBarBody>
            <MessageBarTitle>Failed to load templates</MessageBarTitle>
            {error instanceof Error ? error.message : 'An unexpected error occurred'}
          </MessageBarBody>
        </MessageBar>
      );
    }

    if (!data || data.templates.length === 0) {
      return (
        <div className={styles.emptyState}>
          <Text size={500}>No templates found</Text>
          <Text size={300}>
            {searchQuery || selectedStatuses.length > 0
              ? 'Try adjusting your filters'
              : 'Create your first template to get started'}
          </Text>
          {!searchQuery && selectedStatuses.length === 0 && (
            <Button appearance="primary" icon={<Add24Regular />} onClick={handleCreateTemplate}>
              Create Template
            </Button>
          )}
        </div>
      );
    }

    return (
      <>
        <div className={styles.grid}>
          {data.templates.map((template) => (
            <TemplateCard
              key={template.id}
              template={template}
              onView={handleViewTemplate}
              onEdit={handleEditTemplate}
              onViewHistory={handleViewHistory}
              onClone={handleCloneTemplate}
              onDelete={handleDeleteTemplate}
            />
          ))}
        </div>
        {data.total > pageSize && (
          <div className={styles.pagination}>
            <Text className={styles.paginationInfo}>
              Showing {(page - 1) * pageSize + 1}-{Math.min(page * pageSize, data.total)} of {data.total} templates
            </Text>
            <div className={styles.paginationButtons}>
              <Button 
                appearance="secondary" 
                disabled={page === 1}
                onClick={handlePrevPage}
              >
                Previous
              </Button>
              <Button 
                appearance="secondary"
                disabled={page >= Math.ceil(data.total / pageSize)}
                onClick={handleNextPage}
              >
                Next
              </Button>
            </div>
          </div>
        )}
      </>
    );
  };

  return (
    <div className={styles.root}>
      <div className={styles.header}>
        <Text as="h1" size={900} weight="bold" className={styles.title}>
          Template Manager
        </Text>
        <div className={styles.controls}>
          <div className={styles.topControls}>
            <div className={styles.searchControls}>
              <SearchBox
                placeholder="Search templates..."
                value={searchQuery}
                onChange={(e, data) => handleSearch(data.value)}
                contentBefore={<Filter24Regular />}
              />
              <Dropdown
                placeholder="Filter by status"
                multiselect
                value={selectedStatuses.join(', ')}
                selectedOptions={selectedStatuses}
                onOptionSelect={handleStatusChange}
              >
                {statusOptions.map((status) => (
                  <Option key={status} value={status}>
                    {status.charAt(0).toUpperCase() + status.slice(1)}
                  </Option>
                ))}
              </Dropdown>
            </div>
            <div className={styles.actionButtons}>
              <Button
                appearance="primary"
                icon={<Add24Regular />}
                onClick={handleCreateTemplate}
              >
                Create Template
              </Button>
              <ToolbarButton
                icon={<ArrowUpload24Regular />}
                onClick={handleImportTemplate}
              >
                Import
              </ToolbarButton>
              <ToolbarButton
                icon={<ArrowDownload24Regular />}
                onClick={handleExportTemplates}
              >
                Export
              </ToolbarButton>
            </div>
          </div>
          <div className={styles.filterBar}>
            <Text size={300}>Sort by:</Text>
            <Dropdown
              value={sortField}
              selectedOptions={[sortField]}
              onOptionSelect={handleSortChange}
            >
              {sortOptions.map((option) => (
                <Option key={option.value} value={option.value}>
                  {option.label}
                </Option>
              ))}
            </Dropdown>
            <Button
              appearance="subtle"
              icon={<ArrowSort24Regular />}
              onClick={toggleSortDirection}
            >
              {sortDirection === 'asc' ? 'Ascending' : 'Descending'}
            </Button>
          </div>
        </div>
      </div>
      <div className={styles.content}>
        {renderContent()}
      </div>
    </div>
  );
};