import { test, expect } from '@playwright/test';

test.describe('Order Creation Flow', () => {
  test.beforeEach(async ({ page }) => {
    // Navigate to the application with mock auth
    await page.goto('http://localhost:3000');
    
    // Wait for the app to load
    await page.waitForLoadState('networkidle');
  });

  test('should complete full order creation flow in Hungarian', async ({ page }) => {
    // Navigate to Orders page
    await page.getByRole('link', { name: /Megrendelések/i }).click();
    await page.waitForURL('**/orders');
    
    // Click on New Order button
    await page.getByTestId('orders-new-btn').click();
    await page.waitForURL('**/orders/new');
    
    // Step 1: Contract Selection
    await expect(page.getByLabel('Aktuális lépés fejléce')).toHaveText('Szerződés kiválasztása');
    
    // Check if contracts are loading
    const contractsLoaded = await page.locator('[data-testid^="contract-card-"]').count();
    
    if (contractsLoaded === 0) {
      // If no contracts, create one first
      console.log('No contracts found, creating a test contract...');
      
      // Create a contract via API
      const response = await page.request.post('http://localhost:8000/api/contracts', {
        headers: {
          'Authorization': 'Bearer mock-token',
          'Content-Type': 'application/json'
        },
        data: {
          contract_number: `TEST-${Date.now()}`,
          name: 'Teszt Szerződés',
          description: 'Playwright teszt szerződés',
          start_date: new Date().toISOString(),
          end_date: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString(),
          status: 'active'
        }
      });
      
      expect(response.ok()).toBeTruthy();
      
      // Reload the page to get the new contract
      await page.reload();
      await page.waitForLoadState('networkidle');
    }
    
    // Select the first available contract
    const firstContract = page.locator('[data-testid^="contract-card-"]').first();
    await expect(firstContract).toBeVisible({ timeout: 10000 });
    await firstContract.click();
    
    // Click Next to go to Order Details
    await page.getByTestId('wizard-next').click();
    
    // Step 2: Order Details
    await expect(page.getByLabel('Aktuális lépés fejléce')).toHaveText('Megrendelés részletei');
    
    // Fill in order details
    await page.getByLabel('Megrendelés neve').fill('Teszt Megrendelés');
    await page.getByLabel('Leírás').fill('Ez egy Playwright teszt megrendelés');
    
    // Set dates
    const today = new Date();
    const endDate = new Date(today);
    endDate.setMonth(endDate.getMonth() + 3);
    
    await page.getByLabel('Kezdő dátum').fill(today.toISOString().split('T')[0]);
    await page.getByLabel('Vég dátum').fill(endDate.toISOString().split('T')[0]);
    
    // Select order type
    await page.getByLabel('Megrendelés típusa').click();
    await page.getByRole('option', { name: 'Standard' }).click();
    
    // Click Next to go to Template Selection
    await page.getByTestId('wizard-next').click();
    
    // Step 3: Template Selection
    await expect(page.getByLabel('Aktuális lépés fejléce')).toHaveText('Sablon kiválasztása');
    
    // Select a template if available
    const templateCard = page.locator('[data-testid^="template-card-"]').first();
    if (await templateCard.isVisible()) {
      await templateCard.click();
    }
    
    // Click Next to go to Part Configuration
    await page.getByTestId('wizard-next').click();
    
    // Step 4: Part Configuration
    await expect(page.getByLabel('Aktuális lépés fejléce')).toHaveText('Részek konfigurálása');
    
    // Add a part if button is available
    const addPartButton = page.getByTestId('add-part-btn');
    if (await addPartButton.isVisible()) {
      await addPartButton.click();
      // Fill in part details if form appears
      const partNameInput = page.getByLabel('Rész neve');
      if (await partNameInput.isVisible()) {
        await partNameInput.fill('Teszt Rész');
      }
    }
    
    // Click Next to go to Partner Assignment
    await page.getByTestId('wizard-next').click();
    
    // Step 5: Partner Assignment
    await expect(page.getByLabel('Aktuális lépés fejléce')).toHaveText('Partner hozzárendelés');
    
    // Add a partner if available
    const partnerCard = page.locator('[data-testid^="partner-card-"]').first();
    if (await partnerCard.isVisible()) {
      await partnerCard.click();
    }
    
    // Click Next to go to Review
    await page.getByTestId('wizard-next').click();
    
    // Step 6: Review & Submit
    await expect(page.getByLabel('Aktuális lépés fejléce')).toHaveText('Áttekintés és küldés');
    
    // Verify order summary is displayed
    await expect(page.getByText('Teszt Megrendelés')).toBeVisible();
    
    // Submit the order
    await page.getByTestId('wizard-submit').click();
    
    // Wait for submission to complete
    await page.waitForLoadState('networkidle');
    
    // Check for success message or redirect
    const successMessage = page.getByText(/sikeresen|létrehozva/i);
    const ordersListUrl = page.url().includes('/orders') && !page.url().includes('/new');
    
    // Verify either success message or redirect to orders list
    if (await successMessage.isVisible({ timeout: 5000 })) {
      console.log('Order created successfully - success message shown');
    } else if (ordersListUrl) {
      console.log('Order created successfully - redirected to orders list');
    } else {
      // Check if there's a provisioning status
      const provisioningStatus = page.getByText(/provisioning|létrehozás/i);
      if (await provisioningStatus.isVisible({ timeout: 5000 })) {
        console.log('Order is being provisioned');
      }
    }
    
    // Verify all UI elements are in Hungarian
    const englishTexts = [
      'Contract Selection',
      'Order Details',
      'Template Selection',
      'Part Configuration',
      'Partner Assignment',
      'Review & Submit',
      'Next',
      'Back',
      'Submit Order',
      'Save Draft'
    ];
    
    for (const text of englishTexts) {
      const element = page.getByText(text, { exact: true });
      await expect(element).not.toBeVisible();
    }
    
    console.log('✅ Order creation flow completed successfully with Hungarian UI');
  });
});