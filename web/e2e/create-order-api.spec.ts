import { test, expect } from '@playwright/test';

test('Create 5th order via API and verify in UI', async ({ page, request }) => {
  // Navigate to the app first
  await page.goto('http://localhost:3001');
  await page.waitForLoadState('networkidle');
  
  // Go to Orders page to count initial orders
  await page.getByRole('link', { name: /Megrendelések/i }).click();
  await page.waitForURL('**/orders');
  
  // Count initial orders
  const initialOrdersCount = await page.locator('table tbody tr').count();
  console.log(`Initial orders count: ${initialOrdersCount}`);
  
  // First, get contracts via API
  const contractsResponse = await request.get('http://localhost:8000/api/contracts', {
    headers: {
      'Authorization': 'Bearer mock-token'
    }
  });
  
  const contracts = await contractsResponse.json();
  console.log(`Found ${contracts.length} contracts`);
  
  if (contracts.length === 0) {
    // Create a contract first
    const newContract = await request.post('http://localhost:8000/api/contracts', {
      headers: {
        'Authorization': 'Bearer mock-token',
        'Content-Type': 'application/json'
      },
      data: {
        contract_number: `C-2025-PLAYWRIGHT-${Date.now()}`,
        name: 'Playwright Test Contract for Order',
        description: 'Contract created for order test',
        start_date: new Date().toISOString(),
        end_date: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString(),
        status: 'active'
      }
    });
    
    const createdContract = await newContract.json();
    contracts.push(createdContract);
    console.log('Created new contract:', createdContract);
  }
  
  // Use the first available contract
  const contractToUse = contracts[0];
  console.log('Using contract:', contractToUse);
  
  // Create order via API
  const orderData = {
    contract_id: contractToUse.id,
    name: `Playwright Order #5 - ${new Date().toLocaleString('hu-HU')}`,
    code: `ORD-2025-PW-${Date.now()}`,
    description: 'Ez az 5. megrendelés - Playwright API teszt',
    start_date: new Date().toISOString(),
    end_date: new Date(Date.now() + 90 * 24 * 60 * 60 * 1000).toISOString(),
    status: 'active',
    order_type: 'standard',
    parts: [
      {
        name: 'Part 1',
        type: 'design',
        deadline: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString()
      }
    ],
    metadata: {
      created_by: 'Playwright Test',
      created_at: new Date().toISOString()
    }
  };
  
  console.log('Creating order with data:', orderData);
  
  const orderResponse = await request.post('http://localhost:8000/api/orders', {
    headers: {
      'Authorization': 'Bearer mock-token',
      'Content-Type': 'application/json'
    },
    data: orderData
  });
  
  expect(orderResponse.ok()).toBeTruthy();
  const createdOrder = await orderResponse.json();
  console.log('Created order:', createdOrder);
  
  // Refresh the orders page to see the new order
  await page.reload();
  await page.waitForLoadState('networkidle');
  await page.waitForTimeout(2000);
  
  // Count orders after creation
  const finalOrdersCount = await page.locator('table tbody tr').count();
  console.log(`Final orders count: ${finalOrdersCount}`);
  
  // Verify we have at least 5 orders now
  expect(finalOrdersCount).toBeGreaterThanOrEqual(5);
  
  // Try to find the newly created order in the table
  const newOrderRow = page.locator('table tbody tr').filter({ 
    hasText: orderData.name.substring(0, 20) // Use partial match due to truncation
  });
  
  if (await newOrderRow.count() > 0) {
    console.log('✅ New order found in the table!');
    await expect(newOrderRow).toBeVisible();
  } else {
    // Alternative: just check if we have more orders than before
    expect(finalOrdersCount).toBeGreaterThan(initialOrdersCount);
    console.log('✅ Order count increased, new order created successfully!');
  }
  
  // Take a screenshot of the final state
  await page.screenshot({ path: 'test-results/5th-order-created.png', fullPage: true });
  
  console.log(`🎉 Successfully created the 5th order! Total orders: ${finalOrdersCount}`);
});