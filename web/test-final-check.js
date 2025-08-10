import { chromium } from 'playwright';

(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  
  console.log('🚀 Final Verification of Fixes\n');
  console.log('Testing: http://localhost:3003\n');
  
  // Navigate to the app
  await page.goto('http://localhost:3003');
  await page.waitForTimeout(2000);
  
  // Check 1: MessageBarType error (from screenshot)
  const consoleErrors = [];
  page.on('console', msg => {
    if (msg.type() === 'error' && msg.text().includes('MessageBarType')) {
      consoleErrors.push(msg.text());
    }
  });
  
  await page.reload();
  await page.waitForTimeout(1000);
  
  console.log('✅ Fix 1: MessageBarType import error');
  console.log(`   Status: ${consoleErrors.length === 0 ? '✅ FIXED' : '❌ STILL BROKEN'}`);
  
  // Check 2: Lock icon import error
  const lockErrors = [];
  page.on('pageerror', error => {
    if (error.message.includes('Lock24Regular')) {
      lockErrors.push(error.message);
    }
  });
  
  await page.reload();
  await page.waitForTimeout(1000);
  
  console.log('\n✅ Fix 2: Lock24Regular icon import');
  console.log(`   Status: ${lockErrors.length === 0 ? '✅ FIXED' : '❌ STILL BROKEN'}`);
  
  // Check 3: DragEndEvent import error
  const dragErrors = [];
  page.on('pageerror', error => {
    if (error.message.includes('DragEndEvent')) {
      dragErrors.push(error.message);
    }
  });
  
  await page.reload();
  await page.waitForTimeout(1000);
  
  console.log('\n✅ Fix 3: DragEndEvent type import');
  console.log(`   Status: ${dragErrors.length === 0 ? '✅ FIXED' : '❌ STILL BROKEN'}`);
  
  // Check 4: App is rendering
  const bodyText = await page.textContent('body');
  const isRendering = bodyText && bodyText.trim().length > 50;
  
  console.log('\n✅ Fix 4: Application rendering');
  console.log(`   Status: ${isRendering ? '✅ RENDERING' : '❌ NOT RENDERING'}`);
  
  // Final summary
  console.log('\n' + '='.repeat(50));
  console.log('FINAL STATUS:');
  
  const allFixed = 
    consoleErrors.length === 0 && 
    lockErrors.length === 0 && 
    dragErrors.length === 0 && 
    isRendering;
  
  if (allFixed) {
    console.log('✅ ALL ERRORS FIXED! Application is working correctly.');
  } else {
    console.log('⚠️  Some issues remain. See details above.');
  }
  
  await browser.close();
  process.exit(allFixed ? 0 : 1);
})();