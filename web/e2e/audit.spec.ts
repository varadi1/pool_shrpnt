import { test, expect, Page } from '@playwright/test';
import type { AuditEntry } from '../src/types/audit';

// Helper to mock API responses
async function mockAuditAPI(page: Page) {
  await page.route('**/api/audit/logs**', async (route) => {
    const url = new URL(route.request().url());
    const cursor = url.searchParams.get('cursor');
    const filters = url.searchParams.get('filters');
    
    const mockData = {
      entries: Array.from({ length: 20 }, (_, i) => ({
        id: `audit-${i}`,
        timestamp: new Date(Date.now() - i * 60000).toISOString(),
        actor: {
          id: `user-${i % 3}`,
          name: `User ${i % 3}`,
          email: `user${i % 3}@example.com`,
          role: ['Admin', 'User', 'Manager'][i % 3],
          type: 'user',
        },
        action: {
          type: ['TEMPLATE_CREATED', 'ORDER_PROVISIONED', 'PERMISSION_GRANTED'][i % 3],
          category: ['template', 'provisioning', 'security'][i % 3],
          severity: ['info', 'warning', 'error'][i % 3],
          description: `Action ${i}`,
        },
        target: {
          type: ['template', 'order', 'permission'][i % 3],
          id: `target-${i}`,
          name: `Target ${i}`,
        },
        metadata: {
          correlationId: `corr-${Math.floor(i / 3)}`,
          duration: 1000 + i * 100,
        },
        status: i % 10 === 0 ? 'failure' : 'success',
      })),
      pagination: {
        cursor: cursor ? null : 'next-cursor',
        hasMore: !cursor,
        totalCount: 100,
      },
    };
    
    await route.fulfill({ json: mockData });
  });

  await page.route('**/api/audit/export**', async (route) => {
    if (route.request().method() === 'POST') {
      await route.fulfill({
        json: {
          id: 'export-123',
          status: 'processing',
          format: 'csv',
          filters: {},
          createdAt: new Date().toISOString(),
        },
      });
    } else {
      await route.fulfill({
        json: {
          id: 'export-123',
          status: 'completed',
          format: 'csv',
          filters: {},
          createdAt: new Date().toISOString(),
          completedAt: new Date().toISOString(),
          downloadUrl: '/download/export-123',
        },
      });
    }
  });

  await page.route('**/api/audit/correlation/**', async (route) => {
    await route.fulfill({
      json: {
        correlationId: 'corr-1',
        events: Array.from({ length: 5 }, (_, i) => ({
          id: `corr-event-${i}`,
          timestamp: new Date(Date.now() - i * 1000).toISOString(),
          actor: { id: 'user-1', name: 'User 1', email: 'user1@example.com', role: 'Admin', type: 'user' },
          action: { type: 'TEMPLATE_CREATED', category: 'template', severity: 'info', description: `Correlated action ${i}` },
          target: { type: 'template', id: `template-${i}`, name: `Template ${i}` },
          metadata: { correlationId: 'corr-1' },
          status: 'success',
        })),
        statistics: {
          totalEvents: 5,
          duration: 5000,
          services: ['api', 'worker'],
          status: 'success',
        },
      },
    });
  });

  await page.route('**/api/audit/stats**', async (route) => {
    await route.fulfill({
      json: {
        eventsPerDay: [
          { date: '2025-01-01', count: 150 },
          { date: '2025-01-02', count: 200 },
        ],
        topUsers: [
          { userId: 'user-1', name: 'User 1', eventCount: 50 },
        ],
        commonActions: [
          { action: 'TEMPLATE_CREATED', count: 30 },
        ],
        failureRate: 0.05,
      },
    });
  });
}

