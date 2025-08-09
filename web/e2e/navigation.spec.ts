import { test, expect } from '@playwright/test';

test.describe('Navigation and Role-Based Access', () => {
  test('should show admin navigation items for admin users', async ({ page }) => {
    // Mock admin authentication
    await page.addInitScript(() => {
      window.sessionStorage.setItem('mock-account', JSON.stringify({
        username: 'admin@example.com',
        name: 'Admin User',
        idTokenClaims: {
          roles: ['NEU_Admin']
        }
      }));
    });

    await page.goto('/dashboard');
    
    // Admin should see all navigation items
    const nav = page.locator('nav[role="navigation"]');
    await expect(nav.locator('text=Dashboard')).toBeVisible();
    await expect(nav.locator('text=Contracts')).toBeVisible();
    await expect(nav.locator('text=Orders')).toBeVisible();
    await expect(nav.locator('text=Templates')).toBeVisible();
    await expect(nav.locator('text=Locks')).toBeVisible();
    await expect(nav.locator('text=Users & Groups')).toBeVisible();
    await expect(nav.locator('text=Permissions')).toBeVisible();
    await expect(nav.locator('text=Guest Management')).toBeVisible();
    await expect(nav.locator('text=Reports')).toBeVisible();
    await expect(nav.locator('text=Audit')).toBeVisible();
    await expect(nav.locator('text=Settings')).toBeVisible();
  });

  test('should show limited navigation items for PM users', async ({ page }) => {
    // Mock PM authentication
    await page.addInitScript(() => {
      window.sessionStorage.setItem('mock-account', JSON.stringify({
        username: 'pm@example.com',
        name: 'PM User',
        idTokenClaims: {
          roles: ['NEU_PM']
        }
      }));
    });

    await page.goto('/dashboard');
    
    const nav = page.locator('nav[role="navigation"]');
    
    // PM should see limited items
    await expect(nav.locator('text=Dashboard')).toBeVisible();
    await expect(nav.locator('text=Contracts')).toBeVisible();
    await expect(nav.locator('text=Orders')).toBeVisible();
    await expect(nav.locator('text=Locks')).toBeVisible();
    await expect(nav.locator('text=Guest Management')).toBeVisible();
    await expect(nav.locator('text=Reports')).toBeVisible();
    await expect(nav.locator('text=Settings')).toBeVisible();
    
    // PM should NOT see admin-only items
    await expect(nav.locator('text=Templates')).not.toBeVisible();
    await expect(nav.locator('text=Users & Groups')).not.toBeVisible();
    await expect(nav.locator('text=Permissions')).not.toBeVisible();
    await expect(nav.locator('text=Audit')).not.toBeVisible();
  });

  test('should navigate between pages correctly', async ({ page }) => {
    // Mock authentication
    await page.addInitScript(() => {
      window.sessionStorage.setItem('mock-account', JSON.stringify({
        username: 'admin@example.com',
        name: 'Admin User',
        idTokenClaims: {
          roles: ['NEU_Admin']
        }
      }));
    });

    await page.goto('/dashboard');
    
    // Navigate to Contracts
    await page.click('nav a:has-text("Contracts")');
    await expect(page).toHaveURL('/contracts');
    await expect(page.locator('nav a:has-text("Contracts")')).toHaveAttribute('aria-current', 'page');
    
    // Navigate to Orders
    await page.click('nav a:has-text("Orders")');
    await expect(page).toHaveURL('/orders');
    await expect(page.locator('nav a:has-text("Orders")')).toHaveAttribute('aria-current', 'page');
    
    // Navigate back to Dashboard
    await page.click('nav a:has-text("Dashboard")');
    await expect(page).toHaveURL('/dashboard');
    await expect(page.locator('nav a:has-text("Dashboard")')).toHaveAttribute('aria-current', 'page');
  });

  test('should block access to unauthorized routes', async ({ page }) => {
    // Mock PM authentication (limited access)
    await page.addInitScript(() => {
      window.sessionStorage.setItem('mock-account', JSON.stringify({
        username: 'pm@example.com',
        name: 'PM User',
        idTokenClaims: {
          roles: ['NEU_PM']
        }
      }));
    });

    // Try to access admin-only route
    await page.goto('/templates');
    
    // Should redirect to unauthorized or dashboard
    await expect(page).not.toHaveURL('/templates');
    await expect(page.locator('text=Unauthorized')).toBeVisible();
  });

  test('should handle navigation on mobile', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 667 });
    
    // Mock authentication
    await page.addInitScript(() => {
      window.sessionStorage.setItem('mock-account', JSON.stringify({
        username: 'admin@example.com',
        name: 'Admin User',
        idTokenClaims: {
          roles: ['NEU_Admin']
        }
      }));
    });

    await page.goto('/dashboard');
    
    // Navigation should be hidden initially
    const nav = page.locator('nav[role="navigation"]');
    await expect(nav).not.toBeVisible();
    
    // Open navigation menu
    const menuButton = page.locator('button[aria-label="Open navigation menu"]');
    await menuButton.click();
    
    // Navigation should be visible
    await expect(nav).toBeVisible();
    
    // Click on a navigation item
    await page.click('nav a:has-text("Orders")');
    
    // Navigation should close automatically
    await expect(nav).not.toBeVisible();
    
    // Should navigate to Orders page
    await expect(page).toHaveURL('/orders');
  });

  test('should support keyboard navigation', async ({ page }) => {
    // Mock authentication
    await page.addInitScript(() => {
      window.sessionStorage.setItem('mock-account', JSON.stringify({
        username: 'admin@example.com',
        name: 'Admin User',
        idTokenClaims: {
          roles: ['NEU_Admin']
        }
      }));
    });

    await page.goto('/dashboard');
    
    // Focus on first navigation item
    await page.keyboard.press('Tab');
    await page.keyboard.press('Tab');
    
    // Navigate with arrow keys
    await page.keyboard.press('ArrowDown');
    await page.keyboard.press('ArrowDown');
    
    // Activate with Enter
    await page.keyboard.press('Enter');
    
    // Should navigate to the selected page
    const url = page.url();
    expect(url).toMatch(/\/(contracts|orders|templates)/);
  });

  test('should highlight active navigation item', async ({ page }) => {
    // Mock authentication
    await page.addInitScript(() => {
      window.sessionStorage.setItem('mock-account', JSON.stringify({
        username: 'admin@example.com',
        name: 'Admin User',
        idTokenClaims: {
          roles: ['NEU_Admin']
        }
      }));
    });

    await page.goto('/dashboard');
    
    // Dashboard should be active
    const dashboardLink = page.locator('nav a:has-text("Dashboard")');
    await expect(dashboardLink).toHaveAttribute('aria-current', 'page');
    
    // Navigate to Orders
    await page.click('nav a:has-text("Orders")');
    
    // Orders should now be active
    const ordersLink = page.locator('nav a:has-text("Orders")');
    await expect(ordersLink).toHaveAttribute('aria-current', 'page');
    
    // Dashboard should no longer be active
    await expect(dashboardLink).not.toHaveAttribute('aria-current', 'page');
  });

  test('should show skip navigation link', async ({ page }) => {
    // Mock authentication
    await page.addInitScript(() => {
      window.sessionStorage.setItem('mock-account', JSON.stringify({
        username: 'admin@example.com',
        name: 'Admin User',
        idTokenClaims: {
          roles: ['NEU_Admin']
        }
      }));
    });

    await page.goto('/dashboard');
    
    // Focus on skip link (first focusable element)
    await page.keyboard.press('Tab');
    
    // Skip link should be visible when focused
    const skipLink = page.locator('a:has-text("Skip to main content")');
    await expect(skipLink).toBeFocused();
    
    // Activate skip link
    await page.keyboard.press('Enter');
    
    // Main content should be focused
    const mainContent = page.locator('#main-content');
    await expect(mainContent).toBeFocused();
  });
});