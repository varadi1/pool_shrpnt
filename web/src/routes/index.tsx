import { createBrowserRouter, Navigate } from 'react-router-dom';
import { MainLayout } from '@/components/layout/MainLayout';
import { ProtectedRoute } from '@/components/auth/ProtectedRoute';
import { Dashboard } from '@/pages/Dashboard';
import { Login } from '@/pages/Login';
import { Contracts } from '@/pages/Contracts';
import { Orders } from '@/pages/Orders';
import { Templates } from '@/pages/Templates';
import { Locks } from '@/pages/Locks';
import { Settings } from '@/pages/Settings';

// Placeholder components for routes not yet implemented
const Users = () => <div>Users & Groups Page (Coming Soon)</div>;
const Permissions = () => <div>Permissions Page (Coming Soon)</div>;
const Guests = () => <div>Guest Management Page (Coming Soon)</div>;
const Reports = () => <div>Reports Page (Coming Soon)</div>;
const Audit = () => <div>Audit Page (Coming Soon)</div>;

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
        path: '/templates',
        element: (
          <ProtectedRoute requiredRoles={['NEU_Admin']}>
            <Templates />
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
          <ProtectedRoute requiredRoles={['NEU_Admin']}>
            <Permissions />
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
          <ProtectedRoute requiredRoles={['NEU_Admin']}>
            <Audit />
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
