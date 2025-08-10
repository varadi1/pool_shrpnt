import { Component, ErrorInfo, ReactNode } from 'react';
import {
  MessageBar,
  Button,
  makeStyles,
  tokens,
  Title2,
  Text,
} from '@fluentui/react-components';
import {
  ArrowSync20Regular,
  Warning24Regular,
} from '@fluentui/react-icons';

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
  errorInfo: ErrorInfo | null;
  errorCount: number;
}

const useStyles = makeStyles({
  container: {
    padding: tokens.spacingVerticalXXL,
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: '400px',
    gap: tokens.spacingVerticalL,
  },
  errorHeader: {
    display: 'flex',
    alignItems: 'center',
    gap: tokens.spacingHorizontalM,
    color: tokens.colorPaletteRedForeground1,
  },
  errorDetails: {
    marginTop: tokens.spacingVerticalM,
    padding: tokens.spacingVerticalM,
    backgroundColor: tokens.colorNeutralBackground2,
    borderRadius: tokens.borderRadiusMedium,
    maxWidth: '600px',
    width: '100%',
  },
  errorStack: {
    fontFamily: 'monospace',
    fontSize: tokens.fontSizeBase200,
    color: tokens.colorNeutralForeground3,
    whiteSpace: 'pre-wrap',
    wordBreak: 'break-word',
    maxHeight: '200px',
    overflow: 'auto',
  },
  actions: {
    display: 'flex',
    gap: tokens.spacingHorizontalM,
    marginTop: tokens.spacingVerticalL,
  },
});

export class ContractErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = {
      hasError: false,
      error: null,
      errorInfo: null,
      errorCount: 0,
    };
  }

  static getDerivedStateFromError(error: Error): Partial<State> {
    // Update state so the next render will show the fallback UI
    return {
      hasError: true,
      error,
    };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    // Log the error to an error reporting service
    console.error('Contract page error:', error, errorInfo);
    
    // You can also log to your monitoring service here
    // Example: errorLoggingService.logError(error, errorInfo);
    
    this.setState(prevState => ({
      errorInfo,
      errorCount: prevState.errorCount + 1,
    }));

    // If there's a correlation ID in the error, log it
    const correlationId = (error as any)?.correlationId;
    if (correlationId) {
      console.error('Correlation ID:', correlationId);
    }
  }

  handleReset = () => {
    this.setState({
      hasError: false,
      error: null,
      errorInfo: null,
    });
  };

  handleReload = () => {
    window.location.reload();
  };

  render() {
    const { hasError, error, errorInfo, errorCount } = this.state;
    const { children, fallback } = this.props;

    if (hasError && error) {
      // Custom fallback UI if provided
      if (fallback) {
        return <>{fallback}</>;
      }

      // Default error UI
      return <ErrorFallback 
        error={error} 
        errorInfo={errorInfo}
        errorCount={errorCount}
        onReset={this.handleReset}
        onReload={this.handleReload}
      />;
    }

    return children;
  }
}

interface ErrorFallbackProps {
  error: Error;
  errorInfo: ErrorInfo | null;
  errorCount: number;
  onReset: () => void;
  onReload: () => void;
}

const ErrorFallback: React.FC<ErrorFallbackProps> = ({ 
  error, 
  errorInfo, 
  errorCount,
  onReset, 
  onReload 
}) => {
  const styles = useStyles();
  const isDevelopment = import.meta.env.DEV;
  const correlationId = (error as any)?.correlationId;

  return (
    <div className={styles.container}>
      <div className={styles.errorHeader}>
        <Warning24Regular />
        <Title2>Something went wrong</Title2>
      </div>

      <MessageBar
        intent="error"
        style={{ maxWidth: '600px' }}
      >
        <strong>Unable to load contracts</strong>
        <br />
        {error.message || 'An unexpected error occurred while loading the contracts page.'}
        {correlationId && (
          <>
            <br />
            <small>Reference: {correlationId}</small>
          </>
        )}
      </MessageBar>

      {errorCount > 2 && (
        <MessageBar
          intent="warning"
          style={{ maxWidth: '600px' }}
        >
          This error has occurred {errorCount} times. If the problem persists, please contact support.
        </MessageBar>
      )}

      {isDevelopment && errorInfo && (
        <div className={styles.errorDetails}>
          <Text weight="semibold">Error Details (Development Only)</Text>
          <pre className={styles.errorStack}>
            {error.stack}
            {'\n\nComponent Stack:'}
            {errorInfo.componentStack}
          </pre>
        </div>
      )}

      <div className={styles.actions}>
        <Button
          appearance="primary"
          icon={<ArrowSync20Regular />}
          onClick={onReset}
        >
          Try Again
        </Button>
        <Button
          appearance="secondary"
          onClick={onReload}
        >
          Reload Page
        </Button>
      </div>
    </div>
  );
};

// Higher-order component for wrapping components with error boundary
export const withContractErrorBoundary = <P extends object>(
  Component: React.ComponentType<P>,
  fallback?: ReactNode
) => {
  return (props: P) => (
    <ContractErrorBoundary fallback={fallback}>
      <Component {...props} />
    </ContractErrorBoundary>
  );
};