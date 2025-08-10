import { chromium } from 'playwright';

(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  
  // Capture console messages
  const consoleMessages = [];
  page.on('console', msg => {
    consoleMessages.push({
      type: msg.type(),
      text: msg.text(),
      location: msg.location()
    });
  });

  // Capture page errors
  const pageErrors = [];
  page.on('pageerror', error => {
    pageErrors.push(error.message);
  });

  // Navigate to the app
  console.log('🔍 Testing http://localhost:3003...\n');
  await page.goto('http://localhost:3003');
  
  // Wait for the page to load
  await page.waitForTimeout(3000);
  
  // Print all errors
  console.log('=== Console Errors ===');
  const errors = consoleMessages.filter(msg => msg.type === 'error');
  if (errors.length === 0) {
    console.log('✅ No console errors found');
  } else {
    errors.forEach(msg => {
      console.log(`❌ ERROR: ${msg.text}`);
      if (msg.location?.url) {
        console.log(`   Location: ${msg.location.url}:${msg.location.lineNumber}`);
      }
    });
  }
  
  console.log('\n=== Page Errors ===');
  if (pageErrors.length === 0) {
    console.log('✅ No page errors found');
  } else {
    pageErrors.forEach(error => {
      console.log(`❌ ERROR: ${error}`);
    });
  }
  
  // Check for specific errors
  console.log('\n=== Specific Checks ===');
  const hasMessageBarTypeError = errors.some(
    msg => msg.text.includes('MessageBarType')
  );
  
  if (hasMessageBarTypeError) {
    console.log('❌ MessageBarType error found!');
  } else {
    console.log('✅ No MessageBarType error');
  }
  
  const hasImportError = errors.some(
    msg => msg.text.includes('does not provide an export')
  );
  
  if (hasImportError) {
    console.log('❌ Import/export errors found!');
  } else {
    console.log('✅ No import/export errors');
  }
  
  // Check page content
  console.log('\n=== Page Content ===');
  const title = await page.title();
  console.log(`Page title: ${title}`);
  
  // Try to find main content
  const bodyText = await page.textContent('body');
  if (bodyText?.includes('Dashboard') || bodyText?.includes('Sign in')) {
    console.log('✅ App appears to be loading correctly');
  } else if (bodyText?.trim().length < 50) {
    console.log('⚠️  Page might not be rendering properly');
  }
  
  // Summary
  console.log('\n=== Summary ===');
  const totalErrors = errors.length + pageErrors.length;
  if (totalErrors === 0) {
    console.log('✅ All checks passed! No errors detected.');
  } else {
    console.log(`❌ Found ${totalErrors} error(s). Please review above.`);
  }
  
  await browser.close();
  process.exit(totalErrors > 0 ? 1 : 0);
})();