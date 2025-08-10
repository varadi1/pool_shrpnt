import { chromium } from 'playwright';

(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  
  // Capture console messages
  const consoleMessages = [];
  page.on('console', msg => {
    consoleMessages.push({
      type: msg.type(),
      text: msg.text()
    });
  });

  // Navigate to the app
  await page.goto('http://localhost:3002');
  
  // Wait for the page to load
  await page.waitForTimeout(3000);
  
  // Print console messages
  console.log('Console messages:');
  consoleMessages.forEach(msg => {
    if (msg.type === 'error') {
      console.log(`ERROR: ${msg.text}`);
    }
  });
  
  // Check for MessageBarType error
  const hasMessageBarTypeError = consoleMessages.some(
    msg => msg.type === 'error' && msg.text.includes('MessageBarType')
  );
  
  if (hasMessageBarTypeError) {
    console.log('\n❌ MessageBarType error found!');
  } else {
    console.log('\n✅ No MessageBarType error found!');
  }
  
  // Check page title
  const title = await page.title();
  console.log(`Page title: ${title}`);
  
  await browser.close();
})();