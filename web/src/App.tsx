import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { RouterProvider } from 'react-router-dom';
import { FluentProvider } from '@fluentui/react-components';
import { AuthProvider } from '@/components/auth/AuthProvider';
import { router } from '@/routes';
import { lightTheme, globalCss } from '@/config/theme.config';
import { ErrorBoundary } from '@/components/common/ErrorBoundary';
import { AuthDebugPanel } from '@/components/debug/AuthDebugPanel';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 3,
      retryDelay: (attemptIndex) => Math.min(1000 * 2 ** attemptIndex, 30000),
      staleTime: 60000,
      gcTime: 300000,
    },
  },
});

function App() {
  return (
    <ErrorBoundary>
      <AuthProvider>
        <FluentProvider theme={lightTheme}>
          <style>{globalCss}</style>
          <QueryClientProvider client={queryClient}>
            <RouterProvider router={router} />
            {import.meta.env.DEV && <AuthDebugPanel />}
          </QueryClientProvider>
        </FluentProvider>
      </AuthProvider>
    </ErrorBoundary>
  );
}

export default App;
