import { test, expect } from '@playwright/test';

test.describe('Authentication Flow', () => {
  test.beforeEach(async ({ page }) => {
    // Enable E2E auth mock mode
    await page.addInitScript(() => {
      (window as any).__MSAL_MOCK__ = true;
      // Provide a mock account snapshot similar to our hook
      window.sessionStorage.setItem('mock-account', JSON.stringify({
        username: 'test@example.com',
        name: 'Test User',
        idTokenClaims: { roles: ['NEU_Admin'] },
      }));
    });
    
    // Navigate to the application
    await page.goto('/');
  });

  test.skip('should redirect unauthenticated users to login', async ({ page }) => {
    // Skip this test as it requires real Azure AD
    // Should redirect to Azure AD login
    await expect(page).toHaveURL(/login\.microsoftonline\.com/);
  });

  test('should allow authenticated users to access dashboard', async ({ page }) => {
    // Mock authentication for testing
    await page.addInitScript(() => {
      window.sessionStorage.setItem('msal.token.keys', JSON.stringify(['mock-token']));
      window.sessionStorage.setItem('msal.account.keys', JSON.stringify(['mock-account']));
      window.sessionStorage.setItem('mock-account', JSON.stringify({
        username: 'test@example.com',
        name: 'Test User',
        idTokenClaims: {
          roles: ['NEU_Admin']
        }
      }));
    });

    await page.goto('/dashboard');
    
    // Should see dashboard content
    await expect(page.locator('h1')).toContainText('Dashboard');
    await expect(page.locator('[role="region"][aria-label="Key metrics"]')).toBeVisible();
  });

  test('should display user profile information', async ({ page }) => {
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

    await page.goto('/dashboard');
    
    // Check user profile display
    const userProfile = page.locator('[data-testid="user-profile"]');
    await expect(userProfile).toBeVisible();
    await expect(userProfile).toContainText('Admin User');
  });

  test('should handle logout correctly', async ({ page }) => {
    // Mock authentication
    await page.addInitScript(() => {
      window.sessionStorage.setItem('mock-account', JSON.stringify({
        username: 'test@example.com',
        name: 'Test User',
        idTokenClaims: {
          roles: ['NEU_Admin']
        }
      }));
    });

    await page.goto('/dashboard');
    
    // Click user profile
    await page.click('[data-testid="user-profile"]');
    
    // Click logout
    await page.click('text=Sign out');
    
    // Confirm logout
    await page.click('button:has-text("Sign out")');
    
    // Should redirect to login
    await expect(page).toHaveURL(/login/);
  });

  test('should refresh token automatically', async ({ page }) => {
    // Mock authentication with expiring token
    await page.addInitScript(() => {
      const expiredToken = {
        expiresOn: new Date(Date.now() + 5000).toISOString(), // Expires in 5 seconds
        accessToken: 'mock-token'
      };
      window.sessionStorage.setItem('msal.token', JSON.stringify(expiredToken));
    });

    await page.goto('/dashboard');
    
    // Wait for token to expire
    await page.waitForTimeout(6000);
    
    // Make an API call (should trigger token refresh)
    await page.reload();
    
    // Should still be on dashboard (token refreshed)
    await expect(page.locator('h1')).toContainText('Dashboard');
  });
});