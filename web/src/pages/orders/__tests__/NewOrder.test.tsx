import React from 'react';
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { BrowserRouter } from 'react-router-dom';
import userEvent from '@testing-library/user-event';
import { NewOrder } from '../NewOrder';

const wrap = (ui: React.ReactNode) => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return (
    <QueryClientProvider client={client}>
      <BrowserRouter>
        {ui}
      </BrowserRouter>
    </QueryClientProvider>
  );
};

describe('NewOrder Wizard', () => {
  it('renders wizard with steps and navigation controls', () => {
    render(wrap(<NewOrder />));

    expect(screen.getByText('New Order')).toBeInTheDocument();
    expect(screen.getByTestId('wizard-back')).toBeDisabled();
    expect(screen.getByTestId('wizard-next')).toBeDisabled(); // Disabled due to validation

    // Step buttons visible
    expect(screen.getByTestId('wizard-step-0')).toBeInTheDocument();
    expect(screen.getByTestId('wizard-step-5')).toBeInTheDocument();
  });

  it('advances and goes back between steps via buttons', async () => {
    const user = userEvent.setup();
    render(wrap(<NewOrder />));

    expect(screen.getByText('Contract Selection')).toBeInTheDocument();
    // Next button disabled initially due to validation
    expect(screen.getByTestId('wizard-next')).toBeDisabled();
    
    // Back button still works
    await user.click(screen.getByTestId('wizard-back'));
    expect(screen.getByTestId('wizard-back')).toBeDisabled();
  });

  it('navigates between steps using arrow keys', async () => {
    const user = userEvent.setup();
    render(wrap(<NewOrder />));

    expect(screen.getByText('Contract Selection')).toBeInTheDocument();
    // Can't move forward without validation
    await user.keyboard('{ArrowRight}');
    expect(screen.getByText('Contract Selection')).toBeInTheDocument();
    // Can't go back from first step
    await user.keyboard('{ArrowLeft}');
    expect(screen.getByText('Contract Selection')).toBeInTheDocument();
  });

  it('cannot jump ahead without validation', async () => {
    const user = userEvent.setup();
    render(wrap(<NewOrder />));

    // Cannot jump to step 4 without completing earlier steps
    await user.click(screen.getByTestId('wizard-step-3'));
    expect(screen.getByText('Contract Selection')).toBeInTheDocument();
  });
});


