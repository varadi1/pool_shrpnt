import { test, expect } from '@playwright/test';

test.describe('Contract Management', () => {
  test.beforeEach(async ({ page }) => {
    // Navigate to the app
    await page.goto('http://localhost:3000');
    
    // Wait for app to load
    await page.waitForSelector('#root', { timeout: 10000 });
  });

  test('should create a new contract', async ({ page }) => {
    // Navigate to contracts page
    await page.goto('http://localhost:3000/contracts');
    
    // Wait for contracts page to load
    await page.waitForSelector('h1:has-text("Contracts")', { timeout: 10000 });
    
    // Click on New Contract button
    await page.click('button:has-text("New Contract")');
    
    // Fill in the contract form
    await page.fill('input[name="contractNumber"]', 'TEST-2025-002');
    await page.fill('input[name="name"]', 'Test Contract E2E');
    await page.fill('textarea[name="description"]', 'This is a test contract created by Playwright');
    await page.fill('input[name="startDate"]', '2025-01-01');
    await page.fill('input[name="endDate"]', '2025-12-31');
    await page.fill('input[name="totalValue"]', '150000');
    await page.selectOption('select[name="status"]', 'active');
    
    // Submit the form
    await page.click('button[type="submit"]');
    
    // Wait for success message or redirect
    await page.waitForTimeout(2000);
    
    // Verify the contract was created
    const successMessage = page.locator('text=/Contract.*created successfully/i');
    const hasSuccessMessage = await successMessage.isVisible().catch(() => false);
    
    if (hasSuccessMessage) {
      expect(await successMessage.isVisible()).toBeTruthy();
    } else {
      // Check if we were redirected to contracts list
      await page.waitForSelector('text=/TEST-2025-002/i', { timeout: 5000 });
      const contractInList = page.locator('text=/TEST-2025-002/i');
      expect(await contractInList.isVisible()).toBeTruthy();
    }
  });

  test('should display contract list', async ({ page }) => {
    // Navigate to contracts page
    await page.goto('http://localhost:3000/contracts');
    
    // Wait for contracts page to load
    await page.waitForSelector('h1:has-text("Contracts")', { timeout: 10000 });
    
    // Check if the contracts table or list is visible
    const contractsContainer = page.locator('[data-testid="contracts-list"], table, .contracts-list');
    await expect(contractsContainer).toBeVisible({ timeout: 10000 });
  });
});