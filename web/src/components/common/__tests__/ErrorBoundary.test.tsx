import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { ErrorBoundary } from '../ErrorBoundary';
import { FluentProvider } from '@fluentui/react-components';
import { lightTheme } from '@/config/theme.config';
import { errorLoggingService } from '@/services/errorLogging.service';
import { showErrorToast } from '@/utils/errorHandler';

// Mock error logging service
vi.mock('@/services/errorLogging.service', () => ({
  errorLoggingService: {
    generateCorrelationId: vi.fn(() => 'TEST-CORRELATION-ID'),
    logError: vi.fn(),
  },
}));

// Mock error handler
vi.mock('@/utils/errorHandler', () => ({
  showErrorToast: vi.fn(),
}));

// Component that throws an error
const ThrowError = ({ shouldThrow }: { shouldThrow: boolean }) => {
  if (shouldThrow) {
    throw new Error('Test error message');
  }
  return <div>No error</div>;
};

const renderWithProviders = (component: React.ReactElement) => {
  return render(
    <FluentProvider theme={lightTheme}>
      {component}
    </FluentProvider>
  );
};

describe('ErrorBoundary', () => {
  let consoleErrorSpy: any;

  beforeEach(() => {
    // Suppress console.error for these tests
    consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    consoleErrorSpy.mockRestore();
    vi.clearAllMocks();
  });

  it('renders children when there is no error', () => {
    renderWithProviders(
      <ErrorBoundary>
        <div>Test content</div>
      </ErrorBoundary>
    );

    expect(screen.getByText('Test content')).toBeInTheDocument();
  });

  it('catches errors and displays error UI', () => {
    renderWithProviders(
      <ErrorBoundary>
        <ThrowError shouldThrow={true} />
      </ErrorBoundary>
    );

    expect(screen.getByText('Something went wrong')).toBeInTheDocument();
    expect(screen.getByText(/An unexpected error occurred/)).toBeInTheDocument();
  });

  it('displays correlation ID', () => {
    renderWithProviders(
      <ErrorBoundary>
        <ThrowError shouldThrow={true} />
      </ErrorBoundary>
    );

    expect(screen.getByText('TEST-CORRELATION-ID')).toBeInTheDocument();
    expect(screen.getByText(/Please reference this ID when contacting support/)).toBeInTheDocument();
  });

  it('shows error details in development mode', () => {
    const originalEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = 'development';

    renderWithProviders(
      <ErrorBoundary>
        <ThrowError shouldThrow={true} />
      </ErrorBoundary>
    );

    // Look for the details element
    const detailsElement = screen.getByText('Error Details (Development Only)');
    expect(detailsElement).toBeInTheDocument();

    process.env.NODE_ENV = originalEnv;
  });

  it('provides refresh page button', () => {
    const reloadSpy = vi.fn();
    Object.defineProperty(window, 'location', {
      value: { reload: reloadSpy },
      writable: true,
    });

    renderWithProviders(
      <ErrorBoundary>
        <ThrowError shouldThrow={true} />
      </ErrorBoundary>
    );

    const refreshButton = screen.getByText('Refresh Page');
    fireEvent.click(refreshButton);

    expect(reloadSpy).toHaveBeenCalled();
  });

  it('provides try again button with retry limit', () => {
    let shouldThrow = true;
    const TestComponent = () => {
      if (shouldThrow) {
        throw new Error('Test error');
      }
      return <div>No error</div>;
    };

    renderWithProviders(
      <ErrorBoundary>
        <TestComponent />
      </ErrorBoundary>
    );

    // First error - should show retry button
    expect(screen.getByText(/Try Again.*3 left/)).toBeInTheDocument();

    // Click try again - this should reset the error boundary
    shouldThrow = false; // Stop throwing error
    const tryAgainButton = screen.getByText(/Try Again/);
    fireEvent.click(tryAgainButton);

    // Component should be reset and render normally
    expect(screen.getByText('No error')).toBeInTheDocument();
  });

  it('provides go to dashboard button', () => {
    const hrefSpy = vi.fn();
    Object.defineProperty(window, 'location', {
      value: { href: '' },
      writable: true,
    });

    renderWithProviders(
      <ErrorBoundary>
        <ThrowError shouldThrow={true} />
      </ErrorBoundary>
    );

    const goHomeButton = screen.getByText('Go to Dashboard');
    fireEvent.click(goHomeButton);

    // Should navigate to home
    expect(window.location.href).toBe('/');
  });

  it('shows support contact link', () => {
    renderWithProviders(
      <ErrorBoundary>
        <ThrowError shouldThrow={true} />
      </ErrorBoundary>
    );

    const contactLink = screen.getByText('contact support');
    expect(contactLink).toBeInTheDocument();
    expect(contactLink).toHaveAttribute('href', expect.stringContaining('mailto:support@neumanndevops.hu'));
    expect(contactLink).toHaveAttribute('href', expect.stringContaining('TEST-CORRELATION-ID'));
  });

  it('tracks error count for multiple errors', () => {
    const { rerender } = renderWithProviders(
      <ErrorBoundary>
        <ThrowError shouldThrow={true} />
      </ErrorBoundary>
    );

    // First error
    expect(screen.queryByText(/This error has occurred/)).not.toBeInTheDocument();

    // Reset and throw again
    const tryAgainButton = screen.getByText(/Try Again/);
    fireEvent.click(tryAgainButton);

    rerender(
      <FluentProvider theme={lightTheme}>
        <ErrorBoundary>
          <ThrowError shouldThrow={true} />
        </ErrorBoundary>
      </FluentProvider>
    );

    // Should show error count
    expect(screen.getByText(/This error has occurred 2 times in this session/)).toBeInTheDocument();
  });

  it('logs error to errorLoggingService', () => {
    renderWithProviders(
      <ErrorBoundary>
        <ThrowError shouldThrow={true} />
      </ErrorBoundary>
    );

    expect(errorLoggingService.logError).toHaveBeenCalledWith(
      expect.objectContaining({
        error: expect.any(Error),
        correlationId: 'TEST-CORRELATION-ID',
        metadata: expect.objectContaining({
          source: 'ErrorBoundary',
          retryCount: 0,
        }),
      })
    );
  });


  it('has proper accessibility attributes', () => {
    renderWithProviders(
      <ErrorBoundary>
        <ThrowError shouldThrow={true} />
      </ErrorBoundary>
    );

    const errorContainer = screen.getByRole('alert');
    expect(errorContainer).toBeInTheDocument();
    expect(errorContainer).toHaveAttribute('aria-live', 'assertive');

    // Correlation ID should be focusable
    const correlationId = screen.getByText('TEST-CORRELATION-ID');
    expect(correlationId).toHaveAttribute('tabIndex', '0');
    expect(correlationId).toHaveAttribute('aria-label', expect.stringContaining('Correlation ID'));
  });
});