import { test, expect } from '@playwright/test';

test.describe('Template Manager Basic Tests', () => {
  test('should load templates page without errors', async ({ page }) => {
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
    
    // Collect console errors
    const consoleErrors: string[] = [];
    page.on('console', msg => {
      if (msg.type() === 'error') {
        consoleErrors.push(msg.text());
      }
    });
    
    // Navigate to templates page (using the correct port)
    await page.goto('http://localhost:3004/templates');
    
    // Wait for the page to load
    await page.waitForSelector('h1:has-text("Template Manager")', { timeout: 10000 });
    
    // Check that no 404 errors occurred
    const apiErrors = consoleErrors.filter(err => 
      err.includes('404') || 
      err.includes('Not Found') || 
      err.includes('templates/?')
    );
    
    expect(apiErrors).toHaveLength(0);
    
    // Check that the page loaded correctly
    await expect(page.locator('h1')).toContainText('Template Manager');
    
    // Check that Create Template button exists
    const createButton = page.getByRole('button', { name: /Create Template/i });
    await expect(createButton).toBeVisible();
    
    // Click create button and verify navigation
    await createButton.click();
    await expect(page.url()).toContain('/templates/new');
    
    // Verify template editor page loaded
    await expect(page.locator('h1')).toContainText('Create Template');
  });
});