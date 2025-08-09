import { Navigate } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import type { UserRole } from '@/hooks/useAuth';
import { Spinner, MessageBar, MessageBarBody } from '@fluentui/react-components';

interface ProtectedRouteProps {
  children: React.ReactNode;
  requiredRoles?: UserRole[];
  requireAny?: boolean; // If true, user needs ANY of the roles. If false, needs ALL roles.
}

export const ProtectedRoute = ({ 
  children, 
  requiredRoles = [], 
  requireAny = true 
}: ProtectedRouteProps) => {
  const { isAuthenticated, isLoading, hasRole, hasAnyRole } = useAuth();

  if (isLoading) {
    return (
      <div
        style={{
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'center',
          height: '100vh',
        }}
      >
        <Spinner label="Authenticating..." size="large" />
      </div>
    );
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }
  
  // Check role-based access if roles are specified
  if (requiredRoles.length > 0) {
    const hasAccess = requireAny 
      ? hasAnyRole(requiredRoles)
      : requiredRoles.every(role => hasRole(role));
      
    if (!hasAccess) {
      return (
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'center',
            alignItems: 'center',
            height: '100vh',
            gap: '20px',
          }}
        >
          <MessageBar intent="error">
            <MessageBarBody>
              Access Denied: You do not have the required permissions to view this page.
            </MessageBarBody>
          </MessageBar>
          <Navigate to="/dashboard" replace />
        </div>
      );
    }
  }

  return <>{children}</>;
};
