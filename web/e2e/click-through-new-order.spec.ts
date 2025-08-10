import { test, expect } from '@playwright/test';

test('Create 5th order by clicking through the entire wizard', async ({ page }) => {
  // Set up initial 4 orders in localStorage
  await page.goto('http://localhost:3001');
  await page.evaluate(() => {
    const initialOrders = [
      {
        id: '1',
        code: 'EM-2025-NEU001-001',
        name: 'Q1 Marketing Campaign',
        contractName: 'NEU Marketing 2025',
        status: 'active',
        createdDate: '2025-01-05',
        deadline: '2025-03-31',
        partsCount: 3
      },
      {
        id: '2',
        code: 'EM-2025-NEU002-001',
        name: 'Product Launch Materials',
        contractName: 'NEU Product Dev 2025',
        status: 'provisioning',
        createdDate: '2025-01-08',
        deadline: '2025-02-28',
        partsCount: 2
      },
      {
        id: '3',
        code: 'EM-2024-NEU001-042',
        name: 'Year-End Campaign',
        contractName: 'NEU Marketing 2024',
        status: 'completed',
        createdDate: '2024-11-15',
        deadline: '2024-12-31',
        partsCount: 3
      },
      {
        id: '4',
        code: 'EM-2025-NEU003-001',
        name: 'Training Materials',
        contractName: 'NEU Training Services',
        status: 'draft',
        createdDate: '2025-01-09',
        deadline: '2025-04-15',
        partsCount: 1
      }
    ];
    localStorage.setItem('orders-list', JSON.stringify(initialOrders));
  });
  
  // Navigate to the app again to load with localStorage
  await page.goto('http://localhost:3001');
  await page.waitForLoadState('networkidle');
  
  // Go to Orders page
  await page.getByRole('link', { name: /Megrendelések/i }).click();
  await page.waitForURL('**/orders');
  
  // Count initial orders - should be 4
  const initialOrdersCount = await page.locator('table tbody tr').count();
  console.log(`Initial orders count: ${initialOrdersCount}`);
  expect(initialOrdersCount).toBe(4);
  
  // Click New Order button
  await page.getByTestId('orders-new-btn').click();
  await page.waitForURL('**/orders/new');
  
  // Step 1: Contract Selection
  console.log('Step 1: Selecting contract...');
  await page.waitForSelector('.contract-cards-grid button', { timeout: 10000 });
  
  // Select the first contract
  const firstContract = page.locator('.contract-cards-grid button').first();
  await firstContract.click();
  
  // Click Next
  await page.getByTestId('wizard-next').click();
  await page.waitForTimeout(500);
  
  // Step 2: Order Details
  console.log('Step 2: Filling order details...');
  
  // Fill order name
  const orderNameField = page.getByLabel('Megrendelés neve');
  await orderNameField.waitFor({ state: 'visible', timeout: 5000 });
  await orderNameField.fill('Playwright 5th Order - Real Test');
  
  // Fill description if exists
  const descriptionField = page.getByLabel('Leírás');
  if (await descriptionField.isVisible({ timeout: 1000 }).catch(() => false)) {
    await descriptionField.fill('This is the 5th order created via Playwright clicking through the wizard');
  }
  
  // Fill dates
  const startDateField = page.getByLabel('Kezdő dátum');
  if (await startDateField.isVisible({ timeout: 1000 }).catch(() => false)) {
    const today = new Date();
    await startDateField.fill(today.toISOString().split('T')[0]);
  }
  
  const endDateField = page.getByLabel('Vég dátum');
  if (await endDateField.isVisible({ timeout: 1000 }).catch(() => false)) {
    const futureDate = new Date();
    futureDate.setMonth(futureDate.getMonth() + 3);
    await endDateField.fill(futureDate.toISOString().split('T')[0]);
  }
  
  // Select order type if dropdown exists
  const orderTypeDropdown = page.getByLabel('Megrendelés típusa');
  if (await orderTypeDropdown.isVisible({ timeout: 1000 }).catch(() => false)) {
    await orderTypeDropdown.click();
    // Try to select Standard option
    const standardOption = page.getByRole('option', { name: /Standard/i });
    if (await standardOption.isVisible({ timeout: 1000 }).catch(() => false)) {
      await standardOption.click();
    } else {
      await page.keyboard.press('Escape');
    }
  }
  
  // Click Next
  await page.getByTestId('wizard-next').click();
  await page.waitForTimeout(500);
  
  // Step 3: Template Selection
  console.log('Step 3: Template selection...');
  
  // Check if there are templates
  const templateCards = page.locator('[data-testid^="template-card-"]');
  const templateCount = await templateCards.count();
  
  if (templateCount > 0) {
    console.log(`Found ${templateCount} templates, selecting first one`);
    await templateCards.first().click();
  } else {
    console.log('No templates available, skipping');
  }
  
  // Click Next
  await page.getByTestId('wizard-next').click();
  await page.waitForTimeout(500);
  
  // Step 4: Parts Configuration
  console.log('Step 4: Parts configuration...');
  
  // Check if add part button exists
  const addPartBtn = page.getByTestId('add-part-btn');
  if (await addPartBtn.isVisible({ timeout: 1000 }).catch(() => false)) {
    await addPartBtn.click();
    
    // Fill part details
    const partNameField = page.getByLabel('Rész neve');
    if (await partNameField.isVisible({ timeout: 1000 }).catch(() => false)) {
      await partNameField.fill('Test Part 1');
    }
    
    const partTypeDropdown = page.getByLabel('Típus');
    if (await partTypeDropdown.isVisible({ timeout: 1000 }).catch(() => false)) {
      await partTypeDropdown.click();
      const firstOption = page.getByRole('option').first();
      if (await firstOption.isVisible({ timeout: 1000 }).catch(() => false)) {
        await firstOption.click();
      }
    }
    
    const deadlineField = page.getByLabel('Határidő');
    if (await deadlineField.isVisible({ timeout: 1000 }).catch(() => false)) {
      const deadline = new Date();
      deadline.setMonth(deadline.getMonth() + 1);
      await deadlineField.fill(deadline.toISOString().split('T')[0]);
    }
  } else {
    console.log('No add part button, parts might be optional');
  }
  
  // Click Next
  await page.getByTestId('wizard-next').click();
  await page.waitForTimeout(500);
  
  // Step 5: Partner Assignment
  console.log('Step 5: Partner assignment...');
  
  // Check for partner cards
  const partnerCards = page.locator('[data-testid^="partner-card-"]');
  const partnerCount = await partnerCards.count();
  
  if (partnerCount > 0) {
    console.log(`Found ${partnerCount} partners, selecting first one`);
    await partnerCards.first().click();
  } else {
    console.log('No partners available, skipping');
  }
  
  // Click Next
  await page.getByTestId('wizard-next').click();
  await page.waitForTimeout(500);
  
  // Step 6: Review & Submit
  console.log('Step 6: Review & Submit...');
  
  // Wait for review content to load
  await page.waitForTimeout(1000);
  
  // Check if our order name is displayed
  const orderNameInReview = page.getByText('Playwright 5th Order - Real Test');
  if (await orderNameInReview.isVisible({ timeout: 2000 }).catch(() => false)) {
    console.log('Order details confirmed in review');
  }
  
  // Check the confirmation checkbox first
  const confirmCheckbox = page.getByLabel(/confirm that all details are correct/i);
  if (await confirmCheckbox.isVisible({ timeout: 2000 }).catch(() => false)) {
    console.log('Found confirmation checkbox, clicking it');
    await confirmCheckbox.click();
  }
  
  // Try to find and click the submit button
  // First try the wizard submit button
  let submitBtn = page.getByTestId('wizard-submit');
  if (await submitBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
    console.log('Found wizard submit button');
    await submitBtn.click();
  } else {
    // Try the OrderReview's own submit button
    submitBtn = page.getByRole('button', { name: /Submit Order/i });
    if (await submitBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
      console.log('Found OrderReview submit button');
      await submitBtn.click();
    } else {
      // Try the Next button with submit label
      submitBtn = page.getByRole('button', { name: /Megrendelés küldése/i });
      if (await submitBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
        console.log('Found Hungarian submit button');
        await submitBtn.click();
      } else {
        throw new Error('No submit button found!');
      }
    }
  }
  
  console.log('Order submitted, waiting for response...');
  
  // Wait for submission to complete
  await page.waitForTimeout(3000);
  
  // Check for success indicators
  const successIndicators = [
    page.getByText(/sikeresen/i),
    page.getByText(/létrehozva/i),
    page.getByText(/provisioning/i),
    page.getByText(/létrehozás alatt/i),
  ];
  
  let orderCreated = false;
  for (const indicator of successIndicators) {
    if (await indicator.isVisible({ timeout: 2000 }).catch(() => false)) {
      orderCreated = true;
      console.log('Success indicator found!');
      break;
    }
  }
  
  // If no success message, check if redirected to orders list
  if (!orderCreated) {
    const currentUrl = page.url();
    if (currentUrl.includes('/orders') && !currentUrl.includes('/new')) {
      orderCreated = true;
      console.log('Redirected to orders list - order likely created');
    }
  }
  
  // Navigate back to orders list to verify
  if (!page.url().includes('/orders') || page.url().includes('/new')) {
    await page.getByRole('link', { name: /Megrendelések/i }).click();
    await page.waitForURL('**/orders');
  }
  
  // Wait for the table to update
  await page.waitForTimeout(2000);
  
  // Count final orders - should be 5 now
  const finalOrdersCount = await page.locator('table tbody tr').count();
  console.log(`Final orders count: ${finalOrdersCount}`);
  
  // VERIFY WE HAVE 5 ORDERS NOW
  expect(finalOrdersCount).toBe(5);
  
  // Take screenshot of the result
  await page.screenshot({ 
    path: 'test-results/5th-order-created-by-clicking.png', 
    fullPage: true 
  });
  
  console.log('✅ Successfully created the 5th order by clicking through the wizard!');
  console.log(`✅ Orders increased from ${initialOrdersCount} to ${finalOrdersCount}`);
});