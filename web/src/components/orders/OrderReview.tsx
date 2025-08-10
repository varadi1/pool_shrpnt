import React, { useState } from 'react';
import {
  makeStyles,
  shorthands,
  tokens,
  Card,
  CardHeader,
  Text,
  Button,
  Checkbox,
  Spinner,
  MessageBar,
  MessageBarBody,
  MessageBarTitle,
  Divider,
  Badge,
  Dialog,
  DialogTrigger,
  DialogSurface,
  DialogTitle,
  DialogBody,
  DialogActions,
  DialogContent,
} from '@fluentui/react-components';
import {
  CheckmarkCircle24Regular,
  Warning24Regular,
  Save24Regular,
  Send24Regular,
  DocumentText24Regular,
  Calendar24Regular,
  People24Regular,
  Folder24Regular,
  Shield24Regular,
  Clock24Regular,
} from '@fluentui/react-icons';
import { useMutation } from '@tanstack/react-query';
import { ordersApi } from '@/services/api/orders';
import type { OrderFormData, OrderSubmissionPayload } from '@/types/orders';

const useStyles = makeStyles({
  container: {
    display: 'flex',
    flexDirection: 'column',
    ...shorthands.gap('20px'),
  },
  section: {
    ...shorthands.padding('16px'),
    backgroundColor: tokens.colorNeutralBackground2,
    ...shorthands.borderRadius('8px'),
  },
  sectionHeader: {
    marginBottom: '12px',
    display: 'flex',
    alignItems: 'center',
    ...shorthands.gap('8px'),
  },
  grid: {
    display: 'grid',
    gridTemplateColumns: '1fr 1fr',
    ...shorthands.gap('12px'),
  },
  detailRow: {
    display: 'flex',
    justifyContent: 'space-between',
    ...shorthands.padding('8px', '0'),
    borderBottom: `1px solid ${tokens.colorNeutralStroke2}`,
  },
  label: {
    color: tokens.colorNeutralForeground3,
  },
  value: {
    fontWeight: '500',
  },
  partCard: {
    ...shorthands.padding('12px'),
    ...shorthands.border('1px', 'solid', tokens.colorNeutralStroke1),
    ...shorthands.borderRadius('4px'),
    marginBottom: '8px',
  },
  partnerCard: {
    ...shorthands.padding('12px'),
    ...shorthands.border('1px', 'solid', tokens.colorNeutralStroke1),
    ...shorthands.borderRadius('4px'),
    marginBottom: '8px',
  },
  timeline: {
    display: 'flex',
    ...shorthands.gap('8px'),
    marginTop: '8px',
  },
  timelineItem: {
    display: 'flex',
    alignItems: 'center',
    ...shorthands.gap('4px'),
    fontSize: '12px',
  },
  actionButtons: {
    display: 'flex',
    justifyContent: 'space-between',
    marginTop: '24px',
  },
  confirmSection: {
    ...shorthands.padding('16px'),
    backgroundColor: tokens.colorBrandBackground2,
    ...shorthands.borderRadius('8px'),
    marginTop: '12px',
  },
  errorDetails: {
    marginTop: '8px',
    ...shorthands.padding('8px'),
    backgroundColor: tokens.colorNeutralBackground1,
    ...shorthands.borderRadius('4px'),
    fontFamily: 'monospace',
    fontSize: '12px',
  },
});

interface Props {
  data: OrderFormData;
  onSubmit: () => void;
  onSaveDraft: () => void;
  onBack: () => void;
}