test.describe('Audit View E2E Tests', () => {
  test.beforeEach(async ({ page }) => {
    // Mock authentication
    await page.addInitScript(() => {
      window.localStorage.setItem('auth_token', 'mock-token');
      window.localStorage.setItem('user', JSON.stringify({
        id: 'test-user',
        name: 'Test User',
        email: 'test@example.com',
        role: 'NEU_Admin',
      }));
    });
    
    // Setup API mocks
    await mockAuditAPI(page);
    
    // Navigate to audit page
    await page.goto('/audit');
  });

  test.describe('Complete Audit Workflow', () => {
    test('loads and displays audit entries', async ({ page }) => {
      // Wait for page to load
      await expect(page.locator('h1')).toContainText('Audit napló');
      
      // Check that entries are displayed
      await expect(page.locator('[data-testid^="audit-entry-"]').first()).toBeVisible();
      
      // Verify multiple entries loaded
      const entries = await page.locator('[data-testid^="audit-entry-"]').count();
      expect(entries).toBeGreaterThan(0);
    });

    test('searches and filters audit logs', async ({ page }) => {
      // Search for specific text
      await page.fill('[placeholder="Szabad szöveges keresés..."]', 'template');
      
      // Wait for filtered results
      await page.waitForTimeout(600); // Debounce delay
      
      // Apply date filter
      await page.click('button:has-text("Ma")');
      
      // Open advanced filters
      await page.click('button:has-text("Speciális szűrők")');
      
      // Select status filter
      await page.check('label:has-text("Sikeres")');
      
      // Verify filters are applied
      await expect(page.locator('[data-testid="active-filter"]')).toHaveCount(3);
    });

    test('paginates through results', async ({ page }) => {
      // Wait for initial load
      await expect(page.locator('[data-testid^="audit-entry-"]').first()).toBeVisible();
      
      // Load more entries
      await page.click('button:has-text("További betöltése")');
      
      // Wait for new entries
      await page.waitForTimeout(500);
      
      // Verify more entries loaded
      const entries = await page.locator('[data-testid^="audit-entry-"]').count();
      expect(entries).toBeGreaterThan(20);
    });

    test('exports audit data', async ({ page }) => {
      // Open export dialog
      await page.click('button:has-text("Exportálás")');
      
      // Wait for dialog
      await expect(page.locator('[role="dialog"]')).toBeVisible();
      
      // Select format
      await page.check('label:has-text("CSV")');
      
      // Select columns
      await page.click('button:has-text("Összes kiválasztása")');
      
      // Start export
      await page.click('button:has-text("Exportálás indítása")');
      
      // Wait for completion
      await expect(page.locator('text=/Export sikeres/i')).toBeVisible({ timeout: 10000 });
    });
  });

  test.describe('Correlation View', () => {
    test('views correlated events', async ({ page }) => {
      // Click on a correlation ID
      await page.click('[data-testid^="correlation-link-"]:first-child');
      
      // Wait for correlation view
      await expect(page.locator('text=/kapcsolódó események/i')).toBeVisible();
      
      // Verify timeline view
      await page.click('[role="tab"]:has-text("Idővonal")');
      await expect(page.locator('[data-testid^="timeline-item-"]')).toHaveCount(5);
      
      // Switch to flow view
      await page.click('[role="tab"]:has-text("Folyamat")');
      await expect(page.locator('[data-testid^="flow-step-"]')).toBeVisible();
      
      // Export correlation
      await page.click('button:has-text("Exportálás")');
      await expect(page.locator('text=/Export/i')).toBeVisible();
    });

    test('analyzes critical path', async ({ page }) => {
      // Open correlation view
      await page.click('[data-testid^="correlation-link-"]:first-child');
      
      // Check critical path indicators
      await expect(page.locator('[data-testid="critical-path-summary"]')).toBeVisible();
      
      // Verify bottleneck identification
      await expect(page.locator('[data-testid^="bottleneck-"]')).toBeVisible();
    });
  });

  test.describe('Real-time Updates', () => {
    test('receives WebSocket updates', async ({ page }) => {
      // Check connection status
      await expect(page.locator('[data-testid="connection-status"]')).toBeVisible();
      
      // Simulate WebSocket message
      await page.evaluate(() => {
        const event = new CustomEvent('audit-update', {
          detail: {
            id: 'ws-event-1',
            timestamp: new Date().toISOString(),
            actor: { id: 'ws-user', name: 'WebSocket User', email: 'ws@example.com', role: 'Admin', type: 'user' },
            action: { type: 'TEMPLATE_CREATED', category: 'template', severity: 'info', description: 'Real-time event' },
            target: { type: 'template', id: 'ws-template', name: 'WebSocket Template' },
            metadata: { correlationId: 'ws-corr' },
            status: 'success',
          },
        });
        window.dispatchEvent(event);
      });
      
      // Check for new event badge
      await expect(page.locator('[data-testid="live-update-badge"]')).toContainText('1');
      
      // Toggle auto-scroll
      await page.click('[data-testid="auto-scroll-toggle"]');
    });

    test('handles connection failures gracefully', async ({ page }) => {
      // Simulate disconnection
      await page.evaluate(() => {
        window.dispatchEvent(new Event('offline'));
      });
      
      // Check for disconnection indicator
      await expect(page.locator('[data-testid="connection-status"]')).toContainText(/Offline|Disconnected/i);
      
      // Simulate reconnection
      await page.evaluate(() => {
        window.dispatchEvent(new Event('online'));
      });
      
      // Check for reconnection
      await expect(page.locator('[data-testid="connection-status"]')).toContainText(/Online|Connected/i);
    });
  });

  test.describe('Analytics and Reporting', () => {
    test('views audit statistics', async ({ page }) => {
      // Switch to analytics tab
      await page.click('[role="tab"]:has-text("Elemzés")');
      
      // Wait for statistics to load
      await expect(page.locator('text=/Események naponta/i')).toBeVisible();
      
      // Check charts
      await expect(page.locator('[data-testid="events-chart"]')).toBeVisible();
      await expect(page.locator('[data-testid="top-users-chart"]')).toBeVisible();
      await expect(page.locator('[data-testid="actions-chart"]')).toBeVisible();
    });

    test('generates compliance reports', async ({ page }) => {
      // Switch to analytics
      await page.click('[role="tab"]:has-text("Elemzés")');
      
      // Open reports tab
      await page.click('[role="tab"]:has-text("Jelentések")');
      
      // Generate user access report
      await page.click('button:has-text("Felhasználói hozzáférés")');
      
      // Wait for report generation
      await expect(page.locator('text=/Jelentés generálása/i')).toBeVisible();
      
      // Export report
      await page.click('button:has-text("Jelentés exportálása")');
      await expect(page.locator('text=/Export/i')).toBeVisible();
    });
  });

  test.describe('Advanced Filtering', () => {
    test('applies complex filter combinations', async ({ page }) => {
      // Open advanced filters
      await page.click('button:has-text("Speciális szűrők")');
      
      // Set date range
      await page.fill('[aria-label="Dátum ettől"]', '2025-01-01T00:00');
      await page.fill('[aria-label="Dátum eddig"]', '2025-01-31T23:59');
      
      // Select multiple action types
      await page.click('[placeholder="Válassz műveletet..."]');
      await page.click('text="Sablon létrehozva"');
      await page.click('text="Megrendelés kiépítve"');
      await page.keyboard.press('Escape');
      
      // Select categories
      await page.click('[placeholder="Válassz kategóriát..."]');
      await page.click('text="Sablonok"');
      await page.click('text="Kiépítés"');
      await page.keyboard.press('Escape');
      
      // Apply status filters
      await page.check('label:has-text("Sikeres")');
      await page.check('label:has-text("Sikertelen")');
      
      // Verify all filters applied
      const activeFilters = await page.locator('[data-testid="active-filter"]').count();
      expect(activeFilters).toBeGreaterThan(5);
    });

    test('saves and loads filter presets', async ({ page }) => {
      // Apply some filters
      await page.fill('[placeholder="Szabad szöveges keresés..."]', 'security');
      await page.click('button:has-text("Speciális szűrők")');
      await page.check('label:has-text("Sikertelen")');
      
      // Save as preset
      await page.click('button:has-text("Mentés előbeállításként")');
      
      // Handle prompt
      page.once('dialog', dialog => {
        dialog.accept('Security Audit Filter');
      });
      
      await page.click('button:has-text("Mentés előbeállításként")');
      
      // Clear filters
      await page.click('button:has-text("Szűrők törlése")');
      
      // Load preset
      await page.click('[placeholder="Válassz előbeállítást..."]');
      await page.click('text="Security Audit Filter"');
      
      // Verify filters restored
      await expect(page.locator('[placeholder="Szabad szöveges keresés..."]')).toHaveValue('security');
    });
  });

  test.describe('Performance', () => {
    test('handles large datasets efficiently', async ({ page }) => {
      // Mock large dataset
      await page.route('**/api/audit/logs**', async (route) => {
        const largeData = {
          entries: Array.from({ length: 1000 }, (_, i) => ({
            id: `audit-${i}`,
            timestamp: new Date(Date.now() - i * 1000).toISOString(),
            actor: { id: `user-${i}`, name: `User ${i}`, email: `user${i}@example.com`, role: 'User', type: 'user' },
            action: { type: 'TEMPLATE_CREATED', category: 'template', severity: 'info', description: `Action ${i}` },
            target: { type: 'template', id: `template-${i}`, name: `Template ${i}` },
            metadata: { correlationId: `corr-${i}` },
            status: 'success',
          })),
          pagination: { hasMore: false, totalCount: 1000 },
        };
        await route.fulfill({ json: largeData });
      });
      
      await page.reload();
      
      // Measure load time
      const startTime = Date.now();
      await expect(page.locator('[data-testid^="audit-entry-"]').first()).toBeVisible();
      const loadTime = Date.now() - startTime;
      
      // Should load within 3 seconds
      expect(loadTime).toBeLessThan(3000);
      
      // Check virtual scrolling
      const visibleEntries = await page.locator('[data-testid^="audit-entry-"]:visible').count();
      expect(visibleEntries).toBeLessThan(100); // Not all 1000 should be rendered
    });

    test('maintains responsiveness during operations', async ({ page }) => {
      // Start multiple operations
      const operations = [
        page.fill('[placeholder="Szabad szöveges keresés..."]', 'performance test'),
        page.click('button:has-text("Ma")'),
        page.click('button:has-text("Speciális szűrők")'),
      ];
      
      await Promise.all(operations);
      
      // UI should remain responsive
      await expect(page.locator('h1')).toBeVisible();
      await expect(page.locator('[data-testid^="audit-entry-"]').first()).toBeVisible();
    });
  });

  test.describe('Accessibility', () => {
    test('supports keyboard navigation', async ({ page }) => {
      // Tab through interactive elements
      await page.keyboard.press('Tab');
      await expect(page.locator(':focus')).toBeVisible();
      
      // Navigate with arrow keys in table
      await page.locator('[role="table"]').focus();
      await page.keyboard.press('ArrowDown');
      await page.keyboard.press('ArrowDown');
      
      // Open dropdown with keyboard
      await page.keyboard.press('Tab');
      await page.keyboard.press('Tab');
      await page.keyboard.press('Enter');
      
      // Navigate dropdown options
      await page.keyboard.press('ArrowDown');
      await page.keyboard.press('Enter');
    });

    test('provides screen reader announcements', async ({ page }) => {
      // Check for ARIA live regions
      await expect(page.locator('[aria-live="polite"]')).toBeAttached();
      
      // Apply filter and check for announcement
      await page.fill('[placeholder="Szabad szöveges keresés..."]', 'test');
      await page.waitForTimeout(600);
      
      // Check for status announcement
      await expect(page.locator('[role="status"]')).toContainText(/szűrő|filter/i);
    });

    test('maintains focus management', async ({ page }) => {
      // Open modal
      await page.click('button:has-text("Exportálás")');
      
      // Focus should be in modal
      await expect(page.locator('[role="dialog"] :focus')).toBeVisible();
      
      // Close with Escape
      await page.keyboard.press('Escape');
      
      // Focus should return to trigger
      await expect(page.locator('button:has-text("Exportálás")')).toBeFocused();
    });
  });

  test.describe('Error Handling', () => {
    test('handles API errors gracefully', async ({ page }) => {
      // Mock API error
      await page.route('**/api/audit/logs**', async (route) => {
        await route.fulfill({ status: 500, json: { message: 'Server error' } });
      });
      
      await page.reload();
      
      // Should show error message
      await expect(page.locator('text=/Hiba történt/i')).toBeVisible();
      
      // Should provide retry option
      await expect(page.locator('button:has-text("Újrapróbálkozás")')).toBeVisible();
    });

    test('handles network failures', async ({ page, context }) => {
      // Go offline
      await context.setOffline(true);
      
      // Try to load more
      await page.click('button:has-text("További betöltése")').catch(() => {});
      
      // Should show offline message
      await expect(page.locator('text=/Offline|Nincs kapcsolat/i')).toBeVisible();
      
      // Go back online
      await context.setOffline(false);
      
      // Should recover
      await page.click('button:has-text("Újrapróbálkozás")');
      await expect(page.locator('[data-testid^="audit-entry-"]').first()).toBeVisible();
    });
  });

  test.describe('Mobile Responsiveness', () => {
    test.use({ viewport: { width: 375, height: 667 } });
    
    test('works on mobile devices', async ({ page }) => {
      // Check responsive layout
      await expect(page.locator('h1')).toBeVisible();
      
      // Open mobile menu for filters
      await page.click('[data-testid="mobile-filter-toggle"]');
      
      // Filters should be accessible
      await expect(page.locator('[placeholder="Szabad szöveges keresés..."]')).toBeVisible();
      
      // Table should be scrollable
      const table = page.locator('[role="table"]');
      await table.scrollIntoViewIfNeeded();
      await expect(table).toBeVisible();
      
      // Touch gestures
      await table.swipe({ direction: 'left' });
      await table.swipe({ direction: 'right' });
    });
  });
});