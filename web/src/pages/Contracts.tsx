import { useState, useCallback, useMemo, useEffect, useRef } from 'react';
import {
  Title1,
  Button,
  makeStyles,
  tokens,
  Spinner,
  MessageBar,
} from '@fluentui/react-components';
import {
  Add20Regular,
  ArrowDownload20Regular,
  ArrowSync20Regular,
} from '@fluentui/react-icons';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/hooks/useAuth';
import { contractsApi } from '@/services/api/contracts';
import type { Contract, ContractList, ContractFilters as IContractFilters } from '@/types/contracts';
import { ContractTable, ContractTableDescription } from '@/components/contracts/ContractTable';
import { ContractFilters } from '@/components/contracts/ContractFilters';
import { ContractDetail } from '@/components/contracts/ContractDetail';
import { ContractFormDialog, DeleteConfirmationDialog } from '@/components/contracts/ContractActions';
import { ContractTableSkeleton } from '@/components/contracts/ContractTableSkeleton';
import { ContractErrorBoundary } from '@/components/contracts/ContractErrorBoundary';
import { useContractStatusMonitor } from '@/hooks/useContractStatusMonitor';

const useStyles = makeStyles({
  root: {
    display: 'flex',
    flexDirection: 'column',
    gap: tokens.spacingVerticalL,
    padding: tokens.spacingHorizontalXL,
    height: '100%',
    overflow: 'hidden',
  },
  header: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: tokens.spacingHorizontalM,
  },
  headerActions: {
    display: 'flex',
    gap: tokens.spacingHorizontalS,
    flexWrap: 'wrap',
  },
  content: {
    flex: 1,
    display: 'flex',
    flexDirection: 'column',
    gap: tokens.spacingVerticalM,
    minHeight: 0,
  },
  tableContainer: {
    flex: 1,
    overflow: 'auto',
    borderRadius: tokens.borderRadiusMedium,
    border: `1px solid ${tokens.colorNeutralStroke1}`,
    backgroundColor: tokens.colorNeutralBackground1,
  },
  loadingContainer: {
    display: 'flex',
    justifyContent: 'center',
    alignItems: 'center',
    height: '400px',
  },
  errorContainer: {
    padding: tokens.spacingHorizontalL,
  },
  '@media (max-width: 768px)': {
    root: {
      padding: tokens.spacingHorizontalM,
    },
    header: {
      flexDirection: 'column',
      alignItems: 'flex-start',
    },
  },
});

const ContractsContent = () => {
  const styles = useStyles();
  const { user, isAdmin, isPM } = useAuth();
  const [selectedContract, setSelectedContract] = useState<Contract | null>(null);
  const [isExporting, setIsExporting] = useState(false);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const [filters, setFilters] = useState<IContractFilters>({});
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [contractToEdit, setContractToEdit] = useState<Contract | null>(null);
  const [contractToDelete, setContractToDelete] = useState<Contract | null>(null);
  const [announcement, setAnnouncement] = useState('');
  const searchInputRef = useRef<HTMLInputElement>(null);
  const queryClient = useQueryClient();

  // Build filter params for API
  const filterParams = useMemo(() => {
    const params: Record<string, any> = {};
    if (filters.search) {
      params.search = filters.search;
    }
    if (filters.status && filters.status !== 'all') {
      params.status = filters.status;
    }
    if (filters.startDate) {
      params.start_date_from = filters.startDate;
    }
    if (filters.endDate) {
      params.end_date_to = filters.endDate;
    }
    if (filters.clientName) {
      params.client_name = filters.clientName;
    }
    if (!isAdmin() && isPM() && user?.localAccountId) {
      params.pm_id = user.localAccountId;
    }
    return params;
  }, [filters, isAdmin, isPM, user]);

  // Fetch contracts based on user role and filters
  const {
    data: contractList,
    isLoading,
    error,
    refetch,
  } = useQuery<ContractList>({
    queryKey: ['contracts', user?.localAccountId, page, pageSize, filterParams],
    queryFn: async () => {
      if (isAdmin()) {
        // NEU_Admin sees all contracts
        return await contractsApi.getAll(page, pageSize, filterParams);
      } else if (isPM() && user?.localAccountId) {
        // PM sees only assigned contracts
        return await contractsApi.getByPmId(user.localAccountId, page, pageSize);
      }
      return {
        items: [],
        total: 0,
        page: 1,
        pageSize: 25,
        totalPages: 0,
      };
    },
    enabled: !!user,
    refetchInterval: 5 * 60 * 1000, // Refetch every 5 minutes for real-time updates
    staleTime: 60 * 1000, // Consider data stale after 1 minute
  });

  // Apply client-side filtering
  const filteredContracts = useMemo(() => {
    let result = contractList?.items || [];

    // Search filter (contract number, name, or client)
    if (filters.search) {
      const searchLower = filters.search.toLowerCase();
      result = result.filter(
        (contract) =>
          contract.contractNumber?.toLowerCase().includes(searchLower) ||
          contract.name.toLowerCase().includes(searchLower) ||
          contract.clientName?.toLowerCase().includes(searchLower)
      );
    }

    // Status filter
    if (filters.status && filters.status !== 'all') {
      result = result.filter((contract) => contract.status === filters.status);
    }

    // Date range filters
    if (filters.startDate) {
      result = result.filter(
        (contract) => contract.startDate >= filters.startDate!
      );
    }

    if (filters.endDate) {
      result = result.filter(
        (contract) => !contract.endDate || contract.endDate <= filters.endDate!
      );
    }

    // Client name filter
    if (filters.clientName) {
      const clientLower = filters.clientName.toLowerCase();
      result = result.filter(
        (contract) => contract.clientName?.toLowerCase().includes(clientLower)
      );
    }

    return result;
  }, [contractList?.items, filters]);

  const contracts = filteredContracts;

  // Monitor contract status changes for real-time notifications
  useContractStatusMonitor(contractList?.items);

  // Role-based visibility for actions
  const canCreateContract = isAdmin();
  const canEditContract = isAdmin();
  const canDeleteContract = isAdmin();

  const handleCreateContract = () => {
    setIsCreateDialogOpen(true);
    announce('Create new contract dialog opened');
  };

  // Screen reader announcements
  const announce = (message: string) => {
    setAnnouncement(message);
    setTimeout(() => setAnnouncement(''), 1000);
  };

  const handleContractClick = useCallback((contract: Contract) => {
    setSelectedContract(contract);
  }, []);

  const handleCloseDetail = useCallback(() => {
    setSelectedContract(null);
  }, []);

  const handleEditContract = useCallback((contract: Contract) => {
    setContractToEdit(contract);
    setIsEditDialogOpen(true);
    setSelectedContract(null); // Close detail view if open
    announce(`Editing contract ${contract.contractNumber}`);
  }, []);

  const handleDeleteContract = useCallback((contract: Contract) => {
    setContractToDelete(contract);
    setIsDeleteDialogOpen(true);
    setSelectedContract(null); // Close detail view if open
    announce(`Delete confirmation for contract ${contract.contractNumber}`);
  }, []);

  const handlePageChange = useCallback((newPage: number) => {
    setPage(newPage);
  }, []);

  const handlePageSizeChange = useCallback((newPageSize: number) => {
    setPageSize(newPageSize);
    setPage(1); // Reset to first page
  }, []);

  const handleFiltersChange = useCallback((newFilters: IContractFilters) => {
    setFilters(newFilters);
    setPage(1); // Reset to first page when filters change
  }, []);

  const handleClearFilters = useCallback(() => {
    setFilters({});
    setPage(1); // Reset to first page
  }, []);

  const handleExport = async () => {
    if (!filteredContracts || filteredContracts.length === 0) return;
    
    setIsExporting(true);
    announce('Exporting contracts to CSV');
    try {
      // Export only the filtered contracts
      await contractsApi.exportToCsv(filteredContracts);
      announce('Contracts exported successfully');
    } catch (error) {
      console.error('Failed to export contracts:', error);
      announce('Failed to export contracts');
    } finally {
      setIsExporting(false);
    }
  };

  const handleRefresh = () => {
    refetch();
    announce('Refreshing contracts list');
  };

  // Global keyboard shortcuts
  useEffect(() => {
    const handleGlobalKeys = (e: KeyboardEvent) => {
      // Alt+N: New contract
      if (e.altKey && e.key === 'n' && canCreateContract) {
        e.preventDefault();
        handleCreateContract();
      }
      // Alt+E: Export
      if (e.altKey && e.key === 'e') {
        e.preventDefault();
        handleExport();
      }
      // Alt+F: Focus search
      if (e.altKey && e.key === 'f') {
        e.preventDefault();
        // The search input ref is in ContractFilters component
        // We'll need to pass a callback or use a different approach
        document.querySelector<HTMLInputElement>('input[aria-label="Search contracts"]')?.focus();
        announce('Search field focused');
      }
      // Alt+R: Refresh
      if (e.altKey && e.key === 'r') {
        e.preventDefault();
        handleRefresh();
      }
    };
    
    document.addEventListener('keydown', handleGlobalKeys);
    return () => document.removeEventListener('keydown', handleGlobalKeys);
  }, [canCreateContract, filteredContracts]);

  // Show skeleton loader for initial load
  if (isLoading && !contractList) {
    return (
      <div className={styles.root}>
        <div className={styles.header}>
          <Title1>Contracts</Title1>
        </div>
        <div className={styles.content}>
          <ContractFilters
            filters={filters}
            onFiltersChange={handleFiltersChange}
            onClearFilters={handleClearFilters}
          />
          <div className={styles.tableContainer}>
            <ContractTableSkeleton rows={pageSize} />
          </div>
        </div>
      </div>
    );
  }

  if (error) {
    const errorMessage = error instanceof Error ? error.message : 'Failed to load contracts';
    const correlationId = (error as { correlationId?: string })?.correlationId || 'Unknown';

    return (
      <div className={styles.root}>
        <div className={styles.errorContainer}>
          <MessageBar
            intent="error"
            isMultiline
            actions={
              <Button onClick={() => refetch()} size="small">
                Retry
              </Button>
            }
          >
            <strong>Error loading contracts</strong>
            <br />
            {errorMessage}
            <br />
            <small>Correlation ID: {correlationId}</small>
          </MessageBar>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.root} role="main" aria-label="Contracts management page">
      {/* Screen reader announcements */}
      <div 
        role="status" 
        aria-live="polite" 
        aria-atomic="true"
        style={{ position: 'absolute', left: '-10000px', width: '1px', height: '1px', overflow: 'hidden' }}
      >
        {announcement}
      </div>
      <div className={styles.header}>
        <Title1>Szerződések</Title1>
        <div className={styles.headerActions}>
          {canCreateContract && (
            <Button
              appearance="primary"
              icon={<Add20Regular />}
              onClick={handleCreateContract}
              aria-label="Create new contract"
              aria-keyshortcuts="Alt+N"
              title="Create new contract (Alt+N)"
            >
              Új szerződés
            </Button>
          )}
          <Button
            icon={<ArrowDownload20Regular />}
            onClick={handleExport}
            disabled={isExporting || contracts.length === 0}
            aria-label="Export contracts to CSV"
            aria-keyshortcuts="Alt+E"
            title="Export to CSV (Alt+E)"
          >
            {isExporting ? 'Exportálás...' : 'Exportálás'}
          </Button>
          <Button
            icon={<ArrowSync20Regular />}
            onClick={handleRefresh}
            aria-label="Refresh contracts list"
            aria-keyshortcuts="Alt+R"
            title="Refresh list (Alt+R)"
          >
            Frissítés
          </Button>
        </div>
      </div>

      <div className={styles.content}>
        <ContractFilters
          filters={filters}
          onFiltersChange={handleFiltersChange}
          onClearFilters={handleClearFilters}
        />
        
        <ContractTableDescription />
        <div className={styles.tableContainer} role="region" aria-label="Contracts table container">
          {isLoading ? (
            <ContractTableSkeleton rows={pageSize} />
          ) : contracts.length > 0 ? (
            <ContractTable
              contracts={contracts}
              onContractClick={handleContractClick}
              onEdit={handleEditContract}
              onDelete={handleDeleteContract}
              canEdit={canEditContract}
              canDelete={canDeleteContract}
              page={page}
              pageSize={pageSize}
              totalPages={contractList?.totalPages || 1}
              onPageChange={handlePageChange}
              onPageSizeChange={handlePageSizeChange}
            />
          ) : (
            <div style={{ padding: '40px', textAlign: 'center' }}>
              <MessageBar
                intent="info"
                style={{ maxWidth: '400px', margin: '0 auto' }}
              >
                {filters.search || filters.status || filters.startDate || filters.endDate
                  ? 'Nincs a szűrési feltételeknek megfelelő szerződés.'
                  : 'Nincsenek elérhető szerződések.'}
              </MessageBar>
              {(filters.search || filters.status || filters.startDate || filters.endDate) && (
                <Button
                  onClick={handleClearFilters}
                  style={{ marginTop: '16px' }}
                >
                  Szűrők törlése
                </Button>
              )}
            </div>
          )}
        </div>
      </div>

      <ContractDetail
        contract={selectedContract}
        isOpen={!!selectedContract}
        onClose={handleCloseDetail}
        onEdit={handleEditContract}
        onDelete={handleDeleteContract}
        canEdit={canEditContract}
        canDelete={canDeleteContract}
      />

      <ContractFormDialog
        isOpen={isCreateDialogOpen}
        onClose={() => {
          setIsCreateDialogOpen(false);
          announce('Create contract dialog closed');
        }}
        mode="create"
      />

      <ContractFormDialog
        isOpen={isEditDialogOpen}
        onClose={() => {
          setIsEditDialogOpen(false);
          setContractToEdit(null);
          announce('Edit contract dialog closed');
        }}
        contract={contractToEdit}
        mode="edit"
      />

      <DeleteConfirmationDialog
        isOpen={isDeleteDialogOpen}
        onClose={() => {
          setIsDeleteDialogOpen(false);
          setContractToDelete(null);
          announce('Delete confirmation dialog closed');
        }}
        contract={contractToDelete}
        onDeleteSuccess={(contractNumber) => {
          announce(`Contract ${contractNumber} deleted successfully`);
        }}
      />
    </div>
  );
};

// Export the component wrapped with error boundary
export const Contracts = () => {
  return (
    <ContractErrorBoundary>
      <ContractsContent />
    </ContractErrorBoundary>
  );
};
