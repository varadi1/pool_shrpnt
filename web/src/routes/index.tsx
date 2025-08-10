import { createBrowserRouter, Navigate } from 'react-router-dom';
import { MainLayout } from '@/components/layout/MainLayout';
import { ProtectedRoute } from '@/components/auth/ProtectedRoute';
import { Dashboard } from '@/pages/Dashboard';
import { Login } from '@/pages/Login';
import { Contracts } from '@/pages/Contracts';
import { Orders } from '@/pages/Orders';
import { NewOrder } from '@/pages/orders/NewOrder';
import { Templates } from '@/pages/Templates';
import { TemplateEditor } from '@/pages/templates/TemplateEditor';
import { Locks } from '@/pages/Locks';
import { Settings } from '@/pages/Settings';
import { Guests } from '@/pages/Guests';
import { PermissionsList } from '@/pages/permissions/PermissionsList';
import { PermissionMatrix } from '@/pages/permissions/PermissionMatrix';
import { AuditList } from '@/pages/audit/AuditList';

// Placeholder components for routes not yet implemented
const Users = () => <div>Felhasználók és Csoportok (Hamarosan)</div>;
const Reports = () => <div>Jelentések (Hamarosan)</div>;

export const router = createBrowserRouter([
  {
    path: '/login',
    element: <Login />,
  },
  {
    path: '/auth/callback',
    element: <Login />,
  },
  {
    path: '/',
    element: (
      <ProtectedRoute>
        <MainLayout />
      </ProtectedRoute>
    ),
    children: [
      {
        index: true,
        element: <Navigate to="/dashboard" replace />,
      },
      {
        path: '/dashboard',
        element: <Dashboard />,
      },
      {
        path: '/contracts',
        element: (
          <ProtectedRoute requiredRoles={['NEU_Admin', 'NEU_PM']} requireAny={true}>
            <Contracts />
          </ProtectedRoute>
        ),
      },
      {
        path: '/orders',
        element: (
          <ProtectedRoute requiredRoles={['NEU_Admin', 'NEU_PM']} requireAny={true}>
            <Orders />
          </ProtectedRoute>
        ),
      },
      {
        path: '/orders/new',
        element: (
          <ProtectedRoute requiredRoles={['NEU_Admin', 'NEU_PM']} requireAny={true}>
            <NewOrder />
          </ProtectedRoute>
        ),
      },
      {
        path: '/templates',
        element: (
          <ProtectedRoute requiredRoles={['NEU_Admin']}>
            <Templates />
          </ProtectedRoute>
        ),
      },
      {
        path: '/templates/new',
        element: (
          <ProtectedRoute requiredRoles={['NEU_Admin']}>
            <TemplateEditor />
          </ProtectedRoute>
        ),
      },
      {
        path: '/templates/:id',
        element: (
          <ProtectedRoute requiredRoles={['NEU_Admin']}>
            <Templates />
          </ProtectedRoute>
        ),
      },
      {
        path: '/templates/:id/edit',
        element: (
          <ProtectedRoute requiredRoles={['NEU_Admin']}>
            <TemplateEditor />
          </ProtectedRoute>
        ),
      },
      {
        path: '/templates/:id/clone',
        element: (
          <ProtectedRoute requiredRoles={['NEU_Admin']}>
            <TemplateEditor />
          </ProtectedRoute>
        ),
      },
      {
        path: '/locks',
        element: (
          <ProtectedRoute requiredRoles={['NEU_Admin', 'NEU_PM']} requireAny={true}>
            <Locks />
          </ProtectedRoute>
        ),
      },
      {
        path: '/users',
        element: (
          <ProtectedRoute requiredRoles={['NEU_Admin']}>
            <Users />
          </ProtectedRoute>
        ),
      },
      {
        path: '/permissions',
        element: (
          <ProtectedRoute requiredRoles={['NEU_Admin', 'NEU_PM']} requireAny={true}>
            <PermissionsList />
          </ProtectedRoute>
        ),
      },
      {
        path: '/permissions/:orderId',
        element: (
          <ProtectedRoute requiredRoles={['NEU_Admin', 'NEU_PM']} requireAny={true}>
            <PermissionMatrix />
          </ProtectedRoute>
        ),
      },
      {
        path: '/guests',
        element: (
          <ProtectedRoute requiredRoles={['NEU_Admin', 'NEU_PM']} requireAny={true}>
            <Guests />
          </ProtectedRoute>
        ),
      },
      {
        path: '/reports',
        element: (
          <ProtectedRoute requiredRoles={['NEU_Admin', 'NEU_PM']} requireAny={true}>
            <Reports />
          </ProtectedRoute>
        ),
      },
      {
        path: '/audit',
        element: (
          <ProtectedRoute requiredRoles={['NEU_Admin', 'NEU_PM']} requireAny={true}>
            <AuditList />
          </ProtectedRoute>
        ),
      },
      {
        path: '/settings',
        element: <Settings />,
      },
    ],
  },
]);
