import { test, expect } from '@playwright/test';

test.describe('Template Manager', () => {
  test.beforeEach(async ({ page }) => {
    // Mock authentication
    await page.addInitScript(() => {
      const mockUser = {
        name: 'Test Admin',
        email: 'admin@test.com',
        roles: ['NEU_Admin'],
      };
      
      window.sessionStorage.setItem('access_token', 'mock-token');
      window.sessionStorage.setItem('user', JSON.stringify(mockUser));
    });
    
    // Navigate to templates page
    await page.goto('http://localhost:5173/templates');
  });

  test('should display template list page', async ({ page }) => {
    // Wait for the page to load
    await page.waitForSelector('text=Template Manager', { timeout: 10000 });
    
    // Check that the page title is displayed
    await expect(page.getByText('Template Manager')).toBeVisible();
    
    // Check that the create button is visible
    await expect(page.getByRole('button', { name: /Create Template/i })).toBeVisible();
  });

  test('should display template cards', async ({ page }) => {
    // Wait for template cards to load
    await page.waitForSelector('[data-testid="template-card"]', { timeout: 10000 });
    
    // Check that at least one template card is displayed
    const templateCards = page.locator('[data-testid="template-card"]');
    await expect(templateCards).toHaveCount(3); // Based on our mock data
    
    // Check first template card content
    const firstCard = templateCards.first();
    await expect(firstCard).toContainText('Standard Project Template');
    await expect(firstCard).toContainText('Default template for standard projects');
  });

  test('should navigate to create template page', async ({ page }) => {
    // Click the create template button
    await page.getByRole('button', { name: /Create Template/i }).click();
    
    // Check that we navigated to the create page
    await expect(page.url()).toContain('/templates/new');
    
    // Check that the template editor is displayed
    await expect(page.getByText('Template Editor')).toBeVisible();
  });

  test('should display search and filter controls', async ({ page }) => {
    // Check search box is visible
    await expect(page.getByPlaceholder(/Search templates/i)).toBeVisible();
    
    // Check sort dropdown is visible
    await expect(page.getByRole('combobox', { name: /Sort by/i })).toBeVisible();
  });

  test('should handle template actions', async ({ page }) => {
    // Wait for template cards to load
    await page.waitForSelector('[data-testid="template-card"]', { timeout: 10000 });
    
    // Find the first template card
    const firstCard = page.locator('[data-testid="template-card"]').first();
    
    // Click the menu button
    await firstCard.locator('[data-testid="template-menu-button"]').click();
    
    // Check that menu options are visible
    await expect(page.getByRole('menuitem', { name: /View Details/i })).toBeVisible();
    await expect(page.getByRole('menuitem', { name: /Edit/i })).toBeVisible();
    await expect(page.getByRole('menuitem', { name: /View History/i })).toBeVisible();
    await expect(page.getByRole('menuitem', { name: /Clone/i })).toBeVisible();
    await expect(page.getByRole('menuitem', { name: /Delete/i })).toBeVisible();
  });

  test('should display status badges correctly', async ({ page }) => {
    // Wait for template cards to load
    await page.waitForSelector('[data-testid="template-card"]', { timeout: 10000 });
    
    // Check that status badges are displayed
    const activeBadge = page.locator('[data-testid="status-badge-active"]');
    const defaultBadge = page.locator('[data-testid="status-badge-default"]');
    
    await expect(activeBadge).toBeVisible();
    await expect(defaultBadge).toBeVisible();
  });

  test('should not show API errors in console', async ({ page }) => {
    // Collect console errors
    const consoleErrors: string[] = [];
    page.on('console', msg => {
      if (msg.type() === 'error') {
        consoleErrors.push(msg.text());
      }
    });
    
    // Wait for page to load
    await page.waitForSelector('text=Template Manager', { timeout: 10000 });
    
    // Give it a moment to settle
    await page.waitForTimeout(2000);
    
    // Check that there are no console errors related to API calls
    const apiErrors = consoleErrors.filter(err => 
      err.includes('404') || 
      err.includes('Not Found') || 
      err.includes('templates/?')
    );
    
    expect(apiErrors).toHaveLength(0);
  });

  test('should handle pagination controls', async ({ page }) => {
    // Wait for template cards to load
    await page.waitForSelector('[data-testid="template-card"]', { timeout: 10000 });
    
    // Check pagination info is displayed
    const paginationInfo = page.locator('text=/Showing.*of.*templates/i');
    await expect(paginationInfo).toBeVisible();
    
    // Check pagination buttons
    const prevButton = page.getByRole('button', { name: /Previous/i });
    const nextButton = page.getByRole('button', { name: /Next/i });
    
    await expect(prevButton).toBeVisible();
    await expect(prevButton).toBeDisabled(); // Should be disabled on first page
    await expect(nextButton).toBeVisible();
  });
});