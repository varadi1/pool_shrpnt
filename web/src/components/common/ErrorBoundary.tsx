import { Component } from 'react';
import type { ErrorInfo, ReactNode } from 'react';
import { 
  Button, 
  Card, 
  CardHeader, 
  Text, 
  Title3, 
  Caption1,
  Link,
  makeStyles,
  tokens 
} from '@fluentui/react-components';
import { 
  ErrorCircle48Regular,
  ArrowClockwise20Regular,
  Home20Regular,
  Bug20Regular 
} from '@fluentui/react-icons';
import { errorLoggingService } from '@/services/errorLogging.service';
import { showErrorToast } from '@/utils/errorHandler';

const useStyles = makeStyles({
  container: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: '100vh',
    padding: '20px',
  },
  card: {
    maxWidth: '600px',
    width: '100%',
    textAlign: 'center',
  },
  content: {
    padding: '20px',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: '16px',
  },
  icon: {
    color: '#D13438',
  },
  errorDetails: {
    marginTop: '16px',
    padding: '12px',
    backgroundColor: '#F3F2F1',
    borderRadius: '4px',
    fontFamily: 'monospace',
    fontSize: '12px',
    textAlign: 'left',
    maxHeight: '200px',
    overflow: 'auto',
    width: '100%',
  },
  correlationId: {
    marginTop: '8px',
    fontFamily: 'monospace',
    fontSize: '12px',
    userSelect: 'all',
    padding: '4px 8px',
    backgroundColor: tokens.colorNeutralBackground3,
    borderRadius: tokens.borderRadiusSmall,
  },
  buttonContainer: {
    display: 'flex',
    gap: '8px',
    justifyContent: 'center',
    flexWrap: 'wrap',
  },
  reportLink: {
    marginTop: '12px',
    fontSize: '12px',
  },
});

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error?: Error;
  errorInfo?: ErrorInfo;
  correlationId: string;
  errorCount: number;
}

class ErrorBoundaryClass extends Component<Props, State> {
  private retryCount = 0;
  private maxRetries = 3;

  constructor(props: Props) {
    super(props);
    this.state = {
      hasError: false,
      correlationId: '',
      errorCount: 0,
    };
  }

  static getDerivedStateFromError(error: Error): Partial<State> {
    const correlationId = errorLoggingService.generateCorrelationId();
    return { 
      hasError: true, 
      error,
      correlationId,
    };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    const { correlationId } = this.state;
    
    // Log error with full context
    errorLoggingService.logError({
      error,
      correlationId,
      componentStack: errorInfo.componentStack,
      metadata: {
        source: 'ErrorBoundary',
        retryCount: this.retryCount,
      },
    });

    // Update state with error info
    this.setState({ 
      errorInfo,
      errorCount: this.state.errorCount + 1,
    });

    // Show toast notification for non-critical errors
    if (this.state.errorCount === 1) {
      showErrorToast(
        'An unexpected error occurred. The page may not work correctly.',
        correlationId
      );
    }
  }

  handleReset = () => {
    this.retryCount++;
    
    if (this.retryCount > this.maxRetries) {
      // Too many retries, redirect to home
      window.location.href = '/';
      return;
    }

    this.setState({
      hasError: false,
      error: undefined,
      errorInfo: undefined,
      correlationId: errorLoggingService.generateCorrelationId(),
    });
  };

  handleGoHome = () => {
    window.location.href = '/';
  };

  render() {
    if (this.state.hasError) {
      return (
        <ErrorBoundaryContent 
          {...this.state} 
          onReset={this.handleReset}
          onGoHome={this.handleGoHome}
          retryCount={this.retryCount}
          maxRetries={this.maxRetries}
        />
      );
    }

    return this.props.children;
  }
}

interface ErrorBoundaryContentProps {
  error?: Error;
  errorInfo?: ErrorInfo;
  correlationId: string;
  errorCount: number;
  retryCount: number;
  maxRetries: number;
  onReset: () => void;
  onGoHome: () => void;
}

const ErrorBoundaryContent = ({ 
  error, 
  errorInfo, 
  correlationId, 
  errorCount,
  retryCount,
  maxRetries,
  onReset,
  onGoHome,
}: ErrorBoundaryContentProps) => {
  const styles = useStyles();
  const canRetry = retryCount < maxRetries;

  return (
    <div className={styles.container} role="alert" aria-live="assertive">
      <Card className={styles.card}>
        <CardHeader
          header={<Title3>Something went wrong</Title3>}
          description="An unexpected error occurred. Please try refreshing the page or contact support if the problem persists."
        />
        <div className={styles.content}>
          <ErrorCircle48Regular className={styles.icon} aria-hidden="true" />
          
          <Text>
            Please reference this ID when contacting support:
          </Text>
          <Text 
            className={styles.correlationId} 
            weight="semibold"
            aria-label={`Correlation ID: ${correlationId}`}
            tabIndex={0}
          >
            {correlationId}
          </Text>

          {process.env.NODE_ENV === 'development' && error && (
            <details className={styles.errorDetails}>
              <summary style={{ cursor: 'pointer', marginBottom: '8px' }}>
                <Bug20Regular style={{ verticalAlign: 'middle', marginRight: '4px' }} />
                Error Details (Development Only)
              </summary>
              <div>
                <strong>Message:</strong> {error.message}
              </div>
              {error.stack && (
                <pre style={{ fontSize: '11px', marginTop: '8px' }}>
                  {error.stack}
                </pre>
              )}
              {errorInfo && (
                <div style={{ marginTop: '8px' }}>
                  <strong>Component Stack:</strong>
                  <pre style={{ fontSize: '11px' }}>
                    {errorInfo.componentStack}
                  </pre>
                </div>
              )}
            </details>
          )}

          <div className={styles.buttonContainer}>
            <Button 
              appearance="primary" 
              icon={<ArrowClockwise20Regular />}
              onClick={() => window.location.reload()}
            >
              Refresh Page
            </Button>
            
            {canRetry && (
              <Button 
                appearance="outline" 
                onClick={onReset}
                title={`Retry attempt ${retryCount + 1} of ${maxRetries}`}
              >
                Try Again ({maxRetries - retryCount} left)
              </Button>
            )}
            
            <Button 
              appearance="subtle" 
              icon={<Home20Regular />}
              onClick={onGoHome}
            >
              Go to Dashboard
            </Button>
          </div>

          <Caption1 className={styles.reportLink}>
            If this problem persists, please{' '}
            <Link 
              href={`mailto:support@neumanndevops.hu?subject=Error%20Report%20${correlationId}`}
              inline
            >
              contact support
            </Link>{' '}
            with the correlation ID above.
          </Caption1>

          {errorCount > 1 && (
            <Caption1 style={{ marginTop: '8px', color: tokens.colorPaletteRedForeground1 }}>
              This error has occurred {errorCount} times in this session.
            </Caption1>
          )}
        </div>
      </Card>
    </div>
  );
};

export const ErrorBoundary = ErrorBoundaryClass;