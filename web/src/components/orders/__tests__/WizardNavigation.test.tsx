import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { WizardNavigation } from '../WizardNavigation';

describe('WizardNavigation', () => {
  const mockOnStepChange = vi.fn();
  const mockOnBack = vi.fn();
  const mockOnNext = vi.fn();
  const mockOnSave = vi.fn();

  const steps = [
    { label: 'Contract', isValid: true },
    { label: 'Details', isValid: true },
    { label: 'Template', isValid: false },
    { label: 'Parts', isValid: false },
    { label: 'Partners', isValid: false },
    { label: 'Review', isValid: false }
  ];

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders all step indicators', () => {
    render(
      <WizardNavigation
        currentStep={0}
        steps={steps}
        onStepChange={mockOnStepChange}
        onBack={mockOnBack}
        onNext={mockOnNext}
        onSave={mockOnSave}
      />
    );

    steps.forEach(step => {
      expect(screen.getByText(step.label)).toBeInTheDocument();
    });
  });

  it('highlights current step', () => {
    render(
      <WizardNavigation
        currentStep={2}
        steps={steps}
        onStepChange={mockOnStepChange}
        onBack={mockOnBack}
        onNext={mockOnNext}
        onSave={mockOnSave}
      />
    );

    const currentStepElement = screen.getByText('Template').closest('[role="button"]');
    expect(currentStepElement).toHaveAttribute('aria-current', 'step');
  });

  it('disables back button on first step', () => {
    render(
      <WizardNavigation
        currentStep={0}
        steps={steps}
        onStepChange={mockOnStepChange}
        onBack={mockOnBack}
        onNext={mockOnNext}
        onSave={mockOnSave}
      />
    );

    const backButton = screen.getByRole('button', { name: /Back/i });
    expect(backButton).toBeDisabled();
  });

  it('enables back button on non-first steps', () => {
    render(
      <WizardNavigation
        currentStep={2}
        steps={steps}
        onStepChange={mockOnStepChange}
        onBack={mockOnBack}
        onNext={mockOnNext}
        onSave={mockOnSave}
      />
    );

    const backButton = screen.getByRole('button', { name: /Back/i });
    expect(backButton).not.toBeDisabled();
  });

  it('disables next button when current step is invalid', () => {
    render(
      <WizardNavigation
        currentStep={2}
        steps={steps}
        onStepChange={mockOnStepChange}
        onBack={mockOnBack}
        onNext={mockOnNext}
        onSave={mockOnSave}
      />
    );

    const nextButton = screen.getByRole('button', { name: /Next/i });
    expect(nextButton).toBeDisabled();
  });

  it('enables next button when current step is valid', () => {
    render(
      <WizardNavigation
        currentStep={0}
        steps={steps}
        onStepChange={mockOnStepChange}
        onBack={mockOnBack}
        onNext={mockOnNext}
        onSave={mockOnSave}
      />
    );

    const nextButton = screen.getByRole('button', { name: /Next/i });
    expect(nextButton).not.toBeDisabled();
  });

  it('shows submit button on last step', () => {
    const allValidSteps = steps.map(s => ({ ...s, isValid: true }));
    
    render(
      <WizardNavigation
        currentStep={5}
        steps={allValidSteps}
        onStepChange={mockOnStepChange}
        onBack={mockOnBack}
        onNext={mockOnNext}
        onSave={mockOnSave}
      />
    );

    expect(screen.getByRole('button', { name: /Submit/i })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Next/i })).not.toBeInTheDocument();
  });

  it('calls onBack when back button clicked', async () => {
    const user = userEvent.setup();

    render(
      <WizardNavigation
        currentStep={2}
        steps={steps}
        onStepChange={mockOnStepChange}
        onBack={mockOnBack}
        onNext={mockOnNext}
        onSave={mockOnSave}
      />
    );

    const backButton = screen.getByRole('button', { name: /Back/i });
    await user.click(backButton);

    expect(mockOnBack).toHaveBeenCalled();
  });

  it('calls onNext when next button clicked', async () => {
    const user = userEvent.setup();

    render(
      <WizardNavigation
        currentStep={0}
        steps={steps}
        onStepChange={mockOnStepChange}
        onBack={mockOnBack}
        onNext={mockOnNext}
        onSave={mockOnSave}
      />
    );

    const nextButton = screen.getByRole('button', { name: /Next/i });
    await user.click(nextButton);

    expect(mockOnNext).toHaveBeenCalled();
  });

  it('calls onSave when save draft button clicked', async () => {
    const user = userEvent.setup();

    render(
      <WizardNavigation
        currentStep={2}
        steps={steps}
        onStepChange={mockOnStepChange}
        onBack={mockOnBack}
        onNext={mockOnNext}
        onSave={mockOnSave}
      />
    );

    const saveButton = screen.getByRole('button', { name: /Save Draft/i });
    await user.click(saveButton);

    expect(mockOnSave).toHaveBeenCalled();
  });

  it('allows direct navigation to completed steps', async () => {
    const user = userEvent.setup();

    render(
      <WizardNavigation
        currentStep={3}
        steps={steps}
        onStepChange={mockOnStepChange}
        onBack={mockOnBack}
        onNext={mockOnNext}
        onSave={mockOnSave}
      />
    );

    const firstStepButton = screen.getByText('Contract').closest('[role="button"]');
    await user.click(firstStepButton!);

    expect(mockOnStepChange).toHaveBeenCalledWith(0);
  });

  it('prevents navigation to future invalid steps', async () => {
    const user = userEvent.setup();

    render(
      <WizardNavigation
        currentStep={1}
        steps={steps}
        onStepChange={mockOnStepChange}
        onBack={mockOnBack}
        onNext={mockOnNext}
        onSave={mockOnSave}
      />
    );

    const futureStepButton = screen.getByText('Partners').closest('[role="button"]');
    await user.click(futureStepButton!);

    expect(mockOnStepChange).not.toHaveBeenCalled();
  });

  it('shows progress percentage', () => {
    const partiallyComplete = [
      { label: 'Contract', isValid: true },
      { label: 'Details', isValid: true },
      { label: 'Template', isValid: true },
      { label: 'Parts', isValid: false },
      { label: 'Partners', isValid: false },
      { label: 'Review', isValid: false }
    ];

    render(
      <WizardNavigation
        currentStep={2}
        steps={partiallyComplete}
        onStepChange={mockOnStepChange}
        onBack={mockOnBack}
        onNext={mockOnNext}
        onSave={mockOnSave}
      />
    );

    expect(screen.getByText('50% Complete')).toBeInTheDocument();
  });

  it('shows checkmarks for completed steps', () => {
    render(
      <WizardNavigation
        currentStep={3}
        steps={steps}
        onStepChange={mockOnStepChange}
        onBack={mockOnBack}
        onNext={mockOnNext}
        onSave={mockOnSave}
      />
    );

    const completedSteps = screen.getAllByTestId('step-complete-icon');
    expect(completedSteps).toHaveLength(2); // First two steps are valid
  });

  it('supports keyboard navigation', async () => {
    const user = userEvent.setup();

    render(
      <WizardNavigation
        currentStep={1}
        steps={steps}
        onStepChange={mockOnStepChange}
        onBack={mockOnBack}
        onNext={mockOnNext}
        onSave={mockOnSave}
      />
    );

    await user.tab(); // Focus first element
    await user.keyboard('{ArrowLeft}');
    expect(mockOnBack).toHaveBeenCalled();

    await user.keyboard('{ArrowRight}');
    expect(mockOnNext).toHaveBeenCalled();
  });

  it('shows loading state when isLoading prop is true', () => {
    render(
      <WizardNavigation
        currentStep={5}
        steps={steps.map(s => ({ ...s, isValid: true }))}
        onStepChange={mockOnStepChange}
        onBack={mockOnBack}
        onNext={mockOnNext}
        onSave={mockOnSave}
        isLoading={true}
      />
    );

    const submitButton = screen.getByRole('button', { name: /Submit/i });
    expect(submitButton).toBeDisabled();
    expect(screen.getByRole('progressbar')).toBeInTheDocument();
  });

  it('displays custom button labels when provided', () => {
    render(
      <WizardNavigation
        currentStep={5}
        steps={steps.map(s => ({ ...s, isValid: true }))}
        onStepChange={mockOnStepChange}
        onBack={mockOnBack}
        onNext={mockOnNext}
        onSave={mockOnSave}
        submitLabel="Create Order"
      />
    );

    expect(screen.getByRole('button', { name: 'Create Order' })).toBeInTheDocument();
  });

  it('disables all navigation when form is submitting', () => {
    render(
      <WizardNavigation
        currentStep={5}
        steps={steps.map(s => ({ ...s, isValid: true }))}
        onStepChange={mockOnStepChange}
        onBack={mockOnBack}
        onNext={mockOnNext}
        onSave={mockOnSave}
        isSubmitting={true}
      />
    );

    const backButton = screen.getByRole('button', { name: /Back/i });
    const submitButton = screen.getByRole('button', { name: /Submit/i });
    const saveButton = screen.getByRole('button', { name: /Save Draft/i });

    expect(backButton).toBeDisabled();
    expect(submitButton).toBeDisabled();
    expect(saveButton).toBeDisabled();
  });

  it('shows error state for invalid steps', () => {
    const stepsWithErrors = steps.map((s, i) => ({
      ...s,
      hasError: i === 2
    }));

    render(
      <WizardNavigation
        currentStep={3}
        steps={stepsWithErrors}
        onStepChange={mockOnStepChange}
        onBack={mockOnBack}
        onNext={mockOnNext}
        onSave={mockOnSave}
      />
    );

    const errorStep = screen.getByText('Template').closest('[role="button"]');
    expect(errorStep).toHaveAttribute('aria-invalid', 'true');
  });

  it('provides ARIA labels for accessibility', () => {
    render(
      <WizardNavigation
        currentStep={2}
        steps={steps}
        onStepChange={mockOnStepChange}
        onBack={mockOnBack}
        onNext={mockOnNext}
        onSave={mockOnSave}
      />
    );

    expect(screen.getByRole('navigation', { name: /Wizard Steps/i })).toBeInTheDocument();
    expect(screen.getByLabelText(/Step 3 of 6/i)).toBeInTheDocument();
  });
});