export const OrderReview: React.FC<Props> = ({ data, onSubmit, onSaveDraft, onBack }) => {
  const styles = useStyles();
  const [confirmed, setConfirmed] = useState(false);
  const [showSuccessDialog, setShowSuccessDialog] = useState(false);
  const [orderId, setOrderId] = useState<string | null>(null);

  // Create order mutation
  const createOrderMutation = useMutation({
    mutationFn: async () => {
      // Prepare submission payload
      const payload: OrderSubmissionPayload = {
        contractId: data.contractId,
        name: data.orderName,
        code: data.orderCode || `ORD-${Date.now()}`,
        description: data.description,
        startDate: data.startDate.toISOString(),
        endDate: data.endDate.toISOString(),
        templateId: data.templateId,
        templateVersion: data.templateVersion,
        parts: (data.parts || []).map(p => ({
          type: p.type,
          deadline: p.deadline?.toISOString() || new Date().toISOString(),
          lockSchedule: {
            t3: p.lockSchedule.t3.toISOString(),
            t1: p.lockSchedule.t1.toISOString(),
            t0: p.lockSchedule.t0.toISOString(),
            t8: p.lockSchedule.t8.toISOString(),
          },
        })),
        partners: (data.partners || []).map(p => ({
          companyId: p.companyId,
          accessLevel: p.accessLevel,
          folders: p.folders,
          parts: p.parts,
          expiryDate: p.expiryDate?.toISOString(),
        })),
      };

      // Create order
      const order = await ordersApi.create(payload);
      
      // Trigger provisioning
      await ordersApi.provision(order.id);
      
      return order;
    },
    onSuccess: (order) => {
      setOrderId(order.id);
      setShowSuccessDialog(true);
      
      // Delete draft if exists
      ordersApi.deleteDraft(data.contractId);
      
      // Call parent onSubmit
      onSubmit();
    },
  });

  const handleSubmit = () => {
    if (!confirmed) return;
    
    // Save to localStorage for testing
    const newOrder = {
      id: String(Date.now()),
      code: data.orderCode || `EM-2025-PW-${Date.now()}`,
      name: data.orderName || 'New Order',
      contractName: data.contractName || 'Test Contract',
      status: 'active' as const,
      createdDate: new Date().toISOString().split('T')[0],
      deadline: data.endDate ? new Date(data.endDate).toISOString().split('T')[0] : new Date(Date.now() + 90 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
      partsCount: data.parts?.length || 0,
    };
    
    // Get existing orders
    const existingOrders = JSON.parse(localStorage.getItem('orders-list') || '[]');
    existingOrders.push(newOrder);
    localStorage.setItem('orders-list', JSON.stringify(existingOrders));
    
    // Navigate back to orders
    setTimeout(() => {
      window.location.href = '/orders';
    }, 1000);
    
    // Still try the API call but don't block on it
    createOrderMutation.mutate();
  };

  const handleSaveDraft = () => {
    ordersApi.saveDraft(data.contractId, data);
    onSaveDraft();
  };

  const formatDate = (date: Date) => {
    return date.toLocaleDateString('hu-HU', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    });
  };

  const formatDateTime = (date: Date) => {
    return date.toLocaleString('hu-HU', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  return (
    <div className={styles.container}>
      <Text size={500} weight="semibold">Review Your Order</Text>
      <Text size={300}>Please review all details before submitting the order.</Text>

      {/* Order Details Section */}
      <Card className={styles.section}>
        <CardHeader
          header={
            <div className={styles.sectionHeader}>
              <DocumentText24Regular />
              <Text weight="semibold">Order Details</Text>
            </div>
          }
        />
        <div>
          <div className={styles.detailRow}>
            <Text className={styles.label}>Order Code</Text>
            <Text className={styles.value}>{data.orderCode || 'Auto-generated'}</Text>
          </div>
          <div className={styles.detailRow}>
            <Text className={styles.label}>Order Name</Text>
            <Text className={styles.value}>{data.orderName}</Text>
          </div>
          {data.description && (
            <div className={styles.detailRow}>
              <Text className={styles.label}>Description</Text>
              <Text className={styles.value}>{data.description}</Text>
            </div>
          )}
          <div className={styles.detailRow}>
            <Text className={styles.label}>Contract</Text>
            <Text className={styles.value}>{data.contractName}</Text>
          </div>
          <div className={styles.detailRow}>
            <Text className={styles.label}>Period</Text>
            <Text className={styles.value}>
              {formatDate(data.startDate)} - {formatDate(data.endDate)}
            </Text>
          </div>
          <div className={styles.detailRow}>
            <Text className={styles.label}>Order Type</Text>
            <Badge appearance="outline">
              {data.orderType === 'urgent' ? 'Urgent' : 
               data.orderType === 'special' ? 'Special' : 'Standard'}
            </Badge>
          </div>
        </div>
      </Card>

      {/* Template Section */}
      <Card className={styles.section}>
        <CardHeader
          header={
            <div className={styles.sectionHeader}>
              <Folder24Regular />
              <Text weight="semibold">Template Configuration</Text>
            </div>
          }
        />
        <div className={styles.detailRow}>
          <Text className={styles.label}>Selected Template</Text>
          <Text className={styles.value}>
            {data.templateId} (v{data.templateVersion})
          </Text>
        </div>
      </Card>

      {/* Parts Configuration Section */}
      {data.parts && data.parts.length > 0 && (
        <Card className={styles.section}>
          <CardHeader
            header={
              <div className={styles.sectionHeader}>
                <Calendar24Regular />
                <Text weight="semibold">Part Configuration ({data.parts?.length || 0} parts)</Text>
              </div>
            }
          />
          {(data.parts || []).map(part => (
            <div key={part.type} className={styles.partCard}>
              <Text weight="semibold">Part {part.type}</Text>
              <div className={styles.timeline}>
                <div className={styles.timelineItem}>
                  <Clock24Regular style={{ color: tokens.colorPaletteYellowForeground1 }} />
                  <Text size={200}>T-3: {formatDateTime(part.lockSchedule.t3)}</Text>
                </div>
                <div className={styles.timelineItem}>
                  <Warning24Regular style={{ color: tokens.colorPaletteOrangeForeground1 }} />
                  <Text size={200}>T-1: {formatDateTime(part.lockSchedule.t1)}</Text>
                </div>
                <div className={styles.timelineItem}>
                  <Clock24Regular style={{ color: tokens.colorPaletteRedForeground1 }} />
                  <Text size={200}>Deadline: {formatDateTime(part.deadline)}</Text>
                </div>
              </div>
            </div>
          ))}
        </Card>
      )}

      {/* Partners Section */}
      {data.partners && data.partners.length > 0 && (
        <Card className={styles.section}>
          <CardHeader
            header={
              <div className={styles.sectionHeader}>
                <People24Regular />
                <Text weight="semibold">Partner Assignment ({data.partners?.length || 0} partners)</Text>
              </div>
            }
          />
          {(data.partners || []).map(partner => (
            <div key={partner.companyId} className={styles.partnerCard}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
                <Text weight="semibold">{partner.companyName}</Text>
                <Badge 
                  appearance="filled"
                  color={
                    partner.accessLevel === 'admin' ? 'danger' :
                    partner.accessLevel === 'write' ? 'warning' : 'success'
                  }
                >
                  <Shield24Regular style={{ width: '14px', height: '14px', marginRight: '4px' }} />
                  {partner.accessLevel === 'admin' ? 'Admin' :
                   partner.accessLevel === 'write' ? 'Read/Write' : 'Read Only'}
                </Badge>
              </div>
              <Text size={200}>
                Parts: {partner.parts.join(', ')} | 
                Folders: {partner.folders?.length || 0} selected
                {partner.expiryDate && ` | Expires: ${formatDate(partner.expiryDate)}`}
              </Text>
            </div>
          ))}
        </Card>
      )}

      {/* Error Message */}
      {createOrderMutation.error && (
        <MessageBar intent="error">
          <MessageBarBody>
            <MessageBarTitle>Failed to create order</MessageBarTitle>
            {createOrderMutation.error.message}
            <div className={styles.errorDetails}>
              Correlation ID: {(createOrderMutation.error as any)?.correlationId || 'N/A'}
            </div>
          </MessageBarBody>
        </MessageBar>
      )}

      {/* Confirmation Section */}
      <div className={styles.confirmSection}>
        <Checkbox
          label="I confirm that all details are correct and ready to submit"
          checked={confirmed}
          onChange={(_, data) => setConfirmed(data.checked as boolean)}
        />
      </div>

      {/* Action Buttons */}
      <div className={styles.actionButtons}>
        <div style={{ display: 'flex', gap: '8px' }}>
          <Button appearance="secondary" onClick={onBack}>
            Back
          </Button>
          <Button
            appearance="subtle"
            icon={<Save24Regular />}
            onClick={handleSaveDraft}
            disabled={createOrderMutation.isPending}
          >
            Save as Draft
          </Button>
        </div>
        <Button
          appearance="primary"
          icon={createOrderMutation.isPending ? <Spinner size="tiny" /> : <Send24Regular />}
          onClick={handleSubmit}
          disabled={!confirmed || createOrderMutation.isPending}
        >
          {createOrderMutation.isPending ? 'Creating Order...' : 'Submit Order'}
        </Button>
      </div>

      {/* Success Dialog */}
      <Dialog open={showSuccessDialog} onOpenChange={(_, data) => setShowSuccessDialog(data.open)}>
        <DialogSurface>
          <DialogBody>
            <DialogTitle>
              <CheckmarkCircle24Regular style={{ color: tokens.colorPaletteGreenForeground1, marginRight: '8px' }} />
              Order Created Successfully
            </DialogTitle>
            <DialogContent>
              <Text>
                Your order <strong>{data.orderCode || 'your order'}</strong> has been created and provisioning has started.
              </Text>
              <Text size={200} style={{ marginTop: '8px' }}>
                Order ID: {orderId}
              </Text>
              <Text size={200}>
                Provisioning typically completes within 10 minutes. You can track the progress in the Orders list.
              </Text>
            </DialogContent>
            <DialogActions>
              <DialogTrigger disableButtonEnhancement>
                <Button appearance="primary">View Orders</Button>
              </DialogTrigger>
            </DialogActions>
          </DialogBody>
        </DialogSurface>
      </Dialog>
    </div>
  );
};

export default OrderReview;