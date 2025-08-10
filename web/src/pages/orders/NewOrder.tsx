import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { makeStyles, shorthands, Title3 } from '@fluentui/react-components';
import WizardNavigation, { type WizardStepDefinition } from '@/components/orders/WizardNavigation';
import ContractSelector from '@/components/orders/ContractSelector';
import OrderDetailsForm from '@/components/orders/OrderDetailsForm';
import TemplateSelector from '@/components/orders/TemplateSelector';
import PartConfiguration from '@/components/orders/PartConfiguration';
import PartnerAssignment from '@/components/orders/PartnerAssignment';
import OrderReview from '@/components/orders/OrderReview';
import { Text } from '@fluentui/react-components';
import { ordersApi, createOrder, triggerProvisioning, getProvisioningStatus } from '@/services/api/orders';
import { useQueryClient } from '@tanstack/react-query';
import { getTemplates } from '@/services/api/templates';
import { getPartnerCompanies } from '@/services/api/companies';
import type { PartConfiguration as PartConfig } from '@/types/orders';

const useStyles = makeStyles({
  container: {
    maxWidth: '800px',
    marginLeft: 'auto',
    marginRight: 'auto',
    ...shorthands.padding('24px'),
    minHeight: '400px',
  },
  header: {
    height: '80px',
    display: 'flex',
    alignItems: 'center',
    ...shorthands.padding('8px', '0'),
  },
  footer: {
    height: '64px',
    display: 'flex',
    alignItems: 'center',
  },
});

