import { useState, useMemo, useCallback, useRef } from 'react';
import {
  Table,
  TableHeader,
  TableHeaderCell,
  TableBody,
  TableRow,
  TableCell,
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
  tableContainer: {
    flex: 1,
    overflow: 'auto',
  },
  table: {
    width: '100%',
  },
  activeStatus: {
    backgroundColor: tokens.colorPaletteGreenBackground2,
    color: tokens.colorPaletteGreenForeground2,
  },
  inactiveStatus: {
    backgroundColor: tokens.colorPaletteYellowBackground2,
    color: tokens.colorPaletteYellowForeground2,
  },
  expiredStatus: {
    backgroundColor: tokens.colorPaletteRedBackground2,
    color: tokens.colorPaletteRedForeground2,
  },
  pagination: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: tokens.spacingVerticalM,
    borderTop: `1px solid ${tokens.colorNeutralStroke1}`,
  },
  paginationInfo: {
    display: 'flex',
    alignItems: 'center',
    gap: tokens.spacingHorizontalM,
  },
  paginationControls: {
    display: 'flex',
    gap: tokens.spacingHorizontalS,
  },
  clickableRow: {
    cursor: 'pointer',
    '&:hover': {
      backgroundColor: tokens.colorNeutralBackground1Hover,
    },
  },
});

export const ContractTableSimple: React.FC<ContractTableProps> = ({
  contracts,
  onContractClick,
  onEdit,
  onDelete,
  canEdit = false,
  canDelete = false,
  page,
  pageSize,
  totalPages,
  onPageChange,
  onPageSizeChange,
}) => {
  const styles = useStyles();

  const getStatusBadge = (status: Contract['status']) => {
    let icon;
    let className;
    
    switch (status) {
      case 'active':
        icon = <CheckmarkCircle20Regular />;
        className = styles.activeStatus;
        break;
      case 'inactive':
        icon = <DismissCircle20Regular />;
        className = styles.inactiveStatus;
        break;
      case 'expired':
        icon = <Clock20Regular />;
        className = styles.expiredStatus;
        break;
    }
    
    return (
      <Badge appearance="filled" className={className}>
        {icon} {status}
      </Badge>
    );
  };
  
  const formatDate = (date: string) => {
    if (!date) return '-';
    return new Date(date).toLocaleDateString('hu-HU');
  };

  const handlePageSizeChange = (_: any, data: any) => {
    onPageSizeChange(parseInt(data.value));
  };

  return (
    <div className={styles.root}>
      <div className={styles.tableContainer}>
        <Table className={styles.table} aria-label="Contracts table">
          <TableHeader>
            <TableRow>
              <TableHeaderCell>Szerződésszám</TableHeaderCell>
              <TableHeaderCell>Név</TableHeaderCell>
              <TableHeaderCell>Ügyfél neve</TableHeaderCell>
              <TableHeaderCell>Státusz</TableHeaderCell>
              <TableHeaderCell>Kezdés dátuma</TableHeaderCell>
              <TableHeaderCell>Lejárat dátuma</TableHeaderCell>
              <TableHeaderCell>PM</TableHeaderCell>
              {(canEdit || canDelete) && <TableHeaderCell>Műveletek</TableHeaderCell>}
            </TableRow>
          </TableHeader>
          <TableBody>
            {contracts && contracts.length > 0 ? (
              contracts.map((contract) => (
                <TableRow 
                  key={contract.id}
                  onClick={() => onContractClick(contract)}
                  className={styles.clickableRow}
                >
                  <TableCell>
                    <TableCellLayout>{contract.contractNumber}</TableCellLayout>
                  </TableCell>
                  <TableCell>
                    <TableCellLayout>{contract.name}</TableCellLayout>
                  </TableCell>
                  <TableCell>
                    <TableCellLayout>{contract.clientName || '-'}</TableCellLayout>
                  </TableCell>
                  <TableCell>
                    <TableCellLayout>{getStatusBadge(contract.status)}</TableCellLayout>
                  </TableCell>
                  <TableCell>
                    <TableCellLayout>{formatDate(contract.startDate)}</TableCellLayout>
                  </TableCell>
                  <TableCell>
                    <TableCellLayout>{contract.endDate ? formatDate(contract.endDate) : '-'}</TableCellLayout>
                  </TableCell>
                  <TableCell>
                    <TableCellLayout>{contract.pmName || '-'}</TableCellLayout>
                  </TableCell>
                  {(canEdit || canDelete) && (
                    <TableCell>
                      <TableCellLayout>
                        <div style={{ display: 'flex', gap: '4px' }}>
                          {canEdit && onEdit && (
                            <Button
                              icon={<Edit20Regular />}
                              appearance="subtle"
                              size="small"
                              onClick={(e) => {
                                e.stopPropagation();
                                onEdit(contract);
                              }}
                              aria-label={`Edit contract ${contract.contractNumber}`}
                            />
                          )}
                          {canDelete && onDelete && (
                            <Button
                              icon={<Delete20Regular />}
                              appearance="subtle"
                              size="small"
                              onClick={(e) => {
                                e.stopPropagation();
                                onDelete(contract);
                              }}
                              aria-label={`Delete contract ${contract.contractNumber}`}
                            />
                          )}
                        </div>
                      </TableCellLayout>
                    </TableCell>
                  )}
                </TableRow>
              ))
            ) : (
              <TableRow>
                <TableCell colSpan={canEdit || canDelete ? 8 : 7}>
                  <TableCellLayout>
                    <div style={{ textAlign: 'center', padding: '20px' }}>
                      Nincsenek szerződések
                    </div>
                  </TableCellLayout>
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>
      
      <div className={styles.pagination}>
        <div className={styles.paginationInfo}>
          <span>Oldal: {page} / {totalPages}</span>
          <Dropdown 
            value={pageSize.toString()}
            onOptionSelect={handlePageSizeChange}
            aria-label="Page size"
          >
            <Option value="10">10</Option>
            <Option value="25">25</Option>
            <Option value="50">50</Option>
            <Option value="100">100</Option>
          </Dropdown>
          <span>elem/oldal</span>
        </div>
        
        <div className={styles.paginationControls}>
          <Button 
            onClick={() => onPageChange(page - 1)} 
            disabled={page === 1}
            appearance="subtle"
          >
            Előző
          </Button>
          <Button 
            onClick={() => onPageChange(page + 1)} 
            disabled={page === totalPages}
            appearance="subtle"
          >
            Következő
          </Button>
        </div>
      </div>
    </div>
  );
};

// Export description component
export const ContractTableDescription: React.FC = () => (
  <div id="contracts-table-description" style={{ position: 'absolute', left: '-10000px' }}>
    This table displays contract information including contract number, name, client, status, dates, and project manager.
    Click on a row to view contract details. Use the pagination controls to navigate through the list.
  </div>
);