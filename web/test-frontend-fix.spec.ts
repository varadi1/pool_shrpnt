import { test, expect } from '@playwright/test';

test.describe('Frontend Fix Verification', () => {
  test('contracts page should load without errors', async ({ page }) => {
    // Set up console error listener
    const consoleErrors: string[] = [];
    page.on('console', (msg) => {
      if (msg.type() === 'error') {
        consoleErrors.push(msg.text());
      }
    });

    // Navigate to contracts page
    await page.goto('http://localhost:3000/contracts', { 
      waitUntil: 'networkidle',
      timeout: 30000 
    });

    // Wait a bit to ensure any async errors are caught
    await page.waitForTimeout(2000);

    // Check for any JavaScript errors
    expect(consoleErrors).toHaveLength(0);
    if (consoleErrors.length > 0) {
      console.error('Console errors found:', consoleErrors);
    }

    // Check that the page doesn't show error overlay
    const errorOverlay = page.locator('text=/Uncaught SyntaxError|Uncaught TypeError|Uncaught ReferenceError/i');
    await expect(errorOverlay).not.toBeVisible();

    // Check for React error boundary
    const reactError = page.locator('text=/Something went wrong|Error boundary/i');
    await expect(reactError).not.toBeVisible();

    // Verify some key elements are present (contracts page specific)
    await expect(page).toHaveTitle(/Contract|Vite \+ React/i);
    
    // Check that main content area exists
    const mainContent = page.locator('#root');
    await expect(mainContent).toBeVisible();
  });

  test('should not have module import errors', async ({ page }) => {
    const errors: string[] = [];
    
    page.on('pageerror', (error) => {
      errors.push(error.message);
    });

    await page.goto('http://localhost:3000/contracts', {
      waitUntil: 'domcontentloaded',
      timeout: 30000
    });

    // Check for specific import errors we've been fixing
    const importErrors = errors.filter(e => 
      e.includes('does not provide an export named') ||
      e.includes('TableColumnDefinition') ||
      e.includes('createTableColumn') ||
      e.includes('MessageBarType') ||
      e.includes('Contract')
    );

    expect(importErrors).toHaveLength(0);
    if (importErrors.length > 0) {
      console.error('Import errors found:', importErrors);
    }
  });

  test('should render without Fluent UI errors', async ({ page }) => {
    await page.goto('http://localhost:3000/contracts');
    
    // Wait for the page to fully render
    await page.waitForLoadState('networkidle');
    
    // Check that Fluent UI components are rendering
    // MessageBar should exist (if there are any messages)
    const messageBars = page.locator('[role="alert"]');
    const count = await messageBars.count();
    
    // If there are message bars, they should not have the old messageBarType prop
    if (count > 0) {
      const htmlContent = await page.content();
      expect(htmlContent).not.toContain('messageBarType');
      expect(htmlContent).not.toContain('MessageBarType');
    }
    
    // DataGrid should render if there's a table
    const dataGrids = page.locator('[role="grid"]');
    const gridCount = await dataGrids.count();
    
    if (gridCount > 0) {
      // Should not contain old API references
      const htmlContent = await page.content();
      expect(htmlContent).not.toContain('TableColumnDefinition');
      expect(htmlContent).not.toContain('createTableColumn');
    }
  });
});