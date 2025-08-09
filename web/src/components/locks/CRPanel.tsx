import React, { useState, useEffect } from 'react';
import {
  Card,
  CardHeader,
  CardPreview,
  Button,
  Dialog,
  DialogTrigger,
  DialogSurface,
  DialogTitle,
  DialogContent,
  DialogBody,
  DialogActions,
  Field,
  Textarea,
  Dropdown,
  Option,
  Spinner,
  Text,
  makeStyles,
  tokens,
  Badge,
  Divider,
  MessageBar,
  MessageBarBody,
  MessageBarTitle,
  DataGrid,
  DataGridHeader,
  DataGridHeaderCell,
  DataGridBody,
  DataGridRow,
  DataGridCell,
  TableColumnDefinition,
  createTableColumn,
} from '@fluentui/react-components';
import {
  ClockRegular,
  LockOpenRegular,
  DismissRegular,
  AddRegular,
  HistoryRegular,
} from '@fluentui/react-icons';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiService } from '../../services/api.service';
import { format, formatDistanceToNow } from 'date-fns';

const useStyles = makeStyles({
  container: {
    display: 'flex',
    flexDirection: 'column',
    gap: tokens.spacingVerticalL,
    padding: tokens.spacingHorizontalL,
  },
  panel: {
    maxWidth: '1200px',
    width: '100%',
  },
  crCard: {
    marginBottom: tokens.spacingVerticalM,
  },
  crHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  crDetails: {
    display: 'flex',
    flexDirection: 'column',
    gap: tokens.spacingVerticalS,
    padding: tokens.spacingVerticalM,
  },
  countdown: {
    display: 'flex',
    alignItems: 'center',
    gap: tokens.spacingHorizontalS,
    color: tokens.colorBrandForeground1,
    fontWeight: 600,
  },
  expiring: {
    color: tokens.colorPaletteRedForeground1,
  },
  formSection: {
    display: 'flex',
    flexDirection: 'column',
    gap: tokens.spacingVerticalM,
  },
  buttonGroup: {
    display: 'flex',
    gap: tokens.spacingHorizontalM,
    marginTop: tokens.spacingVerticalL,
  },
  emptyState: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    padding: tokens.spacingVerticalXXL,
    textAlign: 'center',
    gap: tokens.spacingVerticalM,
  },
  historySection: {
    marginTop: tokens.spacingVerticalL,
  },
  badge: {
    marginLeft: tokens.spacingHorizontalS,
  },
});

interface CRPanelProps {
  emId: string;
  currentLockState?: any;
  userRole: 'admin' | 'pm' | 'viewer';
}

interface ChangeRequest {
  id: string;
  scope: 'experts' | 'deliverables';
  reason: string;
  createdBy: {
    id: string;
    name: string;
    email: string;
  };
  createdAt: string;
  expiresAt: string;
  status: 'active' | 'expired' | 'closed';
  closedBy?: {
    id: string;
    name: string;
  };
  closedAt?: string;
}

interface CRCreateRequest {
  em_id: string;
  scope: 'experts' | 'deliverables';
  reason: string;
  duration_hours?: number;
}

interface CRCloseRequest {
  cr_id: string;
  reason?: string;
}

