import { NavLink, useLocation } from 'react-router-dom';
import { makeStyles, tokens, mergeClasses } from '@fluentui/react-components';
import { useAuth } from '@/hooks/useAuth';
import type { UserRole } from '@/hooks/useAuth';
import {
  Home24Regular,
  Document24Regular,
  ShoppingBag24Regular,
  DocumentTable24Regular,
  LockClosed24Regular,
  Settings24Regular,
  People24Regular,
  Shield24Regular,
  DocumentBulletList24Regular,
  ClipboardPulse24Regular,
  PersonAdd24Regular,
} from '@fluentui/react-icons';

interface NavItem {
  to: string;
  label: string;
  icon: React.ReactElement;
  requiredRoles?: UserRole[];
  requireAny?: boolean;
}

const useStyles = makeStyles({
  nav: {
    padding: '20px 0',
    display: 'flex',
    flexDirection: 'column',
    gap: '4px',
  },
  navItem: {
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
    padding: '10px 20px',
    textDecoration: 'none',
    color: tokens.colorNeutralForeground1,
    borderRadius: tokens.borderRadiusMedium,
    marginLeft: '8px',
    marginRight: '8px',
    transition: 'all 0.2s ease',
    ':hover': {
      backgroundColor: tokens.colorNeutralBackground1Hover,
    },
    ':focus': {
      outline: `2px solid ${tokens.colorBrandForeground1}`,
      outlineOffset: '-2px',
    },
    ':focus:not(:focus-visible)': {
      outline: 'none',
    },
  },
  activeNavItem: {
    backgroundColor: tokens.colorBrandBackground,
    color: tokens.colorNeutralForegroundOnBrand,
    ':hover': {
      backgroundColor: tokens.colorBrandBackgroundHover,
    },
  },
  navSection: {
    marginTop: '20px',
    paddingTop: '20px',
    borderTop: `1px solid ${tokens.colorNeutralStroke2}`,
  },
  sectionTitle: {
    padding: '5px 20px',
    fontSize: tokens.fontSizeBase200,
    fontWeight: tokens.fontWeightSemibold,
    color: tokens.colorNeutralForeground3,
    textTransform: 'uppercase',
    letterSpacing: '0.5px',
  },
});

export const Navigation = () => {
  const styles = useStyles();
  const location = useLocation();
  const { hasAnyRole, isAdmin } = useAuth();

  // Define navigation structure with role-based access
  const navItems: NavItem[] = [
    {
      to: '/dashboard',
      label: 'Dashboard',
      icon: <Home24Regular />,
    },
    {
      to: '/contracts',
      label: 'Contracts',
      icon: <Document24Regular />,
      requiredRoles: ['NEU_Admin', 'NEU_PM'],
      requireAny: true,
    },
    {
      to: '/orders',
      label: 'Orders',
      icon: <ShoppingBag24Regular />,
      requiredRoles: ['NEU_Admin', 'NEU_PM'],
      requireAny: true,
    },
    {
      to: '/templates',
      label: 'Templates',
      icon: <DocumentTable24Regular />,
      requiredRoles: ['NEU_Admin'],
    },
    {
      to: '/locks',
      label: 'Locks',
      icon: <LockClosed24Regular />,
      requiredRoles: ['NEU_Admin', 'NEU_PM'],
      requireAny: true,
    },
  ];

  const adminItems: NavItem[] = [
    {
      to: '/users',
      label: 'Users & Groups',
      icon: <People24Regular />,
      requiredRoles: ['NEU_Admin'],
    },
    {
      to: '/permissions',
      label: 'Permissions',
      icon: <Shield24Regular />,
      requiredRoles: ['NEU_Admin'],
    },
    {
      to: '/guests',
      label: 'Guest Management',
      icon: <PersonAdd24Regular />,
      requiredRoles: ['NEU_Admin', 'NEU_PM'],
      requireAny: true,
    },
  ];

  const systemItems: NavItem[] = [
    {
      to: '/reports',
      label: 'Reports',
      icon: <DocumentBulletList24Regular />,
      requiredRoles: ['NEU_Admin', 'NEU_PM'],
      requireAny: true,
    },
    {
      to: '/audit',
      label: 'Audit',
      icon: <ClipboardPulse24Regular />,
      requiredRoles: ['NEU_Admin'],
    },
    {
      to: '/settings',
      label: 'Settings',
      icon: <Settings24Regular />,
    },
  ];

  // Filter items based on user roles
  const filterByRole = (items: NavItem[]) => {
    return items.filter(item => {
      if (!item.requiredRoles || item.requiredRoles.length === 0) {
        return true;
      }
      return hasAnyRole(item.requiredRoles);
    });
  };

  const visibleNavItems = filterByRole(navItems);
  const visibleAdminItems = filterByRole(adminItems);
  const visibleSystemItems = filterByRole(systemItems);

  const renderNavItem = (item: NavItem) => {
    const isActive = location.pathname === item.to || 
                    (item.to !== '/dashboard' && location.pathname.startsWith(item.to));
    
    return (
      <NavLink
        key={item.to}
        to={item.to}
        className={mergeClasses(
          styles.navItem,
          isActive && styles.activeNavItem
        )}
        aria-current={isActive ? 'page' : undefined}
        tabIndex={0}
      >
        {item.icon}
        <span>{item.label}</span>
      </NavLink>
    );
  };

  return (
    <nav className={styles.nav} role="navigation" aria-label="Main navigation" id="main-navigation">
      {visibleNavItems.map(renderNavItem)}
      
      {visibleAdminItems.length > 0 && (
        <div className={styles.navSection}>
          <div className={styles.sectionTitle} role="heading" aria-level={3}>
            Administration
          </div>
          {visibleAdminItems.map(renderNavItem)}
        </div>
      )}
      
      {visibleSystemItems.length > 0 && (
        <div className={styles.navSection}>
          <div className={styles.sectionTitle} role="heading" aria-level={3}>
            System
          </div>
          {visibleSystemItems.map(renderNavItem)}
        </div>
      )}
    </nav>
  );
};
