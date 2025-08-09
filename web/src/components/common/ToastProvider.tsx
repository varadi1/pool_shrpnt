import { ReactNode, useCallback, useId } from 'react';
import {
  Toaster,
  useToastController,
  Toast,
  ToastTitle,
  ToastBody,
  ToastFooter,
  ToastIntent,
  Link,
} from '@fluentui/react-components';
import {
  DismissRegular,
  CheckmarkCircle20Regular,
  ErrorCircle20Regular,
  Warning20Regular,
  Info20Regular,
} from '@fluentui/react-icons';
import { initializeErrorHandler } from '@/utils/errorHandler';

interface ToastProviderProps {
  children: ReactNode;
}

export const ToastProvider = ({ children }: ToastProviderProps) => {
  const toasterId = useId('toaster');
  const { dispatchToast } = useToastController(toasterId);

  const showToast = useCallback(
    (message: string, correlationId?: string, intent: ToastIntent = 'error') => {
      const toastId = `toast-${Date.now()}`;
      
      dispatchToast(
        <Toast appearance="inverted">
          <ToastTitle 
            media={getToastIcon(intent)}
            action={
              <Link onClick={() => dispatchToast('', { toastId, remove: true })}>
                <DismissRegular />
              </Link>
            }
          >
            {getToastTitle(intent)}
          </ToastTitle>
          <ToastBody>{message}</ToastBody>
          {correlationId && (
            <ToastFooter>
              <span style={{ fontSize: '11px', fontFamily: 'monospace' }}>
                ID: {correlationId}
              </span>
            </ToastFooter>
          )}
        </Toast>,
        {
          toastId,
          intent,
          timeout: intent === 'error' ? 10000 : 5000, // Errors stay longer
          position: 'top-end',
        }
      );
    },
    [dispatchToast]
  );

  // Initialize error handler with toast function
  React.useEffect(() => {
    initializeErrorHandler(showToast);
  }, [showToast]);

  return (
    <>
      <Toaster
        toasterId={toasterId}
        position="top-end"
        pauseOnHover
        pauseOnWindowBlur
        limit={5}
      />
      {children}
    </>
  );
};

// Helper function to get icon based on intent
function getToastIcon(intent: ToastIntent): ReactNode {
  switch (intent) {
    case 'success':
      return <CheckmarkCircle20Regular primaryFill="green" />;
    case 'error':
      return <ErrorCircle20Regular primaryFill="red" />;
    case 'warning':
      return <Warning20Regular primaryFill="orange" />;
    case 'info':
    default:
      return <Info20Regular primaryFill="blue" />;
  }
}

// Helper function to get title based on intent
function getToastTitle(intent: ToastIntent): string {
  switch (intent) {
    case 'success':
      return 'Success';
    case 'error':
      return 'Error';
    case 'warning':
      return 'Warning';
    case 'info':
    default:
      return 'Information';
  }
}

// Export a hook for manual toast usage
export const useToast = () => {
  const toasterId = useId('toaster');
  const { dispatchToast } = useToastController(toasterId);

  const showToast = useCallback(
    (
      message: string,
      options?: {
        title?: string;
        intent?: ToastIntent;
        correlationId?: string;
        timeout?: number;
        action?: ReactNode;
      }
    ) => {
      const toastId = `toast-${Date.now()}`;
      const intent = options?.intent || 'info';
      
      dispatchToast(
        <Toast appearance="inverted">
          <ToastTitle 
            media={getToastIcon(intent)}
            action={
              options?.action || (
                <Link onClick={() => dispatchToast('', { toastId, remove: true })}>
                  <DismissRegular />
                </Link>
              )
            }
          >
            {options?.title || getToastTitle(intent)}
          </ToastTitle>
          <ToastBody>{message}</ToastBody>
          {options?.correlationId && (
            <ToastFooter>
              <span style={{ fontSize: '11px', fontFamily: 'monospace' }}>
                ID: {options.correlationId}
              </span>
            </ToastFooter>
          )}
        </Toast>,
        {
          toastId,
          intent,
          timeout: options?.timeout || (intent === 'error' ? 10000 : 5000),
          position: 'top-end',
        }
      );
    },
    [dispatchToast]
  );

  return {
    showToast,
    showSuccess: (message: string) => showToast(message, { intent: 'success' }),
    showError: (message: string, correlationId?: string) => 
      showToast(message, { intent: 'error', correlationId }),
    showWarning: (message: string) => showToast(message, { intent: 'warning' }),
    showInfo: (message: string) => showToast(message, { intent: 'info' }),
  };
};

// Import React for useEffect
import * as React from 'react';