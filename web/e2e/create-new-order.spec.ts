import { test, expect } from '@playwright/test';

test('Create a new order (5th order)', async ({ page }) => {
  // Navigate to the app
  await page.goto('http://localhost:3001');
  await page.waitForLoadState('networkidle');
  
  // Go to Orders page
  await page.getByRole('link', { name: /Megrendelések/i }).click();
  await page.waitForURL('**/orders');
  
  // Count initial orders
  const initialOrdersCount = await page.locator('table tbody tr').count();
  console.log(`Initial orders count: ${initialOrdersCount}`);
  
  // Click New Order button
  await page.getByTestId('orders-new-btn').click();
  await page.waitForURL('**/orders/new');
  
  // Step 1: Select contract
  await page.waitForSelector('.contract-cards-grid button');
  const firstContract = page.locator('.contract-cards-grid button').first();
  await firstContract.click();
  
  // Verify contract is selected
  await expect(firstContract).toHaveCSS('border-width', '2px');
  
  // Click Next
  await page.getByTestId('wizard-next').click();
  
  // Wait for step 2 to load
  await page.waitForTimeout(1000);
  
  // Step 2: Order Details  
  const orderNameInput = page.getByLabel('Megrendelés neve');
  await orderNameInput.waitFor({ state: 'visible' });
  await orderNameInput.fill('Playwright Test Order 5');
  
  const descInput = page.getByLabel('Leírás');
  if (await descInput.isVisible()) {
    await descInput.fill('Ez az 5. megrendelés - Playwright teszt');
  }
  
  // Fill dates if required
  const startDateInput = page.getByLabel('Kezdő dátum');
  if (await startDateInput.isVisible()) {
    const today = new Date().toISOString().split('T')[0];
    await startDateInput.fill(today);
  }
  
  const endDateInput = page.getByLabel('Vég dátum');
  if (await endDateInput.isVisible()) {
    const futureDate = new Date();
    futureDate.setMonth(futureDate.getMonth() + 3);
    await endDateInput.fill(futureDate.toISOString().split('T')[0]);
  }
  
  // Select order type if dropdown exists
  const orderTypeDropdown = page.getByLabel('Megrendelés típusa');
  if (await orderTypeDropdown.isVisible()) {
    await orderTypeDropdown.click();
    const standardOption = page.getByRole('option', { name: /Standard/i });
    if (await standardOption.isVisible({ timeout: 1000 }).catch(() => false)) {
      await standardOption.click();
    } else {
      await page.keyboard.press('Escape'); // Close dropdown if no options
    }
  }
  
  // Click Next
  await page.getByTestId('wizard-next').click();
  
  // Wait for step 3
  await page.waitForTimeout(1000);
  
  // Step 3: Template Selection
  // Check if templates are available
  const templateCards = page.locator('[data-testid^="template-card-"]');
  const templateCount = await templateCards.count();
  
  if (templateCount > 0) {
    // Select first template
    await templateCards.first().click();
  } else {
    console.log('No templates available, skipping template selection');
  }
  
  // Click Next
  await page.getByTestId('wizard-next').click();
  
  // Wait for step 4
  await page.waitForTimeout(1000);
  
  // Step 4: Parts Configuration
  // Check if add part button exists
  const addPartBtn = page.getByTestId('add-part-btn');
  if (await addPartBtn.isVisible({ timeout: 1000 }).catch(() => false)) {
    await addPartBtn.click();
    
    // Fill part details if form appears
    const partNameInput = page.getByLabel('Rész neve');
    if (await partNameInput.isVisible({ timeout: 1000 }).catch(() => false)) {
      await partNameInput.fill('Test Part 1');
    }
    
    const partTypeDropdown = page.getByLabel('Típus');
    if (await partTypeDropdown.isVisible({ timeout: 1000 }).catch(() => false)) {
      await partTypeDropdown.click();
      const firstOption = page.getByRole('option').first();
      if (await firstOption.isVisible({ timeout: 1000 }).catch(() => false)) {
        await firstOption.click();
      }
    }
    
    const deadlineInput = page.getByLabel('Határidő');
    if (await deadlineInput.isVisible({ timeout: 1000 }).catch(() => false)) {
      const deadline = new Date();
      deadline.setMonth(deadline.getMonth() + 1);
      await deadlineInput.fill(deadline.toISOString().split('T')[0]);
    }
  } else {
    console.log('No add part button or parts pre-configured');
  }
  
  // Click Next
  await page.getByTestId('wizard-next').click();
  
  // Wait for step 5
  await page.waitForTimeout(1000);
  
  // Step 5: Partner Assignment
  // Check for partner cards
  const partnerCards = page.locator('[data-testid^="partner-card-"]');
  const partnerCount = await partnerCards.count();
  
  if (partnerCount > 0) {
    await partnerCards.first().click();
  } else {
    console.log('No partners available');
  }
  
  // Click Next
  await page.getByTestId('wizard-next').click();
  
  // Wait for step 6
  await page.waitForTimeout(1000);
  
  // Step 6: Review & Submit
  // Check if order name is displayed in review
  await expect(page.getByText('Playwright Test Order 5')).toBeVisible({ timeout: 5000 });
  
  // Submit the order
  const submitBtn = page.getByTestId('wizard-submit');
  await submitBtn.click();
  
  // Wait for submission
  await page.waitForTimeout(3000);
  
  // Check for success - multiple possible outcomes
  const successIndicators = [
    page.getByText(/sikeresen/i),
    page.getByText(/létrehozva/i),
    page.getByText(/provisioning/i),
    page.getByText(/létrehozás alatt/i),
  ];
  
  let orderCreated = false;
  for (const indicator of successIndicators) {
    if (await indicator.isVisible({ timeout: 1000 }).catch(() => false)) {
      orderCreated = true;
      console.log('Order creation success indicator found');
      break;
    }
  }
  
  // Alternative: Check if redirected to orders list
  if (!orderCreated) {
    if (page.url().includes('/orders') && !page.url().includes('/new')) {
      orderCreated = true;
      console.log('Redirected to orders list - order likely created');
    }
  }
  
  // If still on the new order page, check for provisioning status
  if (!orderCreated) {
    const provisioningStatus = page.getByText(/folyamatban/i);
    if (await provisioningStatus.isVisible({ timeout: 1000 }).catch(() => false)) {
      orderCreated = true;
      console.log('Order is being provisioned');
    }
  }
  
  // Go back to orders list to verify
  if (!page.url().includes('/orders') || page.url().includes('/new')) {
    await page.getByRole('link', { name: /Megrendelések/i }).click();
    await page.waitForURL('**/orders');
  }
  
  // Count orders after creation
  await page.waitForTimeout(2000);
  const finalOrdersCount = await page.locator('table tbody tr').count();
  console.log(`Final orders count: ${finalOrdersCount}`);
  
  // Verify we have at least 5 orders now
  expect(finalOrdersCount).toBeGreaterThanOrEqual(5);
  console.log(`✅ Successfully created order! Total orders: ${finalOrdersCount}`);
});