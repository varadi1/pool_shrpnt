import { test, expect } from '@playwright/test';

test.describe('Order Creation E2E', () => {
  test.beforeEach(async ({ page }) => {
    // Mock authentication
    await page.goto('/');
    await page.evaluate(() => {
      localStorage.setItem('auth_token', 'mock_token');
      sessionStorage.setItem('user', JSON.stringify({
        id: 'user123',
        email: 'admin@company.com',
        role: 'NEU_Admin'
      }));
    });
  });

  test('Complete order creation flow', async ({ page }) => {
    // Navigate to new order page
    await page.goto('/orders/new');

    // Step 1: Contract Selection
    await expect(page.getByRole('heading', { name: 'Select Contract' })).toBeVisible();
    await expect(page.getByText('Step 1 of 6')).toBeVisible();

    // Wait for contracts to load
    await page.waitForSelector('[data-testid="contract-card-contract1"]');
    
    // Select a contract
    await page.click('[data-testid="contract-card-contract1"]');
    await expect(page.locator('[data-testid="contract-card-contract1"][aria-selected="true"]')).toBeVisible();

    // Proceed to next step
    await page.click('button:has-text("Next")');

    // Step 2: Order Details
    await expect(page.getByRole('heading', { name: 'Order Details' })).toBeVisible();
    await expect(page.getByText('Step 2 of 6')).toBeVisible();

    // Fill order details
    await page.fill('input[name="orderName"]', 'E2E Test Order');
    await page.fill('textarea[name="description"]', 'This is an E2E test order created by Playwright');
    
    // Order code should be auto-generated
    await expect(page.locator('input[name="orderCode"]')).toHaveValue(/EM-\d{4}-NEU001-\d{3}/);

    // Set dates
    const today = new Date();
    const endDate = new Date(today);
    endDate.setMonth(endDate.getMonth() + 3);
    
    await page.fill('input[name="startDate"]', today.toISOString().split('T')[0]);
    await page.fill('input[name="endDate"]', endDate.toISOString().split('T')[0]);

    // Select order type
    await page.selectOption('select[name="orderType"]', 'standard');

    await page.click('button:has-text("Next")');

    // Step 3: Template Selection
    await expect(page.getByRole('heading', { name: 'Select Template' })).toBeVisible();
    await expect(page.getByText('Step 3 of 6')).toBeVisible();

    // Wait for templates to load
    await page.waitForSelector('[data-testid="template-card-template1"]');

    // Preview template
    await page.click('button:has-text("Preview"):near([data-testid="template-card-template1"])');
    await expect(page.getByRole('dialog', { name: 'Template Preview' })).toBeVisible();
    await expect(page.getByText('/Documents')).toBeVisible();
    await expect(page.getByText('/Reports')).toBeVisible();
    await page.click('button:has-text("Close")');

    // Select template
    await page.click('[data-testid="template-card-template1"]');
    await expect(page.locator('[data-testid="template-card-template1"][aria-selected="true"]')).toBeVisible();

    await page.click('button:has-text("Next")');

    // Step 4: Part Configuration
    await expect(page.getByRole('heading', { name: 'Configure Parts' })).toBeVisible();
    await expect(page.getByText('Step 4 of 6')).toBeVisible();

    // Select Part A
    await page.check('input[name="partA"]');
    
    // Set deadline for Part A
    const partDeadline = new Date(today);
    partDeadline.setMonth(partDeadline.getMonth() + 1);
    await page.fill('input[name="partA_deadline"]', partDeadline.toISOString().split('T')[0]);
    
    // Verify lock timeline is displayed
    await expect(page.getByText('T-3')).toBeVisible();
    await expect(page.getByText('T-1')).toBeVisible();
    await expect(page.getByText('T+0')).toBeVisible();
    await expect(page.getByText('T+8')).toBeVisible();

    // Select Part B as well
    await page.check('input[name="partB"]');
    await page.fill('input[name="partB_deadline"]', partDeadline.toISOString().split('T')[0]);

    await page.click('button:has-text("Next")');

    // Step 5: Partner Assignment
    await expect(page.getByRole('heading', { name: 'Assign Partners' })).toBeVisible();
    await expect(page.getByText('Step 5 of 6')).toBeVisible();

    // Wait for partners to load
    await page.waitForSelector('[data-testid="partner-card-company1"]');

    // Search for partner
    await page.fill('input[placeholder="Search partners..."]', 'Partner A');
    await expect(page.locator('[data-testid="partner-card-company1"]')).toBeVisible();
    await expect(page.locator('[data-testid="partner-card-company2"]')).not.toBeVisible();

    // Clear search
    await page.fill('input[placeholder="Search partners..."]', '');

    // Select multiple partners
    await page.click('[data-testid="partner-card-company1"]');
    await page.click('[data-testid="partner-card-company2"]');

    // Configure access for first partner
    await page.click('button:has-text("Configure"):near([data-testid="partner-card-company1"])');
    await page.selectOption('select[name="company1_access"]', 'write');
    await page.check('input[name="company1_partA"]');
    await page.check('input[name="company1_partB"]');
    await page.click('button:has-text("Save")');

    await page.click('button:has-text("Next")');

    // Step 6: Review & Submit
    await expect(page.getByRole('heading', { name: 'Review Your Order' })).toBeVisible();
    await expect(page.getByText('Step 6 of 6')).toBeVisible();

    // Verify summary contains all selections
    await expect(page.getByText('Contract: Test Contract')).toBeVisible();
    await expect(page.getByText('Order Name: E2E Test Order')).toBeVisible();
    await expect(page.getByText('Template: Standard Template v2.0')).toBeVisible();
    await expect(page.getByText('Parts: A, B')).toBeVisible();
    await expect(page.getByText('Partners: 2 companies')).toBeVisible();

    // Confirm order creation
    await page.check('input[name="confirmCreate"]');
    
    // Submit button should now be enabled
    await expect(page.getByRole('button', { name: 'Submit Order' })).toBeEnabled();

    // Submit the order
    await page.click('button:has-text("Submit Order")');

    // Wait for provisioning to start
    await expect(page.getByText('Provisioning in Progress')).toBeVisible({ timeout: 10000 });
    await expect(page.getByRole('progressbar')).toBeVisible();

    // Verify provisioning steps are shown
    await expect(page.getByText('Creating folders')).toBeVisible();
    await expect(page.getByText('Setting permissions')).toBeVisible();
    await expect(page.getByText('Creating Teams')).toBeVisible();

    // Wait for some progress
    await page.waitForTimeout(2000);

    // Verify progress updates
    await expect(page.locator('[aria-valuenow]')).toHaveAttribute('aria-valuenow', /[1-9]\d*/);

    // Check for completion or timeout handling
    await page.waitForSelector(
      'text=/Order created successfully|Provisioning completed|Provisioning timeout/',
      { timeout: 30000 }
    );
  });

  test('Save and resume draft', async ({ page }) => {
    await page.goto('/orders/new');

    // Fill first few steps
    await page.click('[data-testid="contract-card-contract1"]');
    await page.click('button:has-text("Next")');

    await page.fill('input[name="orderName"]', 'Draft Test Order');
    await page.fill('textarea[name="description"]', 'This order will be saved as draft');

    // Save draft
    await page.click('button:has-text("Save Draft")');
    await expect(page.getByText('Draft saved')).toBeVisible();

    // Navigate away
    await page.goto('/dashboard');

    // Return to new order page
    await page.goto('/orders/new');

    // Check if draft is loaded
    await expect(page.getByText('Draft loaded')).toBeVisible();
    await expect(page.locator('input[name="orderName"]')).toHaveValue('Draft Test Order');
  });

  test('Handle validation errors', async ({ page }) => {
    await page.goto('/orders/new');

    // Try to proceed without selection
    const nextButton = page.getByRole('button', { name: 'Next' });
    await expect(nextButton).toBeDisabled();

    // Select contract and proceed
    await page.click('[data-testid="contract-card-contract1"]');
    await page.click('button:has-text("Next")');

    // Try invalid order name
    await page.fill('input[name="orderName"]', 'ab'); // Too short
    await page.press('input[name="orderName"]', 'Tab');
    await expect(page.getByText('at least 3 characters')).toBeVisible();

    // Fix validation error
    await page.fill('input[name="orderName"]', 'Valid Order Name');
    await expect(page.getByText('at least 3 characters')).not.toBeVisible();

    // Try invalid date relationship
    const today = new Date();
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);
    
    await page.fill('input[name="startDate"]', today.toISOString().split('T')[0]);
    await page.fill('input[name="endDate"]', yesterday.toISOString().split('T')[0]);
    await page.press('input[name="endDate"]', 'Tab');
    
    await expect(page.getByText('End date must be after start date')).toBeVisible();
  });

  test('Navigate using keyboard only', async ({ page }) => {
    await page.goto('/orders/new');

    // Tab to first contract
    await page.keyboard.press('Tab');
    await page.keyboard.press('Tab');
    
    // Select with Enter
    await page.keyboard.press('Enter');
    
    // Tab to Next button
    for (let i = 0; i < 3; i++) {
      await page.keyboard.press('Tab');
    }
    await page.keyboard.press('Enter');

    // Should be on step 2
    await expect(page.getByRole('heading', { name: 'Order Details' })).toBeVisible();

    // Navigate back with Shift+Tab
    await page.keyboard.press('Shift+Tab');
    await page.keyboard.press('Shift+Tab');
    await page.keyboard.press('Enter'); // Click Back

    // Should be back on step 1
    await expect(page.getByRole('heading', { name: 'Select Contract' })).toBeVisible();
  });

  test('Handle API errors gracefully', async ({ page }) => {
    // Mock API error
    await page.route('**/api/contracts', route => {
      route.fulfill({
        status: 500,
        contentType: 'application/json',
        body: JSON.stringify({
          detail: 'Internal server error',
          correlationId: 'error-123'
        })
      });
    });

    await page.goto('/orders/new');

    // Should show error message
    await expect(page.getByText('Failed to load contracts')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Retry' })).toBeVisible();

    // Mock successful retry
    await page.route('**/api/contracts', route => {
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify([
          {
            id: 'contract1',
            number: 'NEU001',
            name: 'Test Contract',
            client: 'Client A',
            status: 'active'
          }
        ])
      });
    });

    // Retry
    await page.click('button:has-text("Retry")');
    await expect(page.getByText('Test Contract')).toBeVisible();
  });

  test('Mobile responsive view', async ({ page }) => {
    // Set mobile viewport
    await page.setViewportSize({ width: 375, height: 667 });
    
    await page.goto('/orders/new');

    // Check mobile-specific UI adjustments
    await expect(page.getByRole('heading', { name: 'Select Contract' })).toBeVisible();
    
    // Progress indicator should be compact
    await expect(page.locator('.wizard-steps-mobile')).toBeVisible();
    
    // Cards should stack vertically
    const contractCards = await page.locator('[data-testid^="contract-card-"]').all();
    for (let i = 1; i < contractCards.length; i++) {
      const prevBox = await contractCards[i - 1].boundingBox();
      const currBox = await contractCards[i].boundingBox();
      expect(currBox!.y).toBeGreaterThan(prevBox!.y);
    }
  });

  test('Accessibility compliance', async ({ page }) => {
    await page.goto('/orders/new');

    // Check for skip link
    await page.keyboard.press('Tab');
    await expect(page.getByText('Skip to main content')).toBeFocused();

    // Check ARIA landmarks
    await expect(page.getByRole('navigation', { name: /Wizard Steps/i })).toBeVisible();
    await expect(page.getByRole('main')).toBeVisible();

    // Check form labels
    await page.click('[data-testid="contract-card-contract1"]');
    await page.click('button:has-text("Next")');

    const orderNameInput = page.locator('input[name="orderName"]');
    const labelFor = await orderNameInput.getAttribute('id');
    await expect(page.locator(`label[for="${labelFor}"]`)).toHaveText(/Order Name/);

    // Check required field indicators
    await expect(page.getByText('Order Name').locator('..').getByText('*')).toBeVisible();
  });

  test('Performance - form loads within 3 seconds', async ({ page }) => {
    const startTime = Date.now();
    
    await page.goto('/orders/new');
    await page.waitForSelector('[data-testid="contract-card-contract1"]');
    
    const loadTime = Date.now() - startTime;
    expect(loadTime).toBeLessThan(3000);
  });
});