import { useState, useMemo, useCallback, useEffect, useRef } from 'react';
import {
  DataGrid,
  DataGridHeader,
  DataGridHeaderCell,
  DataGridBody,
  DataGridRow,
  DataGridCell,
  TableCellLayout,
  Badge,
  Button,
  makeStyles,
  tokens,
  Dropdown,
  Option,
} from '@fluentui/react-components';
import {
  Edit20Regular,
  Delete20Regular,
  Open20Regular,
  Edit16Regular,
  Delete16Regular,
  CheckmarkCircle20Regular,
  DismissCircle20Regular,
  Clock20Regular,
} from '@fluentui/react-icons';
import type { Contract } from '@/types/contracts';

interface ContractTableProps {
  contracts: Contract[];
  onContractClick: (contract: Contract) => void;
  onEdit?: (contract: Contract) => void;
  onDelete?: (contract: Contract) => void;
  canEdit?: boolean;
  canDelete?: boolean;
  page: number;
  pageSize: number;
  totalPages: number;
  onPageChange: (page: number) => void;
  onPageSizeChange: (pageSize: number) => void;
}

const useStyles = makeStyles({
  root: {
    display: 'flex',
    flexDirection: 'column',
    height: '100%',
  },
  grid: {
    flex: 1,
    minHeight: 0,
    overflowY: 'auto',
  },
  statusBadge: {
    minWidth: '80px',
  },
  activeStatus: {
    backgroundColor: tokens.colorPaletteGreenBackground2,
    color: tokens.colorPaletteGreenForeground2,
  },
  inactiveStatus: {
    backgroundColor: tokens.colorNeutralBackground3,
    color: tokens.colorNeutralForeground3,
  },
  expiredStatus: {
    backgroundColor: tokens.colorPaletteBlueBorderActive,
    color: tokens.colorNeutralForegroundOnBrand,
  },
  actionButtons: {
    display: 'flex',
    gap: tokens.spacingHorizontalXS,
  },
  pagination: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: tokens.spacingVerticalM,
    borderTop: `1px solid ${tokens.colorNeutralStroke1}`,
    backgroundColor: tokens.colorNeutralBackground1,
  },
  paginationControls: {
    display: 'flex',
    gap: tokens.spacingHorizontalM,
    alignItems: 'center',
  },
  pageInfo: {
    color: tokens.colorNeutralForeground3,
  },
  clickableRow: {
    cursor: 'pointer',
    '&:hover': {
      backgroundColor: tokens.colorNeutralBackground1Hover,
    },
  },
});

type SortDirection = 'ascending' | 'descending' | undefined;
type SortableField = keyof Contract;

