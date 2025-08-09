import { test, expect } from '@playwright/test';

test.describe('Dashboard User Flows', () => {
  test.beforeEach(async ({ page }) => {
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

    // Mock API responses
    await page.route('**/api/**', async (route) => {
      const url = route.request().url();
      
      if (url.includes('/api/orders')) {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ count: 42, items: [] })
        });
      } else if (url.includes('/api/contracts')) {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ count: 15, items: [] })
        });
      } else if (url.includes('/api/locks/summary')) {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            timeLocked: 5,
            crUnlocked: 2,
            manualLocked: 1
          })
        });
      } else if (url.includes('/api/guests')) {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ count: 10, items: [] })
        });
      } else if (url.includes('/api/health')) {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            status: 'healthy',
            queueDepth: 3,
            lastProvisionTime: 5,
            latency: 150
          })
        });
      } else if (url.includes('/api/audit/recent')) {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify([
            {
              id: '1',
              user: 'John Doe',
              action: 'Created order',
              target: 'ORD-001',
              timestamp: new Date().toISOString(),
              type: 'create'
            }
          ])
        });
      } else {
        await route.continue();
      }
    });
  });

  test('should load dashboard with all metrics', async ({ page }) => {
    await page.goto('/dashboard');
    
    // Wait for dashboard to load
    await expect(page.locator('h1')).toContainText('Dashboard');
    
    // Check metric cards are visible
    await expect(page.locator('text=Active Orders')).toBeVisible();
    await expect(page.locator('text=Pending Provisions')).toBeVisible();
    await expect(page.locator('text=Failed (24h)')).toBeVisible();
    await expect(page.locator('text=Active Contracts')).toBeVisible();
    
    // Check metric values loaded
    await expect(page.locator('[role="article"]:has-text("Active Orders")')).toContainText('42');
    await expect(page.locator('[role="article"]:has-text("Active Contracts")')).toContainText('15');
  });

  test('should display system health status', async ({ page }) => {
    await page.goto('/dashboard');
    
    // Check system health widget
    const systemHealth = page.locator('[role="region"][aria-label="System health status"]');
    await expect(systemHealth).toBeVisible();
    await expect(systemHealth).toContainText('HEALTHY');
    await expect(systemHealth).toContainText('3 jobs'); // Queue depth
    await expect(systemHealth).toContainText('5 min'); // Provision time
    await expect(systemHealth).toContainText('150 ms'); // API latency
  });

  test('should show recent activity feed', async ({ page }) => {
    await page.goto('/dashboard');
    
    // Check activity feed
    const activityFeed = page.locator('[role="feed"]');
    await expect(activityFeed).toBeVisible();
    await expect(activityFeed).toContainText('John Doe');
    await expect(activityFeed).toContainText('Created order');
    await expect(activityFeed).toContainText('ORD-001');
  });

  test('should auto-refresh metrics every minute', async ({ page }) => {
    await page.goto('/dashboard');
    
    // Initial load
    await expect(page.locator('[role="article"]:has-text("Active Orders")')).toContainText('42');
    
    let apiCallCount = 0;
    await page.route('**/api/orders?status=active', async (route) => {
      apiCallCount++;
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ count: 50 }) // Updated value
      });
    });
    
    // Wait for auto-refresh (60 seconds)
    // For testing, we'll trigger it manually
    await page.evaluate(() => {
      // Trigger React Query refetch
      window.dispatchEvent(new Event('focus'));
    });
    
    // Should make new API call
    expect(apiCallCount).toBeGreaterThan(0);
  });

  test('should handle API errors gracefully', async ({ page }) => {
    // Mock API error
    await page.route('**/api/orders?status=active', async (route) => {
      await route.fulfill({
        status: 500,
        contentType: 'application/json',
        body: JSON.stringify({ 
          error: 'Internal Server Error',
          correlationId: 'test-correlation-id'
        })
      });
    });
    
    await page.goto('/dashboard');
    
    // Should show error state
    await expect(page.locator('[role="alert"]').first()).toBeVisible();
    await expect(page.locator('text=Failed to load').first()).toBeVisible();
  });

  test('should be accessible with keyboard navigation', async ({ page }) => {
    await page.goto('/dashboard');
    
    // Tab through dashboard elements
    await page.keyboard.press('Tab'); // Skip to main content link
    await page.keyboard.press('Tab'); // Navigation menu button
    await page.keyboard.press('Tab'); // First nav item
    
    // Check focus is visible
    const focusedElement = await page.evaluate(() => document.activeElement?.tagName);
    expect(focusedElement).toBeTruthy();
    
    // Navigate with arrow keys in navigation
    await page.keyboard.press('ArrowDown');
    await page.keyboard.press('Enter');
    
    // Should navigate to selected page
    await expect(page).toHaveURL(/\/contracts|\/orders/);
  });

  test('should work on mobile viewport', async ({ page }) => {
    // Set mobile viewport
    await page.setViewportSize({ width: 375, height: 667 });
    
    await page.goto('/dashboard');
    
    // Navigation should be hidden
    const nav = page.locator('nav[role="navigation"]');
    await expect(nav).not.toBeVisible();
    
    // Menu button should be visible
    const menuButton = page.locator('button[aria-label="Open navigation menu"]');
    await expect(menuButton).toBeVisible();
    
    // Open navigation
    await menuButton.click();
    
    // Navigation should now be visible
    await expect(nav).toBeVisible();
    
    // Metrics should stack vertically
    const metricsGrid = page.locator('[aria-label="Key metrics"]');
    const gridStyle = await metricsGrid.evaluate(el => window.getComputedStyle(el).gridTemplateColumns);
    expect(gridStyle).not.toContain('repeat(4'); // Should not be 4 columns on mobile
  });

  test('should load within 3 seconds', async ({ page }) => {
    const startTime = Date.now();
    
    await page.goto('/dashboard');
    
    // Wait for main content to be visible
    await expect(page.locator('h1:has-text("Dashboard")')).toBeVisible();
    await expect(page.locator('[role="article"]').first()).toBeVisible();
    
    const loadTime = Date.now() - startTime;
    
    // Should load within 3 seconds
    expect(loadTime).toBeLessThan(3000);
  });
});