import { Outlet } from 'react-router-dom';
import { makeStyles, tokens, Button } from '@fluentui/react-components';
import { Navigation } from './Navigation';
import { UserProfile } from './UserProfile';
import { useState } from 'react';
import { Navigation20Regular, Dismiss20Regular } from '@fluentui/react-icons';
import { SkipNavigation } from '@/components/common/SkipNavigation';

const useStyles = makeStyles({
  root: {
    display: 'flex',
    height: '100vh',
    width: '100vw',
  },
  sidebar: {
    width: '240px',
    backgroundColor: tokens.colorNeutralBackground2,
    borderRight: `1px solid ${tokens.colorNeutralStroke1}`,
    transition: 'transform 0.3s ease',
    '@media (max-width: 1024px)': {
      position: 'fixed',
      left: 0,
      top: 0,
      height: '100vh',
      zIndex: 1000,
    },
  },
  sidebarHidden: {
    transform: 'translateX(-100%)',
  },
  main: {
    flex: 1,
    display: 'flex',
    flexDirection: 'column',
  },
  header: {
    height: '64px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '0 20px',
    backgroundColor: tokens.colorNeutralBackground1,
    borderBottom: `1px solid ${tokens.colorNeutralStroke1}`,
  },
  content: {
    flex: 1,
    padding: '20px',
    overflow: 'auto',
    '@media (max-width: 768px)': {
      padding: '12px',
    },
  },
  menuButton: {
    display: 'none',
    '@media (max-width: 1024px)': {
      display: 'block',
    },
  },
  overlay: {
    display: 'none',
    '@media (max-width: 1024px)': {
      display: 'block',
      position: 'fixed',
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      backgroundColor: 'rgba(0, 0, 0, 0.5)',
      zIndex: 999,
    },
  },
  headerLeft: {
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
  },
  closeButton: {
    display: 'none',
    '@media (max-width: 1024px)': {
      display: 'flex',
      position: 'absolute',
      top: '16px',
      right: '16px',
      zIndex: 1001,
    },
  },
});

export const MainLayout = () => {
  const styles = useStyles();
  const [sidebarOpen, setSidebarOpen] = useState(true);

  return (
    <>
      <SkipNavigation />
      <div className={styles.root}>
        {sidebarOpen && (
          <div 
            className={styles.overlay} 
            onClick={() => setSidebarOpen(false)}
            aria-hidden="true"
            role="presentation"
          />
        )}
        <aside 
          className={`${styles.sidebar} ${!sidebarOpen ? styles.sidebarHidden : ''}`}
          aria-label="Main navigation"
        >
          <Button
            className={styles.closeButton}
            icon={<Dismiss20Regular />}
            appearance="subtle"
            onClick={() => setSidebarOpen(false)}
            aria-label="Close navigation menu"
          />
          <Navigation />
        </aside>
        <div className={styles.main}>
          <header className={styles.header} role="banner">
            <div className={styles.headerLeft}>
              <Button
                className={styles.menuButton}
                icon={<Navigation20Regular />}
                appearance="subtle"
                onClick={() => setSidebarOpen(true)}
                aria-label="Open navigation menu"
                aria-expanded={sidebarOpen}
                aria-controls="main-navigation"
              />
              <h1>poolDRV</h1>
            </div>
            <UserProfile />
          </header>
          <main 
            className={styles.content} 
            id="main-content" 
            tabIndex={-1}
            role="main"
            aria-label="Main content"
          >
            <Outlet />
          </main>
        </div>
      </div>
    </>
  );
};