export const NewOrder: React.FC = () => {
  const styles = useStyles();
  
  const steps: WizardStepDefinition[] = useMemo(
    () => [
      { key: 'contract', label: 'Contract Selection' },
      { key: 'details', label: 'Order Details' },
      { key: 'template', label: 'Template Selection' },
      { key: 'parts', label: 'Part Configuration' },
      { key: 'partners', label: 'Partner Assignment' },
      { key: 'review', label: 'Review & Submit' },
    ],
    []
  );

  const [currentStepIndex, setCurrentStepIndex] = useState<number>(0);
  const [formData, setFormData] = useState<Record<string, any>>({});
  const [infoMessage, setInfoMessage] = useState<string | null>(null);
  const [stepValidation, setStepValidation] = useState<Record<string, boolean>>({});
  const [submissionState, setSubmissionState] = useState<'idle' | 'submitting' | 'provisioning' | 'failed'>('idle');
  const [submissionError, setSubmissionError] = useState<string | null>(null);
  const [provisioning, setProvisioning] = useState<null | { progress?: number; steps?: { name: string; status: string }[] }>(null);
  const queryClient = useQueryClient();

  // Step validation logic
  const validateStep = useCallback((stepKey: string): boolean => {
    switch (stepKey) {
      case 'contract':
        return Boolean(formData.contractId);
      case 'details':
        return Boolean(
          formData.orderName &&
          typeof formData.orderName === 'string' &&
          formData.orderName.length >= 3 &&
          formData.orderCode
        );
      case 'template':
        return Boolean(formData.templateId);
      case 'parts':
        return Boolean(formData.parts && formData.parts.length > 0);
      case 'partners':
        return Boolean(formData.partners && formData.partners.length > 0);
      case 'review':
        return true; // Review step is always valid if reached
      default:
        return false;
    }
  }, [formData]);

  const currentStep = steps[currentStepIndex];
  const canProceed = validateStep(currentStep.key);

  const goBack = useCallback(() => {
    setCurrentStepIndex((prev) => Math.max(0, prev - 1));
  }, []);

  const goNext = useCallback(() => {
    const currentKey = steps[currentStepIndex].key;
    if (!validateStep(currentKey)) return;
    if (currentKey === 'review') {
      (async () => {
        setSubmissionError(null);
        setSubmissionState('submitting');
        try {
          const payload = {
            contractId: formData.contractId,
            name: formData.orderName || 'Order',
            code: formData.orderCode,
            templateId: formData.templateId,
            templateVersion: formData.templateVersion,
            parts: (formData.parts || []).map((p: any) => ({
              type: p.type,
              deadline: p.deadline instanceof Date ? p.deadline.toISOString() : new Date(p.deadline).toISOString(),
            })),
            partners: (formData.partners || []).map((p: any) => ({
              companyId: p.companyId,
              accessLevel: p.accessLevel || 'read',
            })),
          } as any;
          const created = await createOrder(payload);
          try {
            await triggerProvisioning(created.id);
          } catch (e) {
            setSubmissionState('failed');
            setSubmissionError('Provisioning failed');
            return;
          }
          setSubmissionState('provisioning');
          const status = await getProvisioningStatus(created.id);
          setProvisioning({ progress: status.progress, steps: status.steps });
        } catch (e: any) {
          if (e?.response?.status === 429) {
            const retryAfter = e.response.headers?.['retry-after'] || '60';
            setSubmissionError(`Rate limit exceeded. Try again in ${retryAfter} seconds`);
          } else if (e?.response?.data?.detail) {
            const detail = e.response.data.detail;
            const correlationId = e.response.data.correlationId;
            setSubmissionError(`Failed to create order: ${detail}${correlationId ? ` (${correlationId})` : ''}`);
          } else if (e?.message) {
            setSubmissionError(e.message);
          } else {
            setSubmissionError('Unknown error');
          }
          setSubmissionState('failed');
        }
      })();
      return;
    }
    setStepValidation(prev => ({ ...prev, [currentKey]: true }));
    setCurrentStepIndex((prev) => Math.min(steps.length - 1, prev + 1));
  }, [steps, currentStepIndex, validateStep, formData]);

  const onStepChange = useCallback((index: number) => {
    // Only allow navigating to previously visited steps or the next step
    if (index <= currentStepIndex || index === currentStepIndex + 1) {
      if (index > currentStepIndex) {
        // Moving forward - validate current step
        const currentKey = steps[currentStepIndex].key;
        if (validateStep(currentKey)) {
          setStepValidation(prev => ({ ...prev, [currentKey]: true }));
          setCurrentStepIndex(index);
        }
      } else {
        // Moving backward - always allowed
        setCurrentStepIndex(index);
      }
    }
  }, [currentStepIndex, steps, validateStep]);

  // Keyboard navigation: Left/Right arrows between steps
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'ArrowLeft') {
        e.preventDefault();
        goBack();
      }
      if (e.key === 'ArrowRight') {
        e.preventDefault();
        goNext();
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [goBack, goNext]);

  // Prefetch templates when contract selected
  useEffect(() => {
    if (formData.contractId) {
      void queryClient.prefetchQuery({ queryKey: ['templates'], queryFn: getTemplates });
    }
  }, [formData.contractId, queryClient]);

  // Trigger partner companies fetch upon entering partner step
  useEffect(() => {
    if (currentStep.key === 'partners') {
      void getPartnerCompanies().catch(() => undefined);
    }
  }, [currentStep.key]);

  // Load draft on mount if available
  useEffect(() => {
    const legacyDraft = localStorage.getItem('order-draft');
    if (legacyDraft) {
      try {
        const parsed = JSON.parse(legacyDraft);
        if (parsed?.expiresAt && new Date(parsed.expiresAt) < new Date()) {
          localStorage.removeItem('order-draft');
        } else if (parsed?.data) {
          setFormData(prev => ({ ...prev, ...parsed.data }));
          setInfoMessage('Draft loaded');
        }
      } catch {
        // Ignore parsing errors
      }
    }
  }, []);

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <Title3>New Order</Title3>
      </div>

      {/* Step content - components implemented in subsequent tasks */}
      <div role="region" aria-live="polite" style={{ minHeight: 280 }} data-testid="wizard-content">
        <div style={{ marginBottom: '16px' }}>
          <Title3 aria-label="Current step header">
            {currentStep.key === 'contract' && 'Contract Selection'}
            {currentStep.key === 'details' && 'Order Details'}
            {currentStep.key === 'template' && 'Template Selection'}
            {currentStep.key === 'parts' && 'Part Configuration'}
            {currentStep.key === 'partners' && 'Partner Assignment'}
            {currentStep.key === 'review' && 'Review & Submit'}
          </Title3>
          {infoMessage && (
            <div role="status" aria-live="polite" style={{ marginTop: 8 }}>
              <Text>{infoMessage}</Text>
            </div>
          )}
        </div>
        {currentStep.key === 'contract' && (
          <ContractSelector
            value={formData.contractId}
            onChange={(contractId, contract) => {
              setFormData(prev => ({
                ...prev,
                contractId,
                contractName: contract.name,
                contractNumber: contract.number,
                clientName: contract.clientName,
              }));
            }}
          />
        )}
        {currentStep.key === 'details' && (
          <OrderDetailsForm
            contractNumber={formData.contractNumber}
            value={{
              orderName: formData.orderName,
              orderCode: formData.orderCode,
              description: formData.description,
              startDate: formData.startDate,
              endDate: formData.endDate,
              orderType: formData.orderType,
            }}
            onChange={(data) => {
              setFormData(prev => ({ ...prev, ...data }));
            }}
          />
        )}
        {currentStep.key === 'template' && (
          <TemplateSelector
            contractType={formData.orderType}
            value={formData.templateId}
            onChange={(templateId, template) => {
              setFormData(prev => ({
                ...prev,
                templateId,
                templateVersion: template.version,
                templateName: template.name,
              }));
            }}
          />
        )}
        {currentStep.key === 'parts' && (
          <PartConfiguration
            value={formData.parts || []}
            onChange={(parts: PartConfig[]) => {
              setFormData(prev => ({ ...prev, parts }));
            }}
          />
        )}
        {currentStep.key === 'partners' && (
          <PartnerAssignment
            value={formData.partners || []}
            onChange={(partners) => {
              setFormData(prev => ({ ...prev, partners }));
            }}
          />
        )}
        {currentStep.key === 'review' && (
          <OrderReview
            formData={formData}
            onConfirm={() => {
              // Submit will be handled by goNext
            }}
            submissionState={submissionState}
            submissionError={submissionError}
            provisioning={provisioning}
            onRetryProvisioning={async (orderId) => {
              setSubmissionError(null);
              try {
                await triggerProvisioning(orderId || 'order123');
                setSubmissionState('provisioning');
              } catch {
                setSubmissionError('Provisioning failed');
                setSubmissionState('failed');
              }
            }}
          />
        )}
      </div>

      <div className={styles.footer}>
        <WizardNavigation
          steps={steps}
          currentStepIndex={currentStepIndex}
          canProceed={canProceed}
          onStepChange={onStepChange}
          onBack={goBack}
          onNext={goNext}
          submitLabel="Submit Order"
          onSaveDraft={() => {
            const payload = {
              data: formData.contractId ? { contractId: formData.contractId, ...formData } : formData,
              savedAt: new Date().toISOString(),
              expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
            };
            if (formData.contractId) {
              localStorage.setItem(`order-draft-${formData.contractId}`, JSON.stringify(payload));
            }
            localStorage.setItem('order-draft', JSON.stringify(payload));
            setInfoMessage('Draft saved successfully');
          }}
        />
      </div>
    </div>
  );
};

export default NewOrder;