export const CRPanel: React.FC<CRPanelProps> = ({ emId, currentLockState, userRole }) => {
  const styles = useStyles();
  const queryClient = useQueryClient();
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [createFormData, setCreateFormData] = useState<Partial<CRCreateRequest>>({
    scope: 'experts',
    reason: '',
    duration_hours: 48,
  });
  const [countdowns, setCountdowns] = useState<{ [key: string]: string }>({});

  // Fetch active CRs
  const { data: activeCRs, isLoading, error } = useQuery({
    queryKey: ['change-requests', emId],
    queryFn: () => apiService.get<ChangeRequest[]>(`/api/locks/cr/${emId}`),
    refetchInterval: 60000, // Refresh every minute
  });

  // Create CR mutation
  const createCRMutation = useMutation({
    mutationFn: (data: CRCreateRequest) =>
      apiService.post<ChangeRequest>('/api/locks/cr/open', data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['change-requests', emId] });
      setIsCreateDialogOpen(false);
      setCreateFormData({ scope: 'experts', reason: '', duration_hours: 48 });
    },
  });

  // Close CR mutation
  const closeCRMutation = useMutation({
    mutationFn: (data: CRCloseRequest) =>
      apiService.post<ChangeRequest>('/api/locks/cr/close', data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['change-requests', emId] });
    },
  });

  // Update countdown timers
  useEffect(() => {
    if (!activeCRs) return;

    const updateCountdowns = () => {
      const newCountdowns: { [key: string]: string } = {};
      
      activeCRs.forEach(cr => {
        if (cr.status === 'active') {
          const now = new Date();
          const expires = new Date(cr.expiresAt);
          const diff = expires.getTime() - now.getTime();
          
          if (diff > 0) {
            const hours = Math.floor(diff / (1000 * 60 * 60));
            const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
            newCountdowns[cr.id] = `${hours}h ${minutes}m`;
          } else {
            newCountdowns[cr.id] = 'Expired';
          }
        }
      });
      
      setCountdowns(newCountdowns);
    };

    updateCountdowns();
    const interval = setInterval(updateCountdowns, 60000); // Update every minute

    return () => clearInterval(interval);
  }, [activeCRs]);

  const handleCreateCR = () => {
    if (createFormData.reason && createFormData.reason.length >= 20) {
      createCRMutation.mutate({
        em_id: emId,
        scope: createFormData.scope || 'experts',
        reason: createFormData.reason,
        duration_hours: createFormData.duration_hours || 48,
      });
    }
  };

  const handleCloseCR = (crId: string, reason?: string) => {
    closeCRMutation.mutate({
      cr_id: crId,
      reason,
    });
  };

  const canManageCR = userRole === 'admin' || userRole === 'pm';

  // Define columns for history table
  const columns: TableColumnDefinition<ChangeRequest>[] = [
    createTableColumn<ChangeRequest>({
      columnId: 'status',
      renderHeaderCell: () => 'Status',
      renderCell: (item) => (
        <Badge
          appearance="filled"
          color={
            item.status === 'active' ? 'success' :
            item.status === 'expired' ? 'warning' :
            'neutral'
          }
        >
          {item.status}
        </Badge>
      ),
    }),
    createTableColumn<ChangeRequest>({
      columnId: 'scope',
      renderHeaderCell: () => 'Scope',
      renderCell: (item) => (
        <Text>{item.scope === 'experts' ? 'Szakértők' : 'Eredménytermékek'}</Text>
      ),
    }),
    createTableColumn<ChangeRequest>({
      columnId: 'reason',
      renderHeaderCell: () => 'Reason',
      renderCell: (item) => <Text>{item.reason}</Text>,
    }),
    createTableColumn<ChangeRequest>({
      columnId: 'createdBy',
      renderHeaderCell: () => 'Created By',
      renderCell: (item) => <Text>{item.createdBy.name}</Text>,
    }),
    createTableColumn<ChangeRequest>({
      columnId: 'createdAt',
      renderHeaderCell: () => 'Created',
      renderCell: (item) => (
        <Text>{format(new Date(item.createdAt), 'yyyy-MM-dd HH:mm')}</Text>
      ),
    }),
    createTableColumn<ChangeRequest>({
      columnId: 'expires',
      renderHeaderCell: () => 'Expires/Expired',
      renderCell: (item) => (
        <Text>
          {item.status === 'active' && countdowns[item.id] ? (
            <span className={styles.countdown}>
              <ClockRegular />
              {countdowns[item.id]}
            </span>
          ) : (
            format(new Date(item.expiresAt), 'yyyy-MM-dd HH:mm')
          )}
        </Text>
      ),
    }),
  ];

  if (isLoading) {
    return (
      <div className={styles.container}>
        <Spinner label="Loading Change Requests..." />
      </div>
    );
  }

  if (error) {
    return (
      <div className={styles.container}>
        <MessageBar intent="error">
          <MessageBarBody>
            <MessageBarTitle>Error loading Change Requests</MessageBarTitle>
            Failed to load CR data. Please try again.
          </MessageBarBody>
        </MessageBar>
      </div>
    );
  }

  const activeCRsList = activeCRs?.filter(cr => cr.status === 'active') || [];
  const historyCRsList = activeCRs || [];

  return (
    <div className={styles.container}>
      <Card className={styles.panel}>
        <CardHeader
          header={
            <div className={styles.crHeader}>
              <Text size={500} weight="semibold">
                Change Requests
                {activeCRsList.length > 0 && (
                  <Badge className={styles.badge} appearance="filled" color="success">
                    {activeCRsList.length} Active
                  </Badge>
                )}
              </Text>
              {canManageCR && (
                <Dialog open={isCreateDialogOpen} onOpenChange={(_, data) => setIsCreateDialogOpen(data.open)}>
                  <DialogTrigger disableButtonEnhancement>
                    <Button appearance="primary" icon={<AddRegular />}>
                      Create CR
                    </Button>
                  </DialogTrigger>
                  <DialogSurface>
                    <DialogBody>
                      <DialogTitle>Create Change Request</DialogTitle>
                      <DialogContent>
                        <div className={styles.formSection}>
                          <Field label="Scope" required>
                            <Dropdown
                              value={createFormData.scope === 'experts' ? 'Szakértők' : 'Eredménytermékek'}
                              onOptionSelect={(_, data) => {
                                setCreateFormData({
                                  ...createFormData,
                                  scope: data.optionValue as 'experts' | 'deliverables',
                                });
                              }}
                            >
                              <Option value="experts">Szakértők folders</Option>
                              <Option value="deliverables">Eredménytermékek folders</Option>
                            </Dropdown>
                          </Field>
                          <Field
                            label="Reason"
                            required
                            validationMessage={
                              createFormData.reason && createFormData.reason.length < 20
                                ? 'Reason must be at least 20 characters'
                                : undefined
                            }
                          >
                            <Textarea
                              value={createFormData.reason || ''}
                              onChange={(_, data) =>
                                setCreateFormData({ ...createFormData, reason: data.value })
                              }
                              rows={4}
                              placeholder="Describe the reason for this change request (min 20 characters)"
                            />
                          </Field>
                          <Field label="Duration (hours)">
                            <Dropdown
                              value={`${createFormData.duration_hours} hours`}
                              onOptionSelect={(_, data) => {
                                setCreateFormData({
                                  ...createFormData,
                                  duration_hours: parseInt(data.optionValue as string),
                                });
                              }}
                            >
                              <Option value="24">24 hours</Option>
                              <Option value="48">48 hours (default)</Option>
                              <Option value="72">72 hours (maximum)</Option>
                            </Dropdown>
                          </Field>
                        </div>
                      </DialogContent>
                      <DialogActions>
                        <DialogTrigger disableButtonEnhancement>
                          <Button appearance="secondary">Cancel</Button>
                        </DialogTrigger>
                        <Button
                          appearance="primary"
                          onClick={handleCreateCR}
                          disabled={
                            !createFormData.reason ||
                            createFormData.reason.length < 20 ||
                            createCRMutation.isPending
                          }
                        >
                          {createCRMutation.isPending ? 'Creating...' : 'Create CR'}
                        </Button>
                      </DialogActions>
                    </DialogBody>
                  </DialogSurface>
                </Dialog>
              )}
            </div>
          }
        />
        <CardPreview>
          {activeCRsList.length === 0 ? (
            <div className={styles.emptyState}>
              <LockOpenRegular style={{ fontSize: '48px', color: tokens.colorNeutralForeground3 }} />
              <Text size={400}>No active Change Requests</Text>
              <Text size={300} style={{ color: tokens.colorNeutralForeground3 }}>
                {canManageCR
                  ? 'Create a CR to temporarily unlock folders for urgent changes'
                  : 'All folders are following their standard lock rules'}
              </Text>
            </div>
          ) : (
            <div>
              {activeCRsList.map((cr) => (
                <Card key={cr.id} className={styles.crCard}>
                  <CardHeader
                    header={
                      <div className={styles.crHeader}>
                        <div>
                          <Text weight="semibold">
                            {cr.scope === 'experts' ? 'Szakértők' : 'Eredménytermékek'} Unlock
                          </Text>
                          <div
                            className={`${styles.countdown} ${
                              countdowns[cr.id] && countdowns[cr.id].includes('h') &&
                              parseInt(countdowns[cr.id]) < 2
                                ? styles.expiring
                                : ''
                            }`}
                          >
                            <ClockRegular />
                            <Text>Expires in {countdowns[cr.id] || 'calculating...'}</Text>
                          </div>
                        </div>
                        {canManageCR && (
                          <Button
                            appearance="subtle"
                            icon={<DismissRegular />}
                            onClick={() => handleCloseCR(cr.id, 'Manual early closure')}
                            disabled={closeCRMutation.isPending}
                          >
                            Close Early
                          </Button>
                        )}
                      </div>
                    }
                  />
                  <div className={styles.crDetails}>
                    <Text size={300}>
                      <strong>Reason:</strong> {cr.reason}
                    </Text>
                    <Text size={200} style={{ color: tokens.colorNeutralForeground3 }}>
                      Created by {cr.createdBy.name} • {formatDistanceToNow(new Date(cr.createdAt))} ago
                    </Text>
                  </div>
                </Card>
              ))}
            </div>
          )}
        </CardPreview>
      </Card>

      {historyCRsList.length > 0 && (
        <Card className={`${styles.panel} ${styles.historySection}`}>
          <CardHeader
            header={
              <Text size={400} weight="semibold">
                <HistoryRegular /> CR History
              </Text>
            }
          />
          <CardPreview>
            <DataGrid
              items={historyCRsList}
              columns={columns}
              sortable
              resizableColumns
              size="small"
            >
              <DataGridHeader>
                <DataGridRow>
                  {({ renderHeaderCell }) => (
                    <DataGridHeaderCell>{renderHeaderCell()}</DataGridHeaderCell>
                  )}
                </DataGridRow>
              </DataGridHeader>
              <DataGridBody<ChangeRequest>>
                {({ item, rowId }) => (
                  <DataGridRow<ChangeRequest> key={rowId}>
                    {({ renderCell }) => (
                      <DataGridCell>{renderCell(item)}</DataGridCell>
                    )}
                  </DataGridRow>
                )}
              </DataGridBody>
            </DataGrid>
          </CardPreview>
        </Card>
      )}
    </div>
  );
};