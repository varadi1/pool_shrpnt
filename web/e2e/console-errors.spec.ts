import { test, expect } from '@playwright/test';

// Visits key routes and fails if any console errors/page errors occur.
// Stubs API calls so the app can render without a backend running.
test.describe('Console errors across primary pages', () => {
  test.beforeEach(async ({ page }) => {
    // Enable mock auth for E2E
    await page.addInitScript(() => {
      (window as any).__MSAL_MOCK__ = true;
      window.sessionStorage.setItem(
        'mock-account',
        JSON.stringify({
          username: 'admin@example.com',
          name: 'Admin User',
          idTokenClaims: { roles: ['NEU_Admin'] },
        })
      );
      // Provide roles in session for hooks that read from storage
      window.sessionStorage.setItem('userRoles', JSON.stringify(['NEU_Admin']));
    });

    // Generic API stubbing for routes used by the app so we avoid network errors
    await page.route('**/api/**', async (route) => {
      const url = route.request().url();

      const json = (body: any) =>
        route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) });

      if (url.includes('/api/contracts')) {
        return json({ items: [], total: 0, page: 1, page_size: 25, total_pages: 0 });
      }
      if (url.includes('/api/orders')) {
        return json({ items: [], total: 0, page: 1, page_size: 25, total_pages: 0 });
      }
      if (url.includes('/api/templates')) {
        return json([]);
      }
      if (url.includes('/api/locks/summary')) {
        return json({ timeLocked: 0, crUnlocked: 0, manualLocked: 0 });
      }
      if (url.includes('/api/guests')) {
        return json({ items: [], total: 0, page: 1, page_size: 25, total_pages: 0 });
      }
      if (url.includes('/api/health')) {
        return json({ status: 'healthy', queueDepth: 0, lastProvisionTime: 0, latency: 0 });
      }
      if (url.includes('/api/audit/recent')) {
        return json([]);
      }
      if (url.includes('/api/permissions')) {
        return json([]);
      }

      // Default stub
      return json({});
    });
  });

  test('no console errors on main pages', async ({ page }) => {
    const consoleErrors: { url: string; type: string; text: string }[] = [];

    page.on('console', (msg) => {
      if (msg.type() === 'error') {
        consoleErrors.push({ url: page.url(), type: msg.type(), text: msg.text() });
      }
    });
    page.on('pageerror', (err) => {
      consoleErrors.push({ url: page.url(), type: 'pageerror', text: String(err) });
    });

    const routes = [
      '/dashboard',
      '/contracts',
      '/orders',
      '/orders/new',
      '/templates',
      '/locks',
      '/users',
      '/permissions',
      '/guests',
      '/reports',
      '/audit',
      '/settings',
    ];

    for (const path of routes) {
      await page.goto(path);
      // Wait for main content region or fallback to some visible content
      const main = page.locator('main, [role="main"], h1');
      await expect(main.first()).toBeVisible({ timeout: 10000 });
      // brief settle time to allow lazy effects to run
      await page.waitForTimeout(200);
    }

    if (consoleErrors.length > 0) {
      console.log('Console errors detected:', consoleErrors);
    }

    expect(consoleErrors, 'No console errors should be present on primary pages').toEqual([]);
  });
});


