import { test, expect } from '@playwright/test';

test('Verify 5th order exists in the system', async ({ page }) => {
  // Navigate to the app
  await page.goto('http://localhost:3001');
  
  // Go to Orders page
  await page.getByRole('link', { name: /Megrendelések/i }).click();
  await page.waitForURL('**/orders');
  
  // Wait for the table to load
  await page.waitForSelector('table tbody tr');
  
  // Count total orders
  const ordersCount = await page.locator('table tbody tr').count();
  console.log(`Total orders found: ${ordersCount}`);
  
  // Check that we have at least 5 orders
  expect(ordersCount).toBeGreaterThanOrEqual(5);
  
  // Look for the 5th order specifically
  const fifthOrderRow = page.locator('table tbody tr').filter({ 
    hasText: 'EM-2025-PW-005' 
  });
  
  // Verify the 5th order exists
  await expect(fifthOrderRow).toBeVisible();
  
  // Verify the details of the 5th order
  const orderCode = await fifthOrderRow.locator('td').first().textContent();
  expect(orderCode).toContain('EM-2025-PW-005');
  
  const orderName = await fifthOrderRow.locator('td').nth(1).textContent();
  expect(orderName).toContain('Playwright Test Order #5');
  
  const contractName = await fifthOrderRow.locator('td').nth(2).textContent();
  expect(contractName).toContain('Automated Test Contract');
  
  const status = await fifthOrderRow.locator('td').nth(3).textContent();
  expect(status).toContain('Aktív');
  
  const partsCount = await fifthOrderRow.locator('td').nth(6).textContent();
  expect(partsCount).toContain('2 rész');
  
  // Take a screenshot showing all 5 orders
  await page.screenshot({ 
    path: 'test-results/5-orders-verified.png', 
    fullPage: true 
  });
  
  console.log('✅ Successfully verified 5th order exists!');
  console.log(`✅ Total orders in system: ${ordersCount}`);
  console.log('✅ 5th order details:');
  console.log(`   - Code: ${orderCode}`);
  console.log(`   - Name: ${orderName}`);
  console.log(`   - Contract: ${contractName}`);
  console.log(`   - Status: ${status}`);
  console.log(`   - Parts: ${partsCount}`);
});