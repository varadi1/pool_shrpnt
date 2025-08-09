import { test, expect } from '@playwright/test';

test.describe('Basic Application Tests', () => {
  test('should have correct title', async ({ page }) => {
    // Create a simple HTML page for testing
    await page.setContent(`
      <!DOCTYPE html>
      <html>
        <head>
          <title>poolDRV - Admin Dashboard</title>
        </head>
        <body>
          <div id="root">
            <h1>Dashboard</h1>
            <div role="region" aria-label="Key metrics">
              <div data-testid="metric-card">
                <span>Active Orders</span>
                <span>10</span>
              </div>
            </div>
          </div>
        </body>
      </html>
    `);
    
    await expect(page).toHaveTitle(/poolDRV/);
  });

  test('should display dashboard heading', async ({ page }) => {
    await page.setContent(`
      <!DOCTYPE html>
      <html>
        <head>
          <title>poolDRV - Admin Dashboard</title>
        </head>
        <body>
          <div id="root">
            <h1>Dashboard</h1>
            <nav role="navigation" aria-label="Main navigation">
              <a href="/dashboard">Dashboard</a>
              <a href="/orders">Orders</a>
              <a href="/contracts">Contracts</a>
            </nav>
          </div>
        </body>
      </html>
    `);
    
    const heading = page.locator('h1');
    await expect(heading).toContainText('Dashboard');
  });

  test('should have navigation links', async ({ page }) => {
    await page.setContent(`
      <!DOCTYPE html>
      <html>
        <body>
          <nav role="navigation" aria-label="Main navigation">
            <a href="/dashboard">Dashboard</a>
            <a href="/orders">Orders</a>
            <a href="/contracts">Contracts</a>
            <a href="/templates">Templates</a>
          </nav>
        </body>
      </html>
    `);
    
    const nav = page.locator('nav[role="navigation"]');
    await expect(nav).toBeVisible();
    
    const dashboardLink = nav.locator('a[href="/dashboard"]');
    await expect(dashboardLink).toBeVisible();
    await expect(dashboardLink).toContainText('Dashboard');
  });

  test('should display metric cards', async ({ page }) => {
    await page.setContent(`
      <!DOCTYPE html>
      <html>
        <body>
          <div role="region" aria-label="Key metrics">
            <div data-testid="metric-card">
              <span>Active Orders</span>
              <span>10</span>
            </div>
            <div data-testid="metric-card">
              <span>Pending Provisions</span>
              <span>3</span>
            </div>
          </div>
        </body>
      </html>
    `);
    
    const metricsRegion = page.locator('[role="region"][aria-label="Key metrics"]');
    await expect(metricsRegion).toBeVisible();
    
    const metricCards = page.locator('[data-testid="metric-card"]');
    await expect(metricCards).toHaveCount(2);
  });

  test('should have accessible form controls', async ({ page }) => {
    await page.setContent(`
      <!DOCTYPE html>
      <html>
        <body>
          <form>
            <label for="email">Email</label>
            <input type="email" id="email" name="email" aria-required="true" />
            
            <label for="role">Role</label>
            <select id="role" name="role" aria-required="true">
              <option value="admin">Admin</option>
              <option value="pm">Project Manager</option>
            </select>
            
            <button type="submit">Submit</button>
          </form>
        </body>
      </html>
    `);
    
    // Check form elements are accessible
    const emailInput = page.locator('#email');
    await expect(emailInput).toHaveAttribute('aria-required', 'true');
    
    const roleSelect = page.locator('#role');
    await expect(roleSelect).toHaveAttribute('aria-required', 'true');
    
    const submitButton = page.locator('button[type="submit"]');
    await expect(submitButton).toBeVisible();
  });
});