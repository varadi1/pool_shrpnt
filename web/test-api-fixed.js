import { chromium } from 'playwright';

(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  
  console.log('🔍 Testing API Fixes\n');
  console.log('Testing: http://localhost:3003\n');
  
  // Capture network requests
  const apiErrors = [];
  page.on('response', async response => {
    const url = response.url();
    if (url.includes('/templates') && response.status() >= 400) {
      apiErrors.push({
        url: url,
        status: response.status(),
        statusText: response.statusText()
      });
    }
  });
  
  // Capture console errors
  const consoleErrors = [];
  page.on('console', msg => {
    if (msg.type() === 'error') {
      const text = msg.text();
      // Filter out known non-critical errors
      if (!text.includes('mergeClasses')) {
        consoleErrors.push(text);
      }
    }
  });
  
  // Navigate to the app
  await page.goto('http://localhost:3003');
  await page.waitForTimeout(3000);
  
  // Check API errors
  console.log('=== API Status ===');
  if (apiErrors.length === 0) {
    console.log('✅ No API errors detected');
  } else {
    console.log(`❌ Found ${apiErrors.length} API error(s):`);
    apiErrors.forEach(err => {
      console.log(`   ${err.status} ${err.statusText}: ${err.url}`);
    });
  }
  
  // Check console errors
  console.log('\n=== Console Errors ===');
  if (consoleErrors.length === 0) {
    console.log('✅ No console errors');
  } else {
    console.log(`❌ Found ${consoleErrors.length} console error(s):`);
    consoleErrors.forEach(err => {
      console.log(`   ${err}`);
    });
  }
  
  // Check if the app is rendering
  const bodyText = await page.textContent('body');
  const isRendering = bodyText && bodyText.trim().length > 50;
  
  console.log('\n=== Application Status ===');
  console.log(`Rendering: ${isRendering ? '✅ YES' : '❌ NO'}`);
  
  // Try to navigate to templates if logged in
  try {
    // Check if we can see any navigation links
    const hasNavigation = await page.locator('nav').count() > 0;
    if (hasNavigation) {
      console.log('Navigation found: ✅ YES');
    } else {
      console.log('Navigation found: ⚠️  NO (might need login)');
    }
  } catch (e) {
    console.log('Navigation check failed');
  }
  
  // Final summary
  console.log('\n' + '='.repeat(50));
  console.log('FINAL STATUS:');
  
  const allFixed = apiErrors.length === 0 && consoleErrors.length === 0 && isRendering;
  
  if (allFixed) {
    console.log('✅ All API errors fixed! Application is working.');
  } else {
    console.log('⚠️  Some issues remain:');
    if (apiErrors.length > 0) console.log('  - API errors detected');
    if (consoleErrors.length > 0) console.log('  - Console errors detected');
    if (!isRendering) console.log('  - Application not rendering properly');
  }
  
  await browser.close();
  process.exit(allFixed ? 0 : 1);
})();