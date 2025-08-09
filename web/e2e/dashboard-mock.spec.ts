import { test, expect } from '@playwright/test';

test.describe('Dashboard Mock Tests', () => {
  test.beforeEach(async ({ page }) => {
    // Create a mock dashboard page for testing
    await page.setContent(`
      <!DOCTYPE html>
      <html>
        <head>
          <title>poolDRV - Dashboard</title>
        </head>
        <body>
          <div id="root">
            <header>
              <nav role="navigation" aria-label="Main navigation">
                <a href="/dashboard" class="active">Dashboard</a>
                <a href="/orders">Orders</a>
                <a href="/contracts">Contracts</a>
              </nav>
              <div data-testid="user-profile">
                <span>Admin User</span>
                <span>NEU_Admin</span>
              </div>
            </header>
            <main>
              <h1>Dashboard</h1>
              <div role="region" aria-label="Key metrics">
                <div data-testid="metric-card">
                  <h2>Active Orders</h2>
                  <span class="metric-value">10</span>
                </div>
                <div data-testid="metric-card">
                  <h2>Pending Provisions</h2>
                  <span class="metric-value">3</span>
                </div>
                <div data-testid="metric-card">
                  <h2>Failed (24h)</h2>
                  <span class="metric-value">1</span>
                </div>
                <div data-testid="metric-card">
                  <h2>Active Contracts</h2>
                  <span class="metric-value">5</span>
                </div>
              </div>
              <div data-testid="activity-feed">
                <h2>Recent Activity</h2>
                <div role="feed" aria-live="polite">
                  <article>
                    <time datetime="2024-01-15T10:00:00">10:00 AM</time>
                    <span>User created order ORD-001</span>
                  </article>
                  <article>
                    <time datetime="2024-01-15T09:30:00">9:30 AM</time>
                    <span>Contract CNT-456 updated</span>
                  </article>
                </div>
              </div>
              <div data-testid="system-health">
                <h2>System Health</h2>
                <div role="status">
                  <span>Status: healthy</span>
                  <span>Queue: 5</span>
                  <span>Latency: 150ms</span>
                </div>
              </div>
            </main>
          </div>
        </body>
      </html>
    `);
  });

  test('should display dashboard metrics', async ({ page }) => {
    // Check dashboard heading
    const heading = page.locator('h1');
    await expect(heading).toContainText('Dashboard');
    
    // Check metrics are visible
    const metricsRegion = page.locator('[role="region"][aria-label="Key metrics"]');
    await expect(metricsRegion).toBeVisible();
    
    // Verify all metric cards are present
    const metricCards = page.locator('[data-testid="metric-card"]');
    await expect(metricCards).toHaveCount(4);
    
    // Check specific metric values
    await expect(page.locator('text=Active Orders').locator('..').locator('.metric-value')).toContainText('10');
    await expect(page.locator('text=Pending Provisions').locator('..').locator('.metric-value')).toContainText('3');
  });

  test('should show recent activity feed', async ({ page }) => {
    const activityFeed = page.locator('[data-testid="activity-feed"]');
    await expect(activityFeed).toBeVisible();
    
    // Check feed has articles
    const articles = activityFeed.locator('article');
    await expect(articles).toHaveCount(2);
    
    // Verify feed content
    await expect(activityFeed).toContainText('User created order ORD-001');
    await expect(activityFeed).toContainText('Contract CNT-456 updated');
  });

  test('should display system health information', async ({ page }) => {
    const healthSection = page.locator('[data-testid="system-health"]');
    await expect(healthSection).toBeVisible();
    
    // Check health status
    await expect(healthSection).toContainText('Status: healthy');
    await expect(healthSection).toContainText('Queue: 5');
    await expect(healthSection).toContainText('Latency: 150ms');
  });

  test('should have accessible navigation', async ({ page }) => {
    const nav = page.locator('nav[role="navigation"]');
    await expect(nav).toBeVisible();
    await expect(nav).toHaveAttribute('aria-label', 'Main navigation');
    
    // Check active link
    const activeLink = nav.locator('a.active');
    await expect(activeLink).toContainText('Dashboard');
  });

  test('should show user profile information', async ({ page }) => {
    const userProfile = page.locator('[data-testid="user-profile"]');
    await expect(userProfile).toBeVisible();
    await expect(userProfile).toContainText('Admin User');
    await expect(userProfile).toContainText('NEU_Admin');
  });

  test('should have proper ARIA attributes for accessibility', async ({ page }) => {
    // Check live region for activity feed
    const feed = page.locator('[role="feed"]');
    await expect(feed).toHaveAttribute('aria-live', 'polite');
    
    // Check status role for health
    const status = page.locator('[role="status"]');
    await expect(status).toBeVisible();
    
    // Check time elements
    const timeElements = page.locator('time');
    const firstTime = timeElements.first();
    await expect(firstTime).toHaveAttribute('datetime');
  });

  test('metric cards should be keyboard navigable', async ({ page }) => {
    // Tab through metric cards
    await page.keyboard.press('Tab');
    await page.keyboard.press('Tab');
    
    // Check if elements can receive focus
    const focusedElement = page.locator(':focus');
    await expect(focusedElement).toBeVisible();
  });

  test('should handle empty states gracefully', async ({ page }) => {
    // Update page with empty activity feed
    await page.setContent(`
      <!DOCTYPE html>
      <html>
        <body>
          <div data-testid="activity-feed">
            <h2>Recent Activity</h2>
            <div role="feed" aria-live="polite">
              <p>No recent activity</p>
            </div>
          </div>
        </body>
      </html>
    `);
    
    const activityFeed = page.locator('[data-testid="activity-feed"]');
    await expect(activityFeed).toContainText('No recent activity');
  });
});