export const ContractTable: React.FC<ContractTableProps> = ({
  contracts,
  onContractClick,
  onEdit,
  onDelete,
  canEdit,
  canDelete,
  page,
  pageSize,
  totalPages,
  onPageChange,
  onPageSizeChange,
}) => {
  const styles = useStyles();
  const [sortColumn, setSortColumn] = useState<SortableField | null>(null);
  const [sortDirection, setSortDirection] = useState<SortDirection>(undefined);
  const [selectedRowIndex, setSelectedRowIndex] = useState<number>(-1);
  const tableRef = useRef<HTMLDivElement>(null);
  const rowRefs = useRef<Map<number, HTMLElement>>(new Map());

  const handleSort = useCallback((column: SortableField) => {
    if (sortColumn === column) {
      if (sortDirection === 'ascending') {
        setSortDirection('descending');
      } else if (sortDirection === 'descending') {
        setSortDirection(undefined);
        setSortColumn(null);
      } else {
        setSortDirection('ascending');
      }
    } else {
      setSortColumn(column);
      setSortDirection('ascending');
    }
  }, [sortColumn, sortDirection]);

  const sortedContracts = useMemo(() => {
    if (!contracts || !Array.isArray(contracts)) return [];
    if (!sortColumn || !sortDirection) return contracts;

    return [...contracts].sort((a, b) => {
      const aValue = a[sortColumn];
      const bValue = b[sortColumn];

      if (aValue === null || aValue === undefined) return 1;
      if (bValue === null || bValue === undefined) return -1;

      let comparison = 0;
      if (typeof aValue === 'string' && typeof bValue === 'string') {
        comparison = aValue.localeCompare(bValue);
      } else if (typeof aValue === 'number' && typeof bValue === 'number') {
        comparison = aValue - bValue;
      } else {
        comparison = String(aValue).localeCompare(String(bValue));
      }

      return sortDirection === 'ascending' ? comparison : -comparison;
    });
  }, [contracts, sortColumn, sortDirection]);

  const getStatusBadgeStyle = (status: Contract['status']) => {
    switch (status) {
      case 'active':
        return styles.activeStatus;
      case 'inactive':
        return styles.inactiveStatus;
      case 'expired':
        return styles.expiredStatus;
      default:
        return '';
    }
  };
  
  const getStatusIcon = (status: Contract['status']) => {
    switch (status) {
      case 'active':
        return <CheckmarkCircle20Regular />;
      case 'inactive':
        return <DismissCircle20Regular />;
      case 'expired':
        return <Clock20Regular />;
      default:
        return null;
    }
  };
  
  const formatDate = (date: string) => {
    if (!date) return '-';
    return new Date(date).toLocaleDateString('hu-HU');
  };

  const handlePreviousPage = () => {
    if (page > 1) {
      onPageChange(page - 1);
    }
  };

  const handleNextPage = () => {
    if (page < totalPages) {
      onPageChange(page + 1);
    }
  };

  const handlePageSizeChange = (_: any, data: { value: string }) => {
    onPageSizeChange(parseInt(data.value, 10));
    onPageChange(1); // Reset to first page when changing page size
  };

  // Keyboard navigation handlers
  const navigateRow = useCallback((direction: number) => {
    const newIndex = Math.max(0, Math.min(sortedContracts.length - 1, selectedRowIndex + direction));
    setSelectedRowIndex(newIndex);
    
    // Focus the new row
    const rowElement = rowRefs.current.get(newIndex);
    if (rowElement) {
      rowElement.focus();
    }
  }, [selectedRowIndex, sortedContracts.length]);

  const selectFirstRow = useCallback(() => {
    setSelectedRowIndex(0);
    const rowElement = rowRefs.current.get(0);
    if (rowElement) {
      rowElement.focus();
    }
  }, []);

  const selectLastRow = useCallback(() => {
    const lastIndex = sortedContracts.length - 1;
    setSelectedRowIndex(lastIndex);
    const rowElement = rowRefs.current.get(lastIndex);
    if (rowElement) {
      rowElement.focus();
    }
  }, [sortedContracts.length]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent, contract: Contract, index: number) => {
    switch(e.key) {
      case 'Enter':
      case ' ':
        e.preventDefault();
        onContractClick(contract);
        break;
      case 'ArrowUp':
        e.preventDefault();
        navigateRow(-1);
        break;
      case 'ArrowDown':
        e.preventDefault();
        navigateRow(1);
        break;
      case 'Home':
        if (e.ctrlKey) {
          e.preventDefault();
          selectFirstRow();
        }
        break;
      case 'End':
        if (e.ctrlKey) {
          e.preventDefault();
          selectLastRow();
        }
        break;
      case 'Delete':
        if (canDelete && onDelete) {
          e.preventDefault();
          onDelete(contract);
        }
        break;
      case 'e':
      case 'E':
        if (e.ctrlKey && canEdit && onEdit) {
          e.preventDefault();
          onEdit(contract);
        }
        break;
    }
  }, [onContractClick, navigateRow, selectFirstRow, selectLastRow, canDelete, onDelete, canEdit, onEdit]);

  // Render cell content based on column
  const renderCellContent = (contract: Contract, columnId: string) => {
    switch (columnId) {
      case 'contractNumber':
        return <TableCellLayout>{contract.contractNumber}</TableCellLayout>;
      case 'name':
        return <TableCellLayout>{contract.name}</TableCellLayout>;
      case 'clientName':
        return <TableCellLayout>{contract.clientName || '-'}</TableCellLayout>;
      case 'status':
        return (
          <TableCellLayout>
            <Badge
              appearance="filled"
              className={`${styles.statusBadge} ${getStatusBadgeStyle(contract.status)}`}
            >
              {contract.status === 'active' ? 'Aktív' : 
               contract.status === 'inactive' ? 'Inaktív' :
               contract.status === 'expired' ? 'Lejárt' :
               contract.status.charAt(0).toUpperCase() + contract.status.slice(1)}
            </Badge>
          </TableCellLayout>
        );
      case 'startDate':
        return <TableCellLayout>{new Date(contract.startDate).toLocaleDateString()}</TableCellLayout>;
      case 'endDate':
        return <TableCellLayout>{contract.endDate ? new Date(contract.endDate).toLocaleDateString() : '-'}</TableCellLayout>;
      case 'pmName':
        return <TableCellLayout>{contract.pmName || '-'}</TableCellLayout>;
      case 'actions':
        return (
          <TableCellLayout>
            <div className={styles.actionButtons}>
              <Button
                size="small"
                icon={<Open20Regular />}
                appearance="subtle"
                onClick={(e) => {
                  e.stopPropagation();
                  onContractClick(contract);
                }}
                aria-label={`View contract ${contract.contractNumber}`}
              />
              {canEdit && onEdit && (
                <Button
                  size="small"
                  icon={<Edit20Regular />}
                  appearance="subtle"
                  onClick={(e) => {
                    e.stopPropagation();
                    onEdit(contract);
                  }}
                  aria-label={`Edit contract ${contract.contractNumber}`}
                />
              )}
              {canDelete && onDelete && (
                <Button
                  size="small"
                  icon={<Delete20Regular />}
                  appearance="subtle"
                  onClick={(e) => {
                    e.stopPropagation();
                    onDelete(contract);
                  }}
                  aria-label={`Delete contract ${contract.contractNumber}`}
                />
              )}
            </div>
          </TableCellLayout>
        );
      default:
        return null;
    }
  };

  const columnIds = ['contractNumber', 'name', 'clientName', 'status', 'startDate', 'endDate', 'pmName', 'actions'];
  
  // Define columns for DataGrid with proper structure
  const columns = useMemo(() => [
    { 
      columnId: 'contractNumber',
      compare: (a: Contract, b: Contract) => a.contractNumber.localeCompare(b.contractNumber),
      renderHeaderCell: () => columnHeaders.contractNumber,
      renderCell: (item: Contract) => item.contractNumber
    },
    { 
      columnId: 'name',
      compare: (a: Contract, b: Contract) => a.name.localeCompare(b.name),
      renderHeaderCell: () => columnHeaders.name,
      renderCell: (item: Contract) => item.name
    },
    { 
      columnId: 'clientName',
      compare: (a: Contract, b: Contract) => (a.clientName || '').localeCompare(b.clientName || ''),
      renderHeaderCell: () => columnHeaders.clientName,
      renderCell: (item: Contract) => item.clientName || '-'
    },
    { 
      columnId: 'status',
      compare: (a: Contract, b: Contract) => a.status.localeCompare(b.status),
      renderHeaderCell: () => columnHeaders.status,
      renderCell: (item: Contract) => (
        <Badge 
          appearance="filled"
          className={getStatusBadgeStyle(item.status)}
        >
          {getStatusIcon(item.status)} {item.status}
        </Badge>
      )
    },
    { 
      columnId: 'startDate',
      compare: (a: Contract, b: Contract) => a.startDate.localeCompare(b.startDate),
      renderHeaderCell: () => columnHeaders.startDate,
      renderCell: (item: Contract) => formatDate(item.startDate)
    },
    { 
      columnId: 'endDate',
      compare: (a: Contract, b: Contract) => (a.endDate || '').localeCompare(b.endDate || ''),
      renderHeaderCell: () => columnHeaders.endDate,
      renderCell: (item: Contract) => item.endDate ? formatDate(item.endDate) : '-'
    },
    { 
      columnId: 'pmName',
      compare: (a: Contract, b: Contract) => (a.pmName || '').localeCompare(b.pmName || ''),
      renderHeaderCell: () => columnHeaders.pmName,
      renderCell: (item: Contract) => item.pmName || '-'
    },
    { 
      columnId: 'actions',
      renderHeaderCell: () => columnHeaders.actions,
      renderCell: (item: Contract) => (
        <div style={{ display: 'flex', gap: '8px' }}>
          {canEdit && (
            <Button
              icon={<Edit16Regular />}
              appearance="subtle"
              size="small"
              onClick={(e) => {
                e.stopPropagation();
                onEdit(item);
              }}
              aria-label={`Edit contract ${item.contractNumber}`}
            />
          )}
          {canDelete && (
            <Button
              icon={<Delete16Regular />}
              appearance="subtle"
              size="small"
              onClick={(e) => {
                e.stopPropagation();
                onDelete(item);
              }}
              aria-label={`Delete contract ${item.contractNumber}`}
            />
          )}
        </div>
      )
    },
  ], [canEdit, canDelete, onEdit, onDelete]);
  const columnHeaders = {
    contractNumber: 'Szerződésszám',
    name: 'Név',
    clientName: 'Ügyfél neve',
    status: 'Státusz',
    startDate: 'Kezdés dátuma',
    endDate: 'Lejárat dátuma',
    pmName: 'Projektmenedzser',
    actions: 'Műveletek',
  };

  return (
    <div className={styles.root}>
      <DataGrid
        items={sortedContracts}
        columns={columns}
        sortable
        selectionMode="none"
        className={styles.grid}
        getRowId={(item) => item.id.toString()}
        aria-label="Contracts table"
        aria-describedby="contracts-table-description"
        role="grid"
        ref={tableRef}
      >
        <DataGridHeader>
          <DataGridRow>
            {columnIds.map((columnId) => (
              <DataGridHeaderCell
                key={columnId}
                aria-sort={
                  sortColumn === columnId
                    ? sortDirection === 'ascending'
                      ? 'ascending'
                      : sortDirection === 'descending'
                      ? 'descending'
                      : 'none'
                    : undefined
                }
                onClick={() => columnId !== 'actions' && handleSort(columnId as SortableField)}
                style={{ cursor: columnId !== 'actions' ? 'pointer' : 'default' }}
                tabIndex={columnId !== 'actions' ? 0 : -1}
                onKeyDown={(e) => {
                  if ((e.key === 'Enter' || e.key === ' ') && columnId !== 'actions') {
                    e.preventDefault();
                    handleSort(columnId as SortableField);
                  }
                }}
                aria-label={`Sort by ${columnHeaders[columnId as keyof typeof columnHeaders]}`}
              >
                {columnHeaders[columnId as keyof typeof columnHeaders]}
              </DataGridHeaderCell>
            ))}
          </DataGridRow>
        </DataGridHeader>
        <DataGridBody>
          {sortedContracts.map((contract, index) => (
            <DataGridRow
              key={contract.id}
              className={styles.clickableRow}
              onClick={() => onContractClick(contract)}
              onKeyDown={(e) => handleKeyDown(e, contract, index)}
              aria-label={`Contract ${contract.contractNumber} - ${contract.name}`}
              aria-rowindex={index + 2}
              tabIndex={selectedRowIndex === index ? 0 : -1}
              ref={(el) => {
                if (el) {
                  rowRefs.current.set(index, el);
                } else {
                  rowRefs.current.delete(index);
                }
              }}
              style={{
                outline: selectedRowIndex === index ? `2px solid ${tokens.colorBrandForeground1}` : 'none',
              }}
            >
              {columnIds.map((columnId) => (
                <DataGridCell key={columnId} aria-colindex={columnIds.indexOf(columnId) + 1}>
                  {renderCellContent(contract, columnId)}
                </DataGridCell>
              ))}
            </DataGridRow>
          ))}
        </DataGridBody>
      </DataGrid>

      <div className={styles.pagination}>
        <div className={styles.paginationControls}>
          <Button
            onClick={handlePreviousPage}
            disabled={page === 1}
            aria-label="Previous page"
          >
            Előző
          </Button>
          <span className={styles.pageInfo}>
            {page}. oldal / {totalPages || 1}
          </span>
          <Button
            onClick={handleNextPage}
            disabled={page >= totalPages}
            aria-label="Next page"
          >
            Következő
          </Button>
        </div>
        <Dropdown
          value={pageSize.toString()}
          onOptionSelect={handlePageSizeChange}
          aria-label="Page size"
        >
          <Option value="10">10 / oldal</Option>
          <Option value="25">25 / oldal</Option>
          <Option value="50">50 / oldal</Option>
          <Option value="100">100 / oldal</Option>
        </Dropdown>
      </div>
    </div>
  );
};

// Add a visually hidden description for screen readers
export const ContractTableDescription: React.FC = () => (
  <div id="contracts-table-description" className="sr-only">
    Use arrow keys to navigate rows. Press Enter or Space to view contract details. 
    Press Delete to remove a contract (admin only). Press Ctrl+E to edit (admin only). 
    Press Ctrl+Home to go to first row, Ctrl+End to go to last row.
  </div>
);