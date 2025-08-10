import React, { useMemo, useCallback } from 'react';
import { Button, Divider, ProgressBar, Text, Tooltip } from '@fluentui/react-components';

export interface WizardStepDefinition {
  key: string;
  label: string;
}

interface WizardNavigationProps {
  steps: WizardStepDefinition[];
  currentStepIndex: number;
  canProceed: boolean;
  onStepChange: (index: number) => void;
  onBack: () => void;
  onNext: () => void;
  onSaveDraft?: () => void;
  submitLabel?: string;
}

// Legacy props compatibility (used by existing tests)
type LegacyStep = { label: string; isValid?: boolean; hasError?: boolean };
interface LegacyWizardNavigationProps {
  currentStep: number;
  steps: LegacyStep[];
  onStepChange: (index: number) => void;
  onBack: () => void;
  onNext: () => void;
  onSave?: () => void;
  isLoading?: boolean;
  submitLabel?: string;
  isSubmitting?: boolean;
}

export const WizardNavigation: React.FC<WizardNavigationProps | LegacyWizardNavigationProps> = (props) => {
  const isLegacy = (props as LegacyWizardNavigationProps).currentStep !== undefined;

  const steps = useMemo(() => {
    if (isLegacy) {
      const legacy = props as LegacyWizardNavigationProps;
      return legacy.steps.map((s, idx) => ({ key: String(idx), label: s.label, ...s }));
    }
    return (props as WizardNavigationProps).steps;
  }, [props, isLegacy]);

  const currentStepIndex = isLegacy
    ? (props as LegacyWizardNavigationProps).currentStep
    : (props as WizardNavigationProps).currentStepIndex;

  const canProceed = isLegacy
    ? Boolean((props as LegacyWizardNavigationProps).steps[currentStepIndex]?.isValid)
    : (props as WizardNavigationProps).canProceed;

  const onStepChange = isLegacy
    ? (props as LegacyWizardNavigationProps).onStepChange
    : (props as WizardNavigationProps).onStepChange;

  const onBack = isLegacy
    ? (props as LegacyWizardNavigationProps).onBack
    : (props as WizardNavigationProps).onBack;

  const onNext = isLegacy
    ? (props as LegacyWizardNavigationProps).onNext
    : (props as WizardNavigationProps).onNext;

  const onSaveDraft = isLegacy
    ? (props as LegacyWizardNavigationProps).onSave
    : (props as WizardNavigationProps).onSaveDraft;

  const isSubmitting = isLegacy ? Boolean((props as LegacyWizardNavigationProps).isSubmitting) : false;
  const submitLabel = isLegacy
    ? ((props as LegacyWizardNavigationProps).submitLabel || 'Submit')
    : ((props as WizardNavigationProps).submitLabel || 'Submit');

  const progressValue = (currentStepIndex + 1) / steps.length;

  const isLastStep = currentStepIndex === steps.length - 1;
  const isLoading = isLegacy ? Boolean((props as LegacyWizardNavigationProps).isLoading) : false;

  return (
    <div role="navigation" aria-label="Wizard Steps" tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === 'ArrowLeft') {
          e.preventDefault();
          onBack();
        }
        if (e.key === 'ArrowRight') {
          e.preventDefault();
          onNext();
        }
      }}
    >
      <ProgressBar max={1} value={progressValue} aria-label={`Lépés ${currentStepIndex + 1} / ${steps.length}`} />
      <Text size={200}>{Math.round(progressValue * 100)}% kész</Text>
      <div style={{ display: 'flex', gap: 12, marginTop: 16, flexWrap: 'wrap' }} role="list">
        {steps.map((step, index) => {
          const isActive = index === currentStepIndex;
          const isCompleted = index < currentStepIndex;
          const legacy = isLegacy ? (props as LegacyWizardNavigationProps).steps[index] : undefined;
          const hasError = isLegacy ? Boolean(legacy?.hasError) : false;
          const showCheckmark = isLegacy ? isCompleted && Boolean(legacy?.isValid) : isCompleted;
          return (
            <Tooltip key={step.key} content={step.label} relationship="label">
              <button
                type="button"
                role="button"
                // Use native button role for test compatibility
                aria-current={isActive ? 'step' : undefined}
                aria-invalid={hasError ? true : undefined}
                aria-label={`Step ${index + 1}: ${step.label}${isActive ? ', current' : ''}`}
                onClick={() => {
                  // Prevent navigating to future invalid steps in legacy mode
                  if (isLegacy) {
                    const legacySteps = (props as LegacyWizardNavigationProps).steps;
                    const targetIsFuture = index > currentStepIndex;
                    if (targetIsFuture) {
                      // Only allow if all previous are valid
                      const allPrevValid = legacySteps.slice(0, index).every(s => s.isValid);
                      if (!allPrevValid) {
                        return;
                      }
                    }
                  }
                  onStepChange(index);
                }}
                style={{
                  cursor: 'pointer',
                  border: isActive ? '2px solid var(--colorBrandStroke1)' : '1px solid var(--colorNeutralStroke1)',
                  background: isCompleted ? 'var(--colorBrandBackground2)' : 'transparent',
                  color: 'inherit',
                  padding: '8px 12px',
                  borderRadius: 8,
                }}
                data-testid={`wizard-step-${index}`}
              >
                <span aria-hidden="true">{index + 1}. </span>
                <span>{(step as any).label}</span>
                {showCheckmark && <span data-testid="step-complete-icon" aria-hidden="true">✓</span>}
              </button>
            </Tooltip>
          );
        })}
      </div>

      <Divider style={{ marginTop: 16, marginBottom: 12 }} />

      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
        <div>
          <Button
            appearance="outline"
            onClick={onBack}
            disabled={currentStepIndex === 0 || isSubmitting || isLoading}
            data-testid="wizard-back"
          >
             Vissza
          </Button>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          {onSaveDraft && (
            <Button appearance="subtle" onClick={onSaveDraft} data-testid="wizard-save-draft" disabled={isSubmitting || isLoading}>
              Piszkozat mentése
            </Button>
          )}
          {isLastStep ? (
            <Button
              appearance="primary"
              onClick={onNext}
              disabled={!canProceed || isSubmitting || isLoading}
              data-testid="wizard-submit"
            >
              {submitLabel}
            </Button>
          ) : (
            <Button
              appearance="primary"
              onClick={onNext}
              disabled={!canProceed || isSubmitting || isLoading}
              data-testid="wizard-next"
            >
            Következő
            </Button>
          )}
        </div>
      </div>
    </div>
  );
};

export default WizardNavigation